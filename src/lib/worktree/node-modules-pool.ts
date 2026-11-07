/**
 * The `node_modules` pool: `.worktrees/_pool-<repository>-<n>/node_modules` with a `pool.json` beside it, at
 * most two entries per repository. A finished checkout parks its `node_modules` there (a rename), a new
 * checkout whose `package-lock.json` matches takes the newest one (a rename), so neither pays for a copy or a
 * delete. A `node_modules` is never shared: a take renames it away from the pool, a second taker finds it gone.
 */
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	renameSync,
	rmdirSync,
	rmSync,
	writeFileSync,
} from 'node:fs'
import { basename, join } from 'node:path'

import { checkNodeModules, lockHashOf } from './check-node-modules.ts'
import { relinkEscapingLinks } from './copy-node-modules.ts'
import { trashFolder } from './trash.ts'
import {
	DISCARDED_CACHES_PREFIX,
	PACKAGE_LOCK_FILE,
	POOL_ENTRIES_PER_REPOSITORY,
	POOL_ENTRY_PATTERN,
	POOL_FILE,
	POOL_FOLDER_PREFIX,
	POOL_REMOVED_CACHES,
} from './worktree.constants.ts'

import type { InterleavingSeam } from '../handover/handover.types.ts'
import type {
	BackgroundSpawner,
	ParkedNodeModules,
	PoolEntry,
	PoolEntryFile,
	PoolTake,
	NodeModulesCheck,
} from './worktree.types.ts'

/** Parks `worktree`'s `node_modules` in the pool of `worktreesFolder`, or says why it could not. */
export function parkNodeModules(params: {
	worktree: string
	/** The repository's main checkout. */
	repository: string
	worktreesFolder: string
	now: Date
	spawner: BackgroundSpawner
	/** Renames a folder (the tests stand in for it); default: `fs.renameSync`. */
	rename?: (params: { from: string; to: string }) => void
	/** Re-points the links leaving `node_modules` (the tests stand in for it); default: `relinkEscapingLinks`. */
	relink?: (params: { from: string; to: string }) => void
	/**
	 * A folder already on its way to removal (a trashed worktree, a rehearsal folder about to be trashed): the
	 * caches are renamed into it. None: each cache goes to the trash with its own background removal.
	 */
	discardInto?: string
	/**
	 * `node_modules` read against the lockfile before it moved (where a relative `file:` link still resolves);
	 * default: read now, in `worktree`.
	 */
	check?: NodeModulesCheck
	/**
	 * sha256 of the lockfile `check` was made against (`lockHashOf`, read with the check): the entry's stamp.
	 * None: the lockfile is read now.
	 */
	checkedLockHash?: string
}): ParkedNodeModules | string {
	const { worktree, worktreesFolder } = params
	const rename = params.rename ?? renameFolder
	const relink = params.relink ?? relinkEscapingLinks
	const source = join(worktree, 'node_modules')
	if (!existsSync(source)) return `${worktree} has no node_modules to park`
	// only a node_modules that holds what its lockfile locks is stamped with that lockfile's hash: the hash
	// the check was made against, whatever the lockfile holds now
	const lockHash = params.checkedLockHash ?? lockHashOf(worktree)
	const check = params.check ?? checkNodeModules({ worktree })
	if (lockHash === undefined)
		return `${worktree} has no ${PACKAGE_LOCK_FILE} its node_modules was checked against: not parked`
	if (check.notChecked || check.problems.length)
		return `${source} not parked: ${check.notChecked ?? `${check.problems.length} package(s) differ from ${PACKAGE_LOCK_FILE}`}`
	try {
		// in place, before the rename: a failure leaves no half-made pool entry
		relink({ from: source, to: source })
	} catch (error) {
		return `${source} not parked: ${(error as Error).message}`
	}
	const repository = basename(params.repository)
	const entry = createEntryFolder({ worktreesFolder, repository })
	const parked = join(worktreesFolder, entry, 'node_modules')
	try {
		rename({ from: source, to: parked })
	} catch (error) {
		rmdirSync(join(worktreesFolder, entry))
		const code = (error as NodeJS.ErrnoException).code
		return `${source} not parked: ${code === 'EXDEV' ? 'cross-device, the pool is on another file system' : (error as Error).message}`
	}
	discardCaches({
		parked,
		discardInto: params.discardInto,
		worktreesFolder,
		now: params.now,
		spawner: params.spawner,
	})
	const file: PoolEntryFile = { repository, lockHash, parkedAt: params.now.toISOString() }
	writeFileSync(join(worktreesFolder, entry, POOL_FILE), `${JSON.stringify(file, null, 2)}\n`)
	const trashed = newestFirst(
		listPoolEntries(worktreesFolder).filter((pooled) => pooled.file.repository === repository),
	)
		.slice(POOL_ENTRIES_PER_REPOSITORY)
		.map(function trash(pooled) {
			trashFolder({
				folder: join(worktreesFolder, pooled.name),
				worktreesFolder,
				now: params.now,
				spawner: params.spawner,
			})
			return pooled.name
		})
	return { entry, trashed }
}

