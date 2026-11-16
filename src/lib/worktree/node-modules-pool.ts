/**
 * The `node_modules` pool: `.worktrees/_pool-<repository>-<n>/node_modules` with a `pool.json` beside it. A repository
 * keeps as many entries as it had lots open at once (at least 2, at most 8), at most 2 per lock key; parking past
 * either sends the oldest to the trash. A finished checkout parks its `node_modules` there (a rename), a new checkout
 * whose lock installs the same packages (its lock key, `computeLockKey`) takes one (a rename: its owner's first, else
 * the newest), else a near entry (the fewest packages off, at most `POOL_DRIFT_LIMIT`), so neither pays for a copy or
 * a delete. A `node_modules` is never shared: a take renames it away from the pool, a second taker finds it gone.
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

import { CARDS_LOG_FILE } from '../events/cards-log.constants.ts'
import { finalCardOf, readCardsLog } from '../events/cards-log.ts'
import { listLotIdentities, locateStore } from '../store/store-folder.ts'
import { readTransitions } from '../store/transitions.ts'
import { checkNodeModules } from './check-node-modules.ts'
import { relinkEscapingLinks } from './copy-node-modules.ts'
import { computeLockKey } from './lock-key.ts'
import { readLockedPackages } from './locked-packages.ts'
import { spawnDetached, trashFolder } from './trash.ts'
import {
	DISCARDED_CACHES_PREFIX,
	PACKAGE_LOCK_FILE,
	POOL_DRIFT_LIMIT,
	POOL_ENTRIES_CEILING,
	POOL_ENTRIES_FLOOR,
	POOL_ENTRIES_PER_KEY,
	POOL_ENTRY_PATTERN,
	POOL_FILE,
	POOL_FOLDER_PREFIX,
	POOL_MISS_BUSY,
	POOL_MISS_CROSS_DEVICE,
	POOL_MISS_EMPTY,
	POOL_MISS_KEY_LENGTH,
	POOL_MISS_NO_ENTRY,
	POOL_REMOVED_CACHES,
	TRASH_FOLDER,
} from './worktree.constants.ts'

import type { InterleavingSeam } from '../handover/handover.types.ts'
import type {
	BackgroundSpawner,
	CacheMiss,
	CacheRestore,
	CacheSave,
	DependencyCache,
	HeldCaches,
	LockfileEntry,
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
	 * The `package-lock.json` text `check` was made against (read with the check): the entry is stamped with its
	 * lock key and its packages. None: the lockfile on disk, read with the check.
	 */
	checkedLockText?: string
	/** Who parks it (a lot's owner), when known: written in the entry. */
	owner?: string
	/** How many entries the repository keeps (the tests set it); default: `readPoolCap` of the repository. */
	cap?: number
	/** Writes the entry's `pool.json` (the tests stand in for it); default: `fs.writeFileSync`. */
	writeFile?: (params: { path: string; text: string }) => void
}): ParkedNodeModules | string {
	const { worktree, worktreesFolder } = params
	const source = join(worktree, 'node_modules')
	if (!existsSync(source)) return `${worktree} has no node_modules to park`
	const checked = readParkableLock({
		worktree,
		check: params.check,
		checkedLockText: params.checkedLockText,
	})
	if ('refused' in checked) return checked.refused
	const { lockText } = checked
	const packages = lockedVersionsOf({ worktree, lockText })
	const repository = basename(params.repository)
	const file: PoolEntryFile = {
		repository,
		lockKey: computeLockKey({ text: lockText }),
		parkedAt: params.now.toISOString(),
		...(params.owner !== undefined && { owner: params.owner }),
		packages,
	}
	const entry = moveIntoPool({
		source,
		worktreesFolder,
		repository,
		rename: params.rename ?? renameFolder,
		relink: params.relink ?? relinkEscapingLinks,
		// never the worktree: a failure there would leave a folder in it nothing names
		holdIn: params.discardInto ?? makeTrashFolder(worktreesFolder),
		poolFileText: `${JSON.stringify(file, null, 2)}\n`,
		writeFile: params.writeFile ?? writeTextFile,
		now: params.now,
		spawner: params.spawner,
	})
	if ('refused' in entry) return entry.refused
	// the entry is whole from here: what fails after it is a note, never a throw nor a refusal
	const problems: string[] = []
	// a folder on its way out keeps the caches, else they go to the trash
	if (entry.held !== undefined && params.discardInto === undefined)
		try {
			trashHeldCaches({
				held: entry.held,
				worktreesFolder,
				now: params.now,
				spawner: params.spawner,
			})
		} catch (error) {
			problems.push(
				`the caches could not go to the trash (${entry.held.folder}): ${(error as Error).message}`,
			)
		}
	const evicted = trashPastCap({
		worktreesFolder,
		repository: params.repository,
		cap: params.cap,
		now: params.now,
		spawner: params.spawner,
	})
	problems.push(...evicted.problems)
	return {
		entry: entry.name,
		trashed: evicted.trashed,
		...(problems.length > 0 && { note: problems.join('; ') }),
	}
}

