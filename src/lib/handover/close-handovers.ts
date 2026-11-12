/**
 * `lot close`: for each named hand-over of the registry (by its name or its worktree's index), its worktree
 * (the path the registry entry holds) goes to the trash and its `node_modules` to the pool. Every keep rule
 * first, with no exemption: a worktree an open lot names (reason `lot <full name> <state>`), a hand-over not
 * committed nor abandoned, the main checkout, a worktree that is no
 * registered worktree (or one already in the trash or the pool), one on another branch than the hand-over's, a
 * locked one, a mutation run from it, a process working in it, processes that cannot be listed, another
 * hand-over of the same worktree still open, a link from outside reaching into it, a dirty worktree, commits only
 * its HEAD reflog reaches, ignored files its removal would delete that nothing else holds; nothing done for a
 * hand-over kept. Before each move, the lot's final record kept in `cards.log` (the hand-over's own `card` line,
 * else a catch-up one read back) and the `removing` intent, any failure keeping the worktree; after it, the
 * `removed` outcome. Every decision is taken for every argument before anything
 * moves (one worktree, whichever arguments reach it, decided and closed once), `node_modules` checked against
 * the lockfile where it is. Then, per worktree: the links of its `node_modules` made absolute where they are,
 * the move into the trash, the park from the trashed folder, the background removal. The branch is never
 * touched. Each hand-over closed records `closed` (the time) on its registry entry; a hand-over whose entry holds
 * it is already closed, nothing decided nor moved (a worktree removed by hand, never closed, is still kept).
 */
import { existsSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

import { readLinkScanSet } from '../cleanup/read-link-scan-set.ts'
import { archivedDeclarationsOf, removableIgnored } from '../cleanup/removable-ignored.ts'
import { CARDS_LOG_FILE } from '../events/cards-log.constants.ts'
import { isAtOrInsideReal, realPathOf } from '../file-system.ts'
import { findBaseBranchRef } from '../gate/gate-base.ts'
import { mainCheckoutOf, readGit, tryReadGit } from '../git.ts'
import { readPackageJson } from '../package-json.ts'
import { lotsKeepingWorktrees } from '../store/lot-keep.ts'
import { WORKTREES_FOLDER } from '../workspace.constants.ts'
import { listWorktrees } from '../worktree/add-worktree.ts'
import { checkNodeModules, lockHashOf } from '../worktree/check-node-modules.ts'
import { relinkEscapingLinks } from '../worktree/copy-node-modules.ts'
import { parkNodeModules } from '../worktree/node-modules-pool.ts'
import { listProcessFolders, processWorkingIn } from '../worktree/process-folders.ts'
import { linkReaching, mutationRunKeeping, readOwnedRuns } from '../worktree/prune-worktrees.ts'
import { isParked, trashWorktree } from '../worktree/trash.ts'
import { IGNORED_FILES_SHOWN, WORKTREE_STATUS_ARGUMENTS } from '../worktree/worktree.constants.ts'
import { keepFinalRecord, recordRemoved } from './close-final-record.ts'
import { readStoreEntries } from './handover-store-read.ts'
import { entryOfArgument, findHandoverStore, recordHandoverClosed } from './handover-store.ts'
import { CLOSE_FROM_INSIDE, HEAD_REFLOG_COMMITS_SHOWN } from './handover.constants.ts'

import type { BaseBranchRef } from '../gate/gate-base.types.ts'
import type { RunEntry } from '../mutation/mutation.types.ts'
import type {
	BackgroundSpawner,
	FolderLink,
	ListedWorktree,
	NodeModulesCheck,
	ProcessFolder,
} from '../worktree/worktree.types.ts'
import type { CloseResult, CloseTarget, StoreEntry } from './handover.types.ts'

/** Each named hand-over closed or kept with why; the names the registry does not hold (nothing done then). */
export function closeHandovers(params: {
	/** Where the registry is looked for (a worktree or the main checkout of the repository). */
	cwd: string
	/** The folder the command runs from: a worktree holding it is kept (never moved from under the caller). */
	runFrom: string
	/** Hand-over names or worktree indexes. */
	names: string[]
	now: Date
	spawner: BackgroundSpawner
	/** Lists the processes and their working folders (the tests stand in for it); default: the system's. A throw is "not known". */
	listProcesses?: () => ProcessFolder[] | string
	/** Where rehearsal clones are made: their links are read with the workspace's. Default: none. */
	scratchRoots?: readonly string[]
}): CloseResult[] | { unknown: string[] } {
	const main = mainCheckoutOf(params.cwd)
	const store = findHandoverStore(params.cwd)
	const entries = params.names.map((argument) => entryOfArgument({ argument, store }))
	if (entries.some((entry) => entry === undefined))
		return { unknown: params.names.filter((_name, index) => entries[index] === undefined) }
	// a worktree already in the trash or the pool is on its way out: never a target again
	const worktrees = listWorktrees(main).filter(
		(worktree) => !isParked({ path: worktree.path, main }),
	)
	const targets = params.names.map(function targetOf(argument, index): CloseTarget {
		const entry = entries[index]
		return {
			argument,
			entry,
			worktree: worktrees.find(
				(worktree) => entry && realPathOf(worktree.path) === realPathOf(entry.worktree),
			),
		}
	})
	const worktreesFolder = join(dirname(main), WORKTREES_FOLDER)
	const runs = readOwnedRuns(main)
	const processes = readProcesses(params.listProcesses ?? listProcessFolders)
	// one worktree is closed once, whichever names and indexes reach it: keyed by its real path, read before
	// anything moves (a moved worktree has no real path left: its registered spelling would be another key)
	const keys = targets.map(function keyOf(target): string {
		return target.entry ? realPathOf(target.entry.worktree) : target.argument
	})
	// every decision first, nothing moved yet: each argument with every keep rule (its own state, its own
	// branch), and the check of its worktree's node_modules
	// the lot keep rule: the repository's store read once for every argument
	const lotKeeps = lotsKeepingWorktrees({ repository: main })
	// read once for every argument: the registry's entries, the links around the workspace, the base branch
	const registered = store ? readStoreEntries(store) : []
	const links = readLinkScanSet({
		workspace: dirname(main),
		scratchRoots: params.scratchRoots ?? [],
	})
	const found = findBaseBranchRef({ root: main, packageJson: readPackageJson(main) })
	// no base branch found: the reflog rule holds nothing through it, so a refusal never moves more than before
	const baseBranch = 'refusal' in found ? undefined : found
	// the final records and the removals of the repository, beside its registry
	const cardsLog = store === undefined ? undefined : join(store, CARDS_LOG_FILE)
	const decisions = targets.map(function decide(target) {
		return decideTarget({
			target,
			main,
			runFrom: params.runFrom,
			worktreesFolder,
			runs,
			processes,
			lotKeeps,
			registered,
			links,
			baseBranch,
		})
	})
	// a worktree closes only when every argument reaching it may close: the first that keeps it, in any order;
	// a hand-over already closed never owns the worktree (the others reaching it are decided on their own)
	const owners = new Map<string, CloseTarget>()
	const keeps = new Map<string, { argument: CloseTarget; kept: string }>()
	targets.forEach(function group(target, index) {
		const key = keys[index]
		const decision = decisions[index]
		if ('alreadyClosed' in decision) return
		if (!owners.has(key)) owners.set(key, target)
		if ('kept' in decision && !keeps.has(key))
			keeps.set(key, { argument: target, kept: decision.kept })
	})
	// then the moves, each worktree its own outcome: a failure keeps it with the reason, the others go on
	const results = new Map(
		[...owners].map(function act([key, target]): [string, CloseResult] {
			const handover = target.entry?.name ?? target.argument
			const decision = decisions[targets.indexOf(target)]
			const keep = keeps.get(key)
			if (keep || 'kept' in decision)
				return [key, { outcome: { handover, kept: keep?.kept ?? 'not decided' }, moved: [] }]
			if ('alreadyClosed' in decision)
				return [key, { outcome: { handover, closed: true, already: true }, moved: [] }]
			const moved: string[] = []
			// the final record of every hand-over reaching the worktree, then the intent line, before the move: a
			// failure keeps the worktree, nothing moved
			const record =
				target.entry === undefined || cardsLog === undefined
					? { kept: 'not decided' }
					: keepFinalRecord({
							entries: entriesReaching({ key, targets, keys, registered }),
							worktree: decision.worktree.path,
							file: cardsLog,
						})
			if ('kept' in record) return [key, { outcome: { handover, kept: record.kept }, moved }]
			try {
				const { trashed, nodeModules } = closeWorktree({
					worktree: decision.worktree.path,
					check: decision.check,
					checkedLockHash: decision.checkedLockHash,
					main,
					worktreesFolder,
					now: params.now,
					spawner: params.spawner,
					moved,
				})
				recordRemoved({ file: record.file, id: record.id, outcome: { trashed } })
				return [key, { outcome: { handover, closed: true }, moved, nodeModules }]
			} catch (error) {
				// moved already: the worktree is in the trash whatever failed after; else the move failed and it stays
				recordRemoved({
					file: record.file,
					id: record.id,
					outcome: moved.length
						? { trashed: undefined }
						: { kept: (error as Error).message.trim() },
				})
				const done = moved.length ? ` (already in the trash: ${moved.join(', ')})` : ''
				return [
					key,
					{ outcome: { handover, kept: `${(error as Error).message.trim()}${done}` }, moved },
				]
			}
		}),
	)
	// one outcome per argument: its own reason when it keeps the worktree, else the reason that keeps it
	const outcomes = targets.map(function outcomeOf(target, index): CloseResult {
		const key = keys[index]
		const decision = decisions[index]
		const keep = keeps.get(key)
		const result = results.get(key)
		const handover = target.entry?.name ?? target.argument
		if ('kept' in decision) return { outcome: { handover, kept: decision.kept }, moved: [] }
		if ('alreadyClosed' in decision)
			return { outcome: { handover, closed: true, already: true }, moved: [] }
		if (keep && keep.argument !== target)
			return {
				outcome: {
					handover,
					kept: `the same worktree as ${keep.argument.entry?.name ?? keep.argument.argument}, kept: ${keep.kept}`,
				},
				moved: [],
			}
		if (!result || owners.get(key) === target)
			return result ?? { outcome: { handover, kept: 'not decided' }, moved: [] }
		const same = `the same worktree as ${result.outcome.handover}`
		return 'closed' in result.outcome
			? { outcome: { handover, closed: true }, moved: [same] }
			: { outcome: { handover, kept: `${same}: ${result.outcome.kept}` }, moved: [] }
	})
	// each hand-over closed now says so in its registry entry: the one thing a later close reads as closed
	if (store)
		targets.forEach(function recordClosed(target, index) {
			const { outcome } = outcomes[index]
			if (target.entry && 'closed' in outcome && !outcome.already)
				recordHandoverClosed({ store, name: target.entry.name, at: params.now })
		})
	return outcomes
}

/**
 * The registry entries leaving with the worktree of `key`, each once: the arguments reaching it in the order given
 * (its owner first), then every other committed or abandoned entry of that worktree, named in the close or not (a
 * pending one already keeps it).
 */
function entriesReaching(params: {
	key: string
	targets: readonly CloseTarget[]
	keys: readonly string[]
	registered: readonly StoreEntry[]
}): StoreEntry[] {
	const entries = new Map<string, StoreEntry>()
	params.targets.forEach(function reaching(target, index) {
		if (params.keys[index] === params.key && target.entry && !entries.has(target.entry.name))
			entries.set(target.entry.name, target.entry)
	})
	for (const entry of params.registered)
		if (
			entry.state !== 'pending' &&
			!entries.has(entry.name) &&
			realPathOf(entry.worktree) === params.key
		)
			entries.set(entry.name, entry)
	return [...entries.values()]
}

/**
 * Why the target stays, or, when it may close, the check of its `node_modules` against its lockfile, made
 * where it is now (a relative `file:` link resolves there, not from the trash). Nothing moves here; a failure
 * keeps the target with the reason.
 */
function decideTarget(params: {
	target: CloseTarget
	main: string
	/** Where the close runs from: a worktree it stands in is kept. */
	runFrom: string
	worktreesFolder: string
	runs: readonly RunEntry[]
	processes: readonly ProcessFolder[] | string
	/** The worktrees the open lots name, by real path, with their reason. */
	lotKeeps: ReadonlyMap<string, string>
	/** Every entry of the registry. */
	registered: readonly StoreEntry[]
	/** The links around the workspace (`readLinkScanSet`). */
	links: readonly FolderLink[]
	/** The branch the repository's work is merged into (`findBaseBranchRef`); undefined when none was found. */
	baseBranch: BaseBranchRef | undefined
}):
	| { kept: string }
	| { alreadyClosed: true }
	| {
			worktree: ListedWorktree
			check: NodeModulesCheck | undefined
			checkedLockHash: string | undefined
	  } {
	// an earlier close recorded it on the entry: nothing to decide, nothing to move
	if (params.target.entry?.closed !== undefined) return { alreadyClosed: true }
	try {
		const why = whyKeep(params)
		if ('kept' in why) return why
		if (!existsSync(params.worktreesFolder))
			return {
				kept: `no ${WORKTREES_FOLDER}/ beside ${params.main}: the pool and the trash live there`,
			}
		const { worktree } = why
		if (!existsSync(join(worktree.path, 'node_modules')))
			return { worktree, check: undefined, checkedLockHash: undefined }
		// the lockfile's hash read with the check: the pool entry is stamped with what the check read
		return {
			worktree,
			checkedLockHash: lockHashOf(worktree.path),
			check: checkNodeModules({ worktree: worktree.path }),
		}
	} catch (error) {
		return { kept: (error as Error).message.trim() }
	}
}

/** The processes, or "not known" when the lister throws or cannot tell: then everything is kept. */
function readProcesses(listProcesses: () => ProcessFolder[] | string): ProcessFolder[] | string {
	try {
		return listProcesses()
	} catch (error) {
		return `the processes are not known (${(error as Error).message}): nothing is moved`
	}
}

/**
 * Why the hand-over's worktree stays, or the worktree itself when it may close. The cheap rules first, then the
 * links reaching it, then git: its status, the commits only its HEAD reflog reaches, the ignored files its removal
 * would delete. The first reason that keeps it wins.
 */
export function whyKeep(params: {
	target: CloseTarget
	main: string
	/** Where the close runs from. */
	runFrom: string
	runs: readonly RunEntry[]
	/** The processes and their working folders, or why the system could not tell (then nothing closes). */
	processes: readonly ProcessFolder[] | string
	/** The worktrees the open lots name, by real path, with their reason: checked first. */
	lotKeeps: ReadonlyMap<string, string>
	/** Every entry of the registry: another hand-over of the same worktree still open keeps it. */
	registered: readonly StoreEntry[]
	/** The links around the workspace: one from outside the worktree reaching into it keeps it. */
	links: readonly FolderLink[]
	/** The branch the repository's work is merged into (`findBaseBranchRef`); undefined when none was found. */
	baseBranch: BaseBranchRef | undefined
}): { kept: string } | { worktree: ListedWorktree } {
	const { target } = params
	const entry = target.entry
	if (!entry) return { kept: 'no hand-over of that name or index' }
	const lotKeep = params.lotKeeps.get(realPathOf(entry.worktree))
	if (lotKeep) return { kept: lotKeep }
	if (entry.state !== 'committed' && entry.state !== 'abandoned')
		return { kept: `${entry.state}: only a committed or abandoned hand-over closes` }
	const open = openHandoverOfWorktree({ entry, registered: params.registered })
	if (open)
		return {
			kept: `another hand-over of this worktree is ${open.state}: ${open.name} (only committed or abandoned ones let it close)`,
		}
	if (realPathOf(entry.worktree) === realPathOf(params.main))
		return {
			kept: `its worktree is the main checkout ${params.main}: never parked, moved or trashed`,
		}
	const worktree = target.worktree
	if (!worktree)
		return {
			kept: `${entry.worktree} is no worktree of the repository (closed already, moved, or in the trash): nothing to close`,
		}
	if (worktree.branch !== entry.branch)
		return {
			kept: `on ${worktree.branch ?? 'a detached HEAD'}, not on the hand-over's branch ${entry.branch}: the worktree holds other work now`,
		}
	if (worktree.locked)
		return { kept: `locked: ${worktree.path} (git worktree unlock it first, if it may go)` }
	const run = mutationRunKeeping({ runs: params.runs, folder: worktree.path })
	if (run) return { kept: `${run} (from ${worktree.path})` }
	if (isAtOrInsideReal({ path: params.runFrom, folder: worktree.path }))
		return {
			kept: CLOSE_FROM_INSIDE.replace('{worktree}', worktree.path).replace('{main}', params.main),
		}
	if (typeof params.processes === 'string') return { kept: params.processes }
	const working = processWorkingIn({ processes: params.processes, folder: worktree.path })
	if (working) return { kept: `a process works in ${worktree.path}: pid ${working.pid}` }
	const link = linkFromOutside({ worktree: worktree.path, links: params.links })
	if (link) return { kept: `the link ${link} points to it` }
	const status = readGit({ root: worktree.path, args: [...WORKTREE_STATUS_ARGUMENTS] })
		.split('\n')
		.filter(Boolean)
	if (status.length)
		return { kept: `dirty: ${status.length} path(s) git status lists in ${worktree.path}` }
	const unreached = commitsOnlyInHeadReflog({
		worktree: worktree.path,
		branch: entry.branch,
		baseRef: params.baseBranch?.ref,
	})
	const holders = [entry.branch, ...(params.baseBranch ? [params.baseBranch.branch] : [])]
	if (unreached.length)
		return {
			kept: `its HEAD reflog reaches ${unreached.length} commit(s) that neither ${holders.join(', ')} nor a remote-tracking ref holds: ${unreached.slice(0, HEAD_REFLOG_COMMITS_SHOWN).join(', ')} (look: git -C ${worktree.path} reflog HEAD)`,
		}
	const { kept } = removableIgnored({
		worktree: worktree.path,
		main: params.main,
		archivedDeclarations: archivedDeclarationsOf({
			worktree: worktree.path,
			entries: params.registered,
		}),
	})
	if (kept.length > IGNORED_FILES_SHOWN)
		return {
			kept: `${kept.length} ignored files git worktree remove would delete, first: ${kept.slice(0, IGNORED_FILES_SHOWN).join(', ')}`,
		}
	if (kept.length)
		return { kept: `ignored files git worktree remove would delete: ${kept.join(', ')}` }
	return { worktree }
}

/** Another hand-over registered for the same worktree (by real path) that is neither committed nor abandoned. */
function openHandoverOfWorktree(params: {
	entry: StoreEntry
	registered: readonly StoreEntry[]
}): StoreEntry | undefined {
	const worktree = realPathOf(params.entry.worktree)
	return params.registered.find(
		(other) =>
			other.name !== params.entry.name &&
			other.state !== 'committed' &&
			other.state !== 'abandoned' &&
			realPathOf(other.worktree) === worktree,
	)
}

/** A link lying outside the worktree that reaches it or something inside it; its own links never count. */
function linkFromOutside(params: {
	worktree: string
	links: readonly FolderLink[]
}): string | undefined {
	const outside = params.links.filter(
		(link) => !isAtOrInsideReal({ path: dirname(link.link), folder: params.worktree }),
	)
	return linkReaching({ folder: params.worktree, links: outside })
}

/**
 * The commits (short) the worktree's HEAD reflog reaches that neither the hand-over's branch, the base branch nor
 * a remote-tracking ref holds: deleted with the worktree, its reflog the only way back to them. A ref the
 * repository does not hold is left out of the comparison.
 */
function commitsOnlyInHeadReflog(params: {
	worktree: string
	branch: string
	/** The base branch's full ref; undefined when none was found (nothing held through it). */
	baseRef: string | undefined
}): string[] {
	const root = params.worktree
	// a reflog git cannot read throws: the worktree is kept with git's message
	const reflog = readGit({ root, args: ['reflog', 'show', '--format=%H', 'HEAD', '--'] })
	const commits = [...new Set(reflog.split('\n').filter(Boolean))]
	if (commits.length === 0) return []
	const held = [
		`refs/heads/${params.branch}`,
		...(params.baseRef === undefined ? [] : [params.baseRef]),
	].filter(
		(ref) => tryReadGit({ root, args: ['rev-parse', '--verify', '--quiet', ref] }) !== undefined,
	)
	// the reflog's commits on standard input (read as wanted, whatever `--not` says): no argument-length limit
	return readGit({
		root,
		args: ['rev-list', '--abbrev-commit', '--stdin', '--not', ...held, '--remotes'],
		input: `${commits.join('\n')}\n`,
	})
		.split('\n')
		.filter(Boolean)
}

/**
 * The links of the worktree's `node_modules` made absolute where they are (before any move changes what a
 * relative link reaches), the worktree moved to the trash, its `node_modules` parked from there with the check
 * made before the move (its caches sent to their own trash entries, each with its own removal), then, last, the
 * background `git worktree remove` without `--force` (git refuses a worktree written into since the decision: it
 * stays in the trash). `moved` collects the folder name once moved. Answers where the worktree went in the trash
 * and where `node_modules` went.
 */
export function closeWorktree(params: {
	worktree: string
	/** `node_modules` read against the lockfile where it was, before the move. */
	check: NodeModulesCheck | undefined
	/** sha256 of the lockfile `check` read, read with it. */
	checkedLockHash: string | undefined
	main: string
	worktreesFolder: string
	now: Date
	spawner: BackgroundSpawner
	moved: string[]
}): { trashed: string; nodeModules: string | undefined } {
	const { worktree, main, worktreesFolder, now } = params
	const nodeModules = join(worktree, 'node_modules')
	if (existsSync(nodeModules)) relinkEscapingLinks({ from: nodeModules, to: nodeModules })
	const removals: { command: string; args: string[]; cwd?: string }[] = []
	// the removal waits until the park is done: recorded here, started after it
	function recordRemoval(call: { command: string; args: string[]; cwd?: string }): void {
		removals.push(call)
	}
	// without --force: git refuses a worktree something was written into since the decision; it waits in the trash
	const { trashed } = trashWorktree({
		worktree,
		repository: main,
		worktreesFolder,
		now,
		spawner: recordRemoval,
		force: false,
	})
	params.moved.push(basename(worktree))
	let where: string | undefined
	if (existsSync(join(trashed, 'node_modules'))) {
		// a park that cannot be made leaves node_modules in the trashed worktree: it goes with it
		const parked = parkNodeModules({
			worktree: trashed,
			repository: main,
			worktreesFolder,
			now,
			// the caches go to their own trash entries: a folder of them left in the worktree would make git refuse it
			spawner: params.spawner,
			check: params.check,
			checkedLockHash: params.checkedLockHash,
		})
		where = typeof parked === 'string' ? `trashed: ${parked}` : `pooled in ${parked.entry}`
	}
	for (const removal of removals) params.spawner(removal)
	return { trashed, nodeModules: where }
}
