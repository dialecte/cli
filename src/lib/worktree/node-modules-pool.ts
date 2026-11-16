/**
 * The `node_modules` pool: `.worktrees/_pool-<repository>-<n>/node_modules` with a `pool.json` beside it, at
 * most two entries per repository. A finished checkout parks its `node_modules` there (a rename), a new
 * checkout whose lock installs the same packages (its lock key, `computeLockKey`) takes the newest one (a
 * rename), so neither pays for a copy or a delete. A `node_modules` is never shared: a take renames it away
 * from the pool, a second taker finds it gone.
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
} from './worktree.constants.ts'

import type { InterleavingSeam } from '../handover/handover.types.ts'
import type {
	BackgroundSpawner,
	CacheMiss,
	CacheRestore,
	CacheSave,
	DependencyCache,
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
	// read while node_modules is still in place: an optional package counts when it is installed
	const packages = lockedVersionsOf({ worktree, lockText })
	const repository = basename(params.repository)
	const entry = moveIntoPool({
		source,
		worktreesFolder,
		repository,
		rename: params.rename ?? renameFolder,
		relink: params.relink ?? relinkEscapingLinks,
	})
	if ('refused' in entry) return entry.refused
	discardCaches({
		parked: join(worktreesFolder, entry.name, 'node_modules'),
		discardInto: params.discardInto,
		worktreesFolder,
		now: params.now,
		spawner: params.spawner,
	})
	const file: PoolEntryFile = {
		repository,
		lockKey: computeLockKey({ text: lockText }),
		parkedAt: params.now.toISOString(),
		...(params.owner !== undefined && { owner: params.owner }),
		packages,
	}
	writeFileSync(join(worktreesFolder, entry.name, POOL_FILE), `${JSON.stringify(file, null, 2)}\n`)
	const trashed = trashPastCap({
		worktreesFolder,
		repository: params.repository,
		cap: params.cap,
		now: params.now,
		spawner: params.spawner,
	})
	return { entry: entry.name, trashed }
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
 * `source` renamed into a new `_pool-<repository>-<n>` entry folder, its leaving links re-pointed first (a failure
 * leaves no half-made entry): the entry's name, or why it was not moved.
 */
function moveIntoPool(params: {
	source: string
	worktreesFolder: string
	repository: string
	rename: (params: { from: string; to: string }) => void
	relink: (params: { from: string; to: string }) => void
}): { name: string } | { refused: string } {
	const { source, worktreesFolder } = params
	try {
		// in place, before the rename: a failure leaves no half-made pool entry
		params.relink({ from: source, to: source })
	} catch (error) {
		return { refused: `${source} not parked: ${(error as Error).message}` }
	}
	const name = createEntryFolder({ worktreesFolder, repository: params.repository })
	try {
		params.rename({ from: source, to: join(worktreesFolder, name, 'node_modules') })
	} catch (error) {
		rmdirSync(join(worktreesFolder, name))
		const code = (error as NodeJS.ErrnoException).code
		return {
			refused: `${source} not parked: ${code === 'EXDEV' ? 'cross-device, the pool is on another file system' : (error as Error).message}`,
		}
	}
	return { name }
}

/**
 * Sends to the trash, after a park, the repository's old-shape entries and the entries past the per-key limit and the
 * cap (`readPoolCap` when none is given): their names.
 */
function trashPastCap(params: {
	worktreesFolder: string
	/** The repository's main checkout. */
	repository: string
	cap: number | undefined
	now: Date
	spawner: BackgroundSpawner
}): string[] {
	const { worktreesFolder } = params
	const repository = basename(params.repository)
	const evicted = evictedEntriesOf({
		entries: listPoolEntries(worktreesFolder).filter(
			(pooled) => pooled.file.repository === repository,
		),
		cap: params.cap ?? readPoolCap({ repository: params.repository }),
	})
	return [...listOldShapeEntries({ worktreesFolder, repository }), ...evicted].map(
		function trash(name) {
			trashFolder({
				folder: join(worktreesFolder, name),
				worktreesFolder,
				now: params.now,
				spawner: params.spawner,
			})
			return name
		},
	)
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
			: { parked: parked.entry, trashed: parked.trashed }
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

/** The version each package of `lockText` installs in `worktree`, by its lock key; a link holds what it resolves to. */
function lockedVersionsOf(params: { worktree: string; lockText: string }): Record<string, string> {
	const read = readLockedPackages(params)
	if ('notChecked' in read) return {}
	return Object.fromEntries(
		read.packages.map(({ key, entry }) => [key, entry.version ?? entry.resolved ?? '']),
	)
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