/** The workspace's `.worktrees/_trash/`, made when missing: a park's caches wait there, already on their way out. */
function makeTrashFolder(worktreesFolder: string): string {
	const trash = join(worktreesFolder, TRASH_FOLDER)
	mkdirSync(trash, { recursive: true })
	return trash
}

/**
 * The lock a park stamps (`checkedLockText`, else the lockfile on disk) once `node_modules` installs it (`check`, else
 * read now against it), or why the park is refused.
 */
function readParkableLock(params: {
	worktree: string
	check: NodeModulesCheck | undefined
	checkedLockText: string | undefined
}): { lockText: string } | { refused: string } {
	const { worktree } = params
	// only a node_modules that holds what its lock locks is stamped with that lock's key: the lock the check was
	// made against, whatever the lockfile holds now
	const lockText = params.checkedLockText ?? readPackageLockText({ worktree })
	if (lockText === undefined)
		return {
			refused: `${worktree} has no ${PACKAGE_LOCK_FILE} its node_modules was checked against: not parked`,
		}
	const check =
		params.check ??
		checkNodeModules({ worktree, ...(params.checkedLockText !== undefined && { lockText }) })
	if (check.notChecked || check.problems.length)
		return {
			refused: `${join(worktree, 'node_modules')} not parked: ${check.notChecked ?? `${check.problems.length} package(s) differ from ${PACKAGE_LOCK_FILE}`}`,
		}
	return { lockText }
}

/**
 * `source` renamed into a new `_pool-<repository>-<n>` entry folder with its `pool.json`: its leaving links re-pointed
 * and its caches renamed aside into `holdIn` first, in place, and `pool.json` written after. Any failure puts back what
 * moved (the caches into `source`, `source` into the worktree, the folder removed); a folder whose `node_modules` cannot
 * be renamed back goes to the trash, so no `_pool-*` folder is ever left without its `pool.json`. The entry's name and
 * the caches held, or why it was not moved.
 */
function moveIntoPool(params: {
	source: string
	worktreesFolder: string
	repository: string
	rename: (params: { from: string; to: string }) => void
	relink: (params: { from: string; to: string }) => void
	/** Where the caches wait, on the file system of `source`, until the park is sure. */
	holdIn: string
	poolFileText: string
	writeFile: (params: { path: string; text: string }) => void
	now: Date
	spawner: BackgroundSpawner
}): { name: string; held: HeldCaches | undefined } | { refused: string } {
	const { source, worktreesFolder } = params
	try {
		// in place, before the rename: a failure leaves no half-made pool entry
		params.relink({ from: source, to: source })
	} catch (error) {
		return { refused: `${source} not parked: ${(error as Error).message}` }
	}
	let held: HeldCaches | undefined
	let name: string
	try {
		held = holdCaches({ nodeModules: source, holdIn: params.holdIn })
		name = createEntryFolder({ worktreesFolder, repository: params.repository })
	} catch (error) {
		putCachesBack({ held, nodeModules: source })
		return { refused: `${source} not parked: ${(error as Error).message}` }
	}
	const folder = join(worktreesFolder, name)
	try {
		params.rename({ from: source, to: join(folder, 'node_modules') })
	} catch (error) {
		rmdirSync(folder)
		putCachesBack({ held, nodeModules: source })
		const code = (error as NodeJS.ErrnoException).code
		return {
			refused: `${source} not parked: ${code === 'EXDEV' ? 'cross-device, the pool is on another file system' : (error as Error).message}`,
		}
	}
	try {
		params.writeFile({ path: join(folder, POOL_FILE), text: params.poolFileText })
	} catch (error) {
		const undone = undoMove({ ...params, folder })
		const left = putCachesBack({ held, nodeModules: source })
		// node_modules did not come back: its caches leave with it
		if (left !== undefined) discardHeldCaches({ ...params, held: left })
		return { refused: `${source} not parked: ${(error as Error).message}; ${undone}` }
	}
	return { name, held }
}