/** Renames the newest pool entry of the repository whose lockfile hash equals `worktree`'s into it. */
export function takePooledNodeModules(params: {
	worktree: string
	/** The repository's main checkout. */
	repository: string
	worktreesFolder: string
	/** Renames a folder (the tests stand in for it); default: `fs.renameSync`. */
	rename?: (params: { from: string; to: string }) => void
	/** Called between the pick of an entry and its rename. */
	afterPick?: InterleavingSeam
}): PoolTake {
	const { worktree, worktreesFolder } = params
	const rename = params.rename ?? renameFolder
	const lockHash = lockHashOf(worktree)
	if (lockHash === undefined) return { notTaken: 'no match' }
	const repository = basename(params.repository)
	const matching = newestFirst(
		listPoolEntries(worktreesFolder).filter(
			(entry) => entry.file.repository === repository && entry.file.lockHash === lockHash,
		),
	)
	let takenByAnother = false
	for (const entry of matching) {
		params.afterPick?.()
		const folder = join(worktreesFolder, entry.name)
		try {
			rename({ from: join(folder, 'node_modules'), to: join(worktree, 'node_modules') })
		} catch (error) {
			const code = (error as NodeJS.ErrnoException).code
			if (code === 'EXDEV') return { notTaken: 'cross-device' }
			if (code !== 'ENOENT') throw error
			// another taker renamed it first: the next entry
			takenByAnother = true
			continue
		}
		// the entry is empty but for its pool.json: it goes (an eviction may have taken it meanwhile)
		rmSync(join(folder, POOL_FILE), { force: true })
		try {
			rmdirSync(folder)
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
		}
		return { taken: entry.name }
	}
	return { notTaken: takenByAnother ? 'taken by another' : 'no match' }
}

/** The pool entries of `worktreesFolder` whose `pool.json` reads, by name; none without the folder. */
export function listPoolEntries(worktreesFolder: string): PoolEntry[] {
	if (!existsSync(worktreesFolder)) return []
	return readdirSync(worktreesFolder)
		.filter((name) => POOL_ENTRY_PATTERN.test(name))
		.sort()
		.flatMap(function read(name): PoolEntry[] {
			try {
				const file = JSON.parse(
					readFileSync(join(worktreesFolder, name, POOL_FILE), 'utf8'),
				) as PoolEntryFile
				return typeof file.repository === 'string' &&
					typeof file.lockHash === 'string' &&
					typeof file.parkedAt === 'string'
					? [{ name, file }]
					: []
			} catch {
				// no pool.json yet (a park in progress) or one that does not parse: not an entry to take
				return []
			}
		})
}

/**
 * `.vite` and `.cache` out of a parked `node_modules`: renamed into `discardInto` when given (a folder already
 * on its way out), else each sent to the trash with its own background removal.
 */
function discardCaches(params: {
	parked: string
	discardInto: string | undefined
	worktreesFolder: string
	now: Date
	spawner: BackgroundSpawner
}): void {
	const caches = POOL_REMOVED_CACHES.map((cache) => join(params.parked, cache)).filter((cache) =>
		existsSync(cache),
	)
	if (caches.length === 0) return
	const bin = params.discardInto && mkdtempSync(join(params.discardInto, DISCARDED_CACHES_PREFIX))
	for (const cache of caches)
		if (bin) renameSync(cache, join(bin, basename(cache)))
		else
			trashFolder({
				folder: cache,
				worktreesFolder: params.worktreesFolder,
				now: params.now,
				spawner: params.spawner,
			})
}

/** The entries, the latest parked first. */
function newestFirst(entries: readonly PoolEntry[]): PoolEntry[] {
	return [...entries].sort((left, right) => right.file.parkedAt.localeCompare(left.file.parkedAt))
}

/** Makes `_pool-<repository>-<n>` with the next free number (never over another park's): its name. */
function createEntryFolder(params: { worktreesFolder: string; repository: string }): string {
	const numbers = readdirSync(params.worktreesFolder).flatMap(function numberOf(name) {
		const match = POOL_ENTRY_PATTERN.exec(name)
		return match && match[1] === params.repository ? [Number(match[2])] : []
	})
	for (let number = Math.max(0, ...numbers) + 1; ; number++) {
		const name = `${POOL_FOLDER_PREFIX}${params.repository}-${number}`
		try {
			mkdirSync(join(params.worktreesFolder, name))
			return name
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
		}
	}
}

function renameFolder(params: { from: string; to: string }): void {
	renameSync(params.from, params.to)
}