/**
 * A move into `folder` whose `pool.json` failed, undone: `source` renamed back, the folder removed; a folder that cannot
 * be emptied or removed goes to the trash (a background removal), never left as a `_pool-*` folder without
 * `pool.json`. What became of `node_modules`.
 */
function undoMove(params: {
	source: string
	folder: string
	rename: (params: { from: string; to: string }) => void
	worktreesFolder: string
	now: Date
	spawner: BackgroundSpawner
}): string {
	let renamedBack = false
	try {
		// a partly written pool.json would make a half entry look whole
		rmSync(join(params.folder, POOL_FILE), { force: true })
		params.rename({ from: join(params.folder, 'node_modules'), to: params.source })
		renamedBack = true
		rmdirSync(params.folder)
		return 'node_modules renamed back'
	} catch (error) {
		const what = renamedBack ? 'node_modules renamed back, its emptied folder' : 'node_modules'
		try {
			const { trashed } = trashFolder({
				folder: params.folder,
				worktreesFolder: params.worktreesFolder,
				now: params.now,
				spawner: params.spawner,
			})
			return `${(error as Error).message}; ${what} sent to the trash: ${trashed}`
		} catch (trashError) {
			return `${(error as Error).message}; ${what} left in ${params.folder}: ${(trashError as Error).message}`
		}
	}
}

/**
 * `.vite` and `.cache` of `nodeModules` renamed into a new folder of `holdIn`: that folder and the names it holds, none
 * when there is no cache. A rename that fails puts back the ones already moved, then throws.
 */
function holdCaches(params: { nodeModules: string; holdIn: string }): HeldCaches | undefined {
	const names = POOL_REMOVED_CACHES.filter((cache) => existsSync(join(params.nodeModules, cache)))
	if (names.length === 0) return undefined
	const held: HeldCaches = {
		folder: mkdtempSync(join(params.holdIn, DISCARDED_CACHES_PREFIX)),
		names: [],
	}
	try {
		for (const cache of names) {
			renameSync(join(params.nodeModules, cache), join(held.folder, cache))
			held.names.push(cache)
		}
	} catch (error) {
		putCachesBack({ held, nodeModules: params.nodeModules })
		throw error
	}
	return held
}

/**
 * The held caches renamed back into `nodeModules` and their folder removed: what is still held when some cannot go
 * back (node_modules did not come back), undefined when nothing is.
 */
function putCachesBack(params: {
	held: HeldCaches | undefined
	nodeModules: string
}): HeldCaches | undefined {
	const { held } = params
	if (held === undefined) return undefined
	const back: string[] = []
	try {
		for (const cache of held.names) {
			renameSync(join(held.folder, cache), join(params.nodeModules, cache))
			back.push(cache)
		}
		rmdirSync(held.folder)
		return undefined
	} catch {
		// node_modules did not come back (its own rename back failed): the caches stay in their folder
		return { folder: held.folder, names: held.names.filter((cache) => !back.includes(cache)) }
	}
}

/** Held caches that cannot go back, sent to the trash; a failure leaves them in their folder, never in a worktree. */
function discardHeldCaches(params: {
	held: HeldCaches
	worktreesFolder: string
	now: Date
	spawner: BackgroundSpawner
}): void {
	try {
		trashHeldCaches(params)
	} catch {
		// the held folder stays where it is: under _trash/, or in the folder on its way out the park was given
	}
}

/** Each held cache sent to the trash with its own background removal, then their emptied folder removed. */
function trashHeldCaches(params: {
	held: HeldCaches
	worktreesFolder: string
	now: Date
	spawner: BackgroundSpawner
}): void {
	for (const cache of params.held.names)
		trashFolder({
			folder: join(params.held.folder, cache),
			worktreesFolder: params.worktreesFolder,
			now: params.now,
			spawner: params.spawner,
		})
	rmdirSync(params.held.folder)
}

function writeTextFile(params: { path: string; text: string }): void {
	writeFileSync(params.path, params.text)
}

/**
 * Sends to the trash, after a park, the repository's old-shape entries and the entries past the per-key limit and the
 * cap (`readPoolCap` when none is given): their names, one already gone (another park or take removed it) included,
 * and what could not go (a problem each), never a throw: the new entry is whole by then.
 */
function trashPastCap(params: {
	worktreesFolder: string
	/** The repository's main checkout. */
	repository: string
	cap: number | undefined
	now: Date
	spawner: BackgroundSpawner
}): { trashed: string[]; problems: string[] } {
	const { worktreesFolder } = params
	const repository = basename(params.repository)
	const evicted = evictedEntriesOf({
		entries: listPoolEntries(worktreesFolder).filter(
			(pooled) => pooled.file.repository === repository,
		),
		cap: params.cap ?? readPoolCap({ repository: params.repository }),
	})
	const trashed: string[] = []
	const problems: string[] = []
	for (const name of [...listOldShapeEntries({ worktreesFolder, repository }), ...evicted])
		try {
			trashFolder({
				folder: join(worktreesFolder, name),
				worktreesFolder,
				now: params.now,
				spawner: params.spawner,
			})
			trashed.push(name)
		} catch (error) {
			// another park or take removed it after the listing: already evicted
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') trashed.push(name)
			else problems.push(`${name} not evicted: ${(error as Error).message}`)
		}
	return { trashed, problems }
}

/** Renames the newest pool entry of the repository whose lock key equals the key of `worktree`'s lock into it. */
export function takePooledNodeModules(params: {
	worktree: string
	/** The repository's main checkout. */
	repository: string
	worktreesFolder: string
	/** The lock `worktree` installs; default: its `package-lock.json` on disk. */
	lockText?: string
	/** Renames a folder (the tests stand in for it); default: `fs.renameSync`. */
	rename?: (params: { from: string; to: string }) => void
	/** Called between the pick of an entry and its rename. */
	afterPick?: InterleavingSeam
	/** Who takes it (a lot's owner), when known: that owner's newest matching entry first, else the newest. */
	owner?: string
}): PoolTake {
	const { worktree, worktreesFolder } = params
	const rename = params.rename ?? renameFolder
	const lockText = params.lockText ?? readPackageLockText({ worktree })
	if (lockText === undefined) return { notTaken: 'no match' }
	const lockKey = computeLockKey({ text: lockText })
	const repository = basename(params.repository)
	const matching = newestFirst(
		listPoolEntries(worktreesFolder).filter(
			(entry) => entry.file.repository === repository && entry.file.lockKey === lockKey,
		),
	)
	return renameFirstEntry({
		entries: ownersFirst({ entries: matching, owner: params.owner }),
		worktree,
		worktreesFolder,
		rename,
		afterPick: params.afterPick,
	})
}

/**
 * Renames the near pool entry of `entries` (of another lock key) whose stamped packages differ from `lockText`'s in the
 * fewest packages, at most `POOL_DRIFT_LIMIT`, into `worktree`: on a tie the owner's, then the newest.
 */
function takeNearEntry(params: {
	worktree: string
	worktreesFolder: string
	entries: readonly PoolEntry[]
	lockText: string
	rename?: (params: { from: string; to: string }) => void
	afterPick?: InterleavingSeam
	owner?: string
}): { near: string; drift: number } | Exclude<PoolTake, { taken: string }> {
	const locked = lockedVersionsOf({ worktree: params.worktree, lockText: params.lockText })
	const lockKey = computeLockKey({ text: params.lockText })
	const drifts = new Map(
		params.entries
			.filter((entry) => entry.file.lockKey !== lockKey)
			.map((entry) => [entry.name, driftOf({ stamped: entry.file.packages, locked })] as const)
			.filter(([, drift]) => drift <= POOL_DRIFT_LIMIT),
	)
	const near = newestFirst(params.entries.filter((entry) => drifts.has(entry.name)))
	// the fewest packages first; among equals the owner's (newest first), then the others (newest first)
	const ordered = ownersFirst({ entries: near, owner: params.owner }).sort(
		(left, right) => (drifts.get(left.name) ?? 0) - (drifts.get(right.name) ?? 0),
	)
	const take = renameFirstEntry({
		entries: ordered,
		worktree: params.worktree,
		worktreesFolder: params.worktreesFolder,
		rename: params.rename ?? renameFolder,
		afterPick: params.afterPick,
	})
	return 'taken' in take ? { near: take.taken, drift: drifts.get(take.taken) ?? 0 } : take
}

/** How many lock keys differ between two package stamps: a version that differs, or a key on one side only. */
function driftOf(params: {
	stamped: Readonly<Record<string, string>>
	locked: Readonly<Record<string, string>>
}): number {
	const keys = new Set([...Object.keys(params.stamped), ...Object.keys(params.locked)])
	return [...keys].filter((key) => params.stamped[key] !== params.locked[key]).length
}

/** The entries of `owner` first, then the others, each in their given order. */
function ownersFirst(params: {
	entries: readonly PoolEntry[]
	owner: string | undefined
}): PoolEntry[] {
	return [
		...params.entries.filter((entry) => isOwnedBy({ entry, owner: params.owner })),
		...params.entries.filter((entry) => !isOwnedBy({ entry, owner: params.owner })),
	]
}

/**
 * Renames the `node_modules` of the first of `entries` still there into `worktree` and removes its emptied folder: its
 * name, or why none was taken (another taker renamed them first, or the pool is on another file system).
 */
function renameFirstEntry(params: {
	entries: readonly PoolEntry[]
	worktree: string
	worktreesFolder: string
	rename: (params: { from: string; to: string }) => void
	afterPick?: InterleavingSeam
}): PoolTake {
	let takenByAnother = false
	for (const entry of params.entries) {
		params.afterPick?.()
		const folder = join(params.worktreesFolder, entry.name)
		try {
			params.rename({
				from: join(folder, 'node_modules'),
				to: join(params.worktree, 'node_modules'),
			})
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

/**
 * The local dependency cache: the pool of `worktreesFolder` for `repository`, restoring by a take and saving by a park.
 *
 * @intent put the pool behind the dependency-cache interface a CI or cloud cache can also implement
 * @internal
 */
export function createPoolCache(params: {
	/** The repository's main checkout. */
	repository: string
	worktreesFolder: string
	/** Starts the background removals of a save's trash; default: `spawnDetached`. */
	spawner?: BackgroundSpawner
	/** Renames a folder (the tests stand in for it); default: `fs.renameSync`. */
	rename?: (params: { from: string; to: string }) => void
	/** Re-points the links leaving `node_modules` (the tests stand in for it); default: `relinkEscapingLinks`. */
	relink?: (params: { from: string; to: string }) => void
	/** Called by a restore between the pick of an entry and its rename. */
	afterPick?: InterleavingSeam
	/** How many entries a save lets the repository keep (the tests set it); default: `readPoolCap`. */
	cap?: number
}): DependencyCache {
	const { worktreesFolder, rename, relink, afterPick, cap } = params
	const spawner = params.spawner ?? spawnDetached
	const repository = basename(params.repository)
	function list(): PoolEntry[] {
		return listPoolEntries(worktreesFolder).filter((entry) => entry.file.repository === repository)
	}
	function restore(restored: { checkout: string; lockText: string; owner?: string }): CacheRestore {
		return restoreFromPool({
			repository: params.repository,
			worktreesFolder,
			entries: list(),
			rename,
			afterPick,
			...restored,
		})
	}
	function save(saved: {
		checkout: string
		lockText?: string
		owner?: string
		now: Date
	}): CacheSave {
		const parked = parkNodeModules({
			worktree: saved.checkout,
			repository: params.repository,
			worktreesFolder,
			now: saved.now,
			spawner,
			rename,
			relink,
			checkedLockText: saved.lockText,
			owner: saved.owner,
			cap,
		})
		return typeof parked === 'string'
			? { refused: parked }
			: {
					parked: parked.entry,
					trashed: parked.trashed,
					...(parked.note !== undefined && { note: parked.note }),
				}
	}
	return { restore, save, list }
}

/**
 * A restore from the pool's `entries` of the repository: the newest entry with `lockText`'s key renamed into
 * `checkout`, else the nearest of another key, else why none.
 */
function restoreFromPool(params: {
	/** The repository's main checkout. */
	repository: string
	worktreesFolder: string
	entries: readonly PoolEntry[]
	checkout: string
	lockText: string
	owner?: string
	rename?: (params: { from: string; to: string }) => void
	afterPick?: InterleavingSeam
}): CacheRestore {
	const { entries, checkout, lockText, owner, worktreesFolder, rename, afterPick } = params
	if (entries.length === 0) return { miss: POOL_MISS_EMPTY }
	const lockKey = computeLockKey({ text: lockText })
	const exact = entries.some((entry) => entry.file.lockKey === lockKey)
	const take = exact
		? takePooledNodeModules({
				worktree: checkout,
				repository: params.repository,
				worktreesFolder,
				lockText,
				rename,
				afterPick,
				owner,
			})
		: undefined
	if (take && 'taken' in take) return { taken: take.taken }
	if (take?.notTaken === 'cross-device') return { miss: POOL_MISS_CROSS_DEVICE }
	// no exact entry, or another taker had them: the nearest entry of another key
	const near = takeNearEntry({
		worktree: checkout,
		worktreesFolder,
		entries,
		lockText,
		rename,
		afterPick,
		owner,
	})
	if ('near' in near) return near
	if (near.notTaken === 'cross-device') return { miss: POOL_MISS_CROSS_DEVICE }
	// a matching entry was there at the pick: gone by the rename means another taker had it
	if (exact || near.notTaken === 'taken by another') return { miss: POOL_MISS_BUSY }
	return { miss: noEntryMissOf({ lockText }) }
}

/**
 * The miss of a restore whose repository has entries, none with `lockText`'s key nor near it: `no entry for install`
 * and the key's first characters.
 *
 * @intent name the same miss whether the restore found no near entry or the near one it gave was given up
 * @internal
 */
export function noEntryMissOf(params: { lockText: string }): CacheMiss {
	return `${POOL_MISS_NO_ENTRY} ${computeLockKey({ text: params.lockText }).slice(0, POOL_MISS_KEY_LENGTH)}`
}

/**
 * How many pool entries `repository` keeps: the most of its store lots open at once (a lot is open from its first
 * transition to its latest card in the hand-over `cards.log` when it has one, else to its last transition), at least
 * `POOL_ENTRIES_FLOOR` (a repository without store lots gets the floor), at most `POOL_ENTRIES_CEILING`.
 *
 * @intent size the pool by the work the repository runs at once
 * @internal
 */
export function readPoolCap(params: {
	/** The repository's main checkout. */
	repository: string
}): number {
	const highWater = mostOpenAtOnce({ spans: readLotSpans({ repository: params.repository }) })
	return Math.min(Math.max(highWater, POOL_ENTRIES_FLOOR), POOL_ENTRIES_CEILING)
}

/**
 * When each store lot of `repository` was open (ms): from its first transition to its latest card, else to its last
 * transition. None when `repository` is no git checkout of its own or has no store.
 */
function readLotSpans(params: { repository: string }): { from: number; to: number }[] {
	// the repository's own checkout only: a folder inside another checkout must not read that one's store
	if (!existsSync(join(params.repository, '.git'))) return []
	const location = locateStore({ from: params.repository })
	if (location === undefined) return []
	const { cards } = readCardsLog({ file: join(location.registry, CARDS_LOG_FILE) })
	return listLotIdentities({ store: location.store }).flatMap(function spanOf({ name }) {
		const times = readTransitions({ lotFolder: join(location.store, name) })
			.map((transition) => Date.parse(transition.at))
			.filter((time) => !Number.isNaN(time))
		if (times.length === 0) return []
		const card = finalCardOf({ cards, lot: name })
		const closedAt = card === undefined ? Number.NaN : Date.parse(card.at)
		return [
			{ from: Math.min(...times), to: Number.isNaN(closedAt) ? Math.max(...times) : closedAt },
		]
	})
}

/** The most spans open at one instant; a span that ends when another starts does not meet it. */
function mostOpenAtOnce(params: { spans: readonly { from: number; to: number }[] }): number {
	// at one instant the closes come before the opens
	const events = params.spans
		.flatMap((span) => [
			{ at: span.from, step: 1 },
			{ at: span.to, step: -1 },
		])
		.sort((left, right) => left.at - right.at || left.step - right.step)
	let open = 0
	let most = 0
	for (const event of events) {
		open += event.step
		most = Math.max(most, open)
	}
	return most
}

/**
 * The entries a park sends to the trash, the new one among `entries`: past `POOL_ENTRIES_PER_KEY` of one lock key the
 * oldest of that key, then past `cap` the oldest of the repository.
 */
function evictedEntriesOf(params: { entries: readonly PoolEntry[]; cap: number }): string[] {
	const kept: PoolEntry[] = []
	const evicted: string[] = []
	const perKey = new Map<string, number>()
	for (const entry of newestFirst(params.entries)) {
		const count = (perKey.get(entry.file.lockKey) ?? 0) + 1
		perKey.set(entry.file.lockKey, count)
		if (count > POOL_ENTRIES_PER_KEY) evicted.push(entry.name)
		else kept.push(entry)
	}
	return [...evicted, ...kept.slice(params.cap).map((entry) => entry.name)]
}

/** The entry was parked by `owner` (none given: by nobody known). */
function isOwnedBy(params: { entry: PoolEntry; owner: string | undefined }): boolean {
	return params.owner !== undefined && params.entry.file.owner === params.owner
}

/**
 * The text of `worktree`'s `package-lock.json`; undefined without one.
 *
 * @intent read the lock a park stamps together with the check made against it
 * @internal
 */
export function readPackageLockText(params: { worktree: string }): string | undefined {
	const lockfile = join(params.worktree, PACKAGE_LOCK_FILE)
	return existsSync(lockfile) ? readFileSync(lockfile, 'utf8') : undefined
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
					typeof file.lockKey === 'string' &&
					typeof file.parkedAt === 'string' &&
					typeof file.packages === 'object' &&
					file.packages !== null
					? [{ name, file }]
					: []
			} catch {
				// no pool.json yet (a park in progress) or one that does not parse: not an entry to take
				return []
			}
		})
}

/**
 * The pool folders of `repository` whose `pool.json` parses and holds no `lockKey` (the old whole-file `lockHash`
 * shape): never taken, trashed by the next park. A folder without `pool.json` (a park in progress) or with one that
 * does not parse is none of them.
 */
function listOldShapeEntries(params: { worktreesFolder: string; repository: string }): string[] {
	return readdirSync(params.worktreesFolder)
		.filter((name) => POOL_ENTRY_PATTERN.test(name))
		.sort()
		.filter(function isOldShape(name) {
			let file: unknown
			try {
				file = JSON.parse(readFileSync(join(params.worktreesFolder, name, POOL_FILE), 'utf8'))
			} catch {
				return false
			}
			return (
				typeof file === 'object' &&
				file !== null &&
				'repository' in file &&
				file.repository === params.repository &&
				!('lockKey' in file)
			)
		})
}

/**
 * The version each package of `lockText` installs, by its lock key; a link holds what it resolves to. Read from the lock
 * alone, never from what is installed: a package npm may leave out (`optional`, or an `os` / `cpu` list) is never
 * counted, so a park (its `node_modules` in place) and a restore (none yet) stamp the same lock alike.
 */
function lockedVersionsOf(params: { worktree: string; lockText: string }): Record<string, string> {
	const read = readLockedPackages(params)
	if ('notChecked' in read) return {}
	return Object.fromEntries(
		read.packages
			.filter(({ entry }) => !isPlatformOrOptional(entry))
			.map(({ key, entry }) => [key, entry.version ?? entry.resolved ?? '']),
	)
}

/** The lock entry says npm may leave it out of an install: `optional`, or restricted to some `os` or `cpu`. */
function isPlatformOrOptional(entry: LockfileEntry): boolean {
	return Boolean(entry.optional) || Boolean(entry.os?.length) || Boolean(entry.cpu?.length)
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
