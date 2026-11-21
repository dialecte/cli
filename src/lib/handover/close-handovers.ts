/**
 * `lot close`: for each named hand-over of the registry (by its name or its worktree's index), its worktree
 * (the path the registry entry holds) goes to the trash and its `node_modules` to the pool. Every keep rule
 * first, with no exemption: a worktree an open lot names (reason `lot <full name> <state>`), a hand-over not
 * committed nor abandoned, the main checkout, a worktree that is no
 * registered worktree (or one already in the trash or the pool), one on another branch than the hand-over's, a
 * locked one, a mutation run from it, a process working in it, processes that cannot be listed, another
 * hand-over of the same worktree still open, a link from outside reaching into it, a dirty worktree, a landed lot's
 * commits made since its landing (`workSinceLanding`), commits its removal would lose (`lostWork`: only its HEAD and
 * HEAD reflog reach them, no surviving branch, branch reflog, tag, landed tip or remote-tracking ref holds them nor
 * their change), ignored files its removal would delete that nothing else holds; nothing done for a hand-over kept. Before each move, the lot's final record kept in `cards.log` (the hand-over's own `card` line,
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
import { registeredArchivesOf, removableIgnored } from '../cleanup/removable-ignored.ts'
import { CARDS_LOG_FILE } from '../events/cards-log.constants.ts'
import { readCardsLog } from '../events/cards-log.ts'
import { isAtOrInsideReal, realPathOf, realPathThroughAncestors } from '../file-system.ts'
import { isAncestorCommit, mainCheckoutOf, readCommitOrNone, readGit } from '../git.ts'
import { fillMessage } from '../knowledge/standard/fill-message.ts'
import { readLanded } from '../landing/landed-record.ts'
import {
	droppedHeldText,
	lostWork,
	lostWorkText,
	workSinceLanding,
	workSinceLandingText,
} from '../landing/lost-work.ts'
import { readIdentity } from '../store/identity.ts'
import { lotsKeepingWorktrees } from '../store/lot-keep.ts'
import { listLotIdentities, locateStore } from '../store/store-folder.ts'
import { LOT_LINK_SEGMENTS } from '../store/store.constants.ts'
import { WORKTREES_FOLDER } from '../workspace.constants.ts'
import { checkNodeModules } from '../worktree/check-node-modules.ts'
import { relinkEscapingLinks } from '../worktree/copy-node-modules.ts'
import { parkNodeModules, readPackageLockText } from '../worktree/node-modules-pool.ts'
import { listProcessFolders, processWorkingIn } from '../worktree/process-folders.ts'
import { linkReaching, mutationRunKeeping, readOwnedRuns } from '../worktree/prune-worktrees.ts'
import { trashWorktree } from '../worktree/trash.ts'
import { IGNORED_FILES_SHOWN, WORKTREE_STATUS_ARGUMENTS } from '../worktree/worktree.constants.ts'
import { keepDeclarations, writeDeclarationArchives } from './archived-declarations.ts'
import { keepFinalRecord, keepLotFinalRecord, recordRemoved } from './close-final-record.ts'
import { CLOSE_KEPT_WORK, NO_LOT_WORKTREE } from './close-handovers.constants.ts'
import { CLOSE_TARGET_TEXTS } from './close-targets.constants.ts'
import { readStoreEntries } from './handover-store-read.ts'
import { findHandoverStore, handoverStoreOf, recordHandoverClosed } from './handover-store.ts'
import { CLOSE_FROM_INSIDE } from './handover.constants.ts'

import type { RemovalBy } from '../events/cards-log.types.ts'
import type { RunEntry } from '../mutation/mutation.types.ts'
import type {
	BackgroundSpawner,
	FolderLink,
	NodeModulesCheck,
	ProcessFolder,
} from '../worktree/worktree.types.ts'
import type {
	CountedArchive,
	DeclarationArchive,
	ReadDeclaration,
} from './archived-declarations.types.ts'
import type { CloseContext, CloseDecisionParams, Decision, Kept } from './close-handovers.types.ts'
import type { CloseSettle } from './close-targets.types.ts'
import type { CloseResult, CloseTarget, StoreEntry } from './handover.types.ts'

/** Each named hand-over closed or kept with why; the names the registry does not hold (nothing done then). */
export function closeHandovers(params: {
	/** Where the registry is looked for (a worktree or the main checkout of the repository). */
	cwd: string
	/** The folder the command runs from: a worktree holding it is kept (never moved from under the caller). */
	runFrom: string
	/** Each argument's target as the settle left it (`settleCloseTargets`): a target kept there stays with its reason. */
	settled: CloseSettle
	now: Date
	spawner: BackgroundSpawner
	/** Who writes the final records and removals (`lot-close` by default, `lot-prune`). */
	by?: RemovalBy
	/** Lists the processes and their working folders (the tests stand in for it); default: the system's. A throw is "not known". */
	listProcesses?: () => ProcessFolder[] | string
	/** Where rehearsal clones are made: their links are read with the workspace's. Default: none. */
	scratchRoots?: readonly string[]
	/** Called once every target is decided, before anything is written or moved (the tests change files there). */
	afterDecisions?: () => void
}): CloseResult[] {
	const { context, decisions } = closeDecisionsOf(params)
	params.afterDecisions?.()
	const { main, store, worktreesFolder, registered, targets, keys, lotOwners, cardsLog } = context
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
	// the entries leaving with each worktree, read before anything moves (a moved worktree has no real path left)
	const leaving = new Map(
		[...owners.keys()].map((key) => [key, entriesReaching({ key, targets, keys, registered })]),
	)
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
			const reaching = leaving.get(key) ?? []
			const record =
				reaching.length > 0
					? keepFinalRecord({
							by: params.by ?? 'lot-close',
							entries: reaching,
							worktree: decision.worktree.path,
							file: cardsLog,
						})
					: target.kind === 'lot' && target.lotState !== undefined
						? keepLotFinalRecord({
								by: params.by ?? 'lot-close',
								lot: target.lot,
								state: target.lotState,
								worktree: decision.worktree.path,
								branch: decision.branch,
								landedTip: params.settled[targets.indexOf(target)].landedTip,
								feature: readIdentity({ lotFolder: target.lotFolder })?.feature ?? null,
								repository: main,
								file: cardsLog,
							})
						: { kept: 'not decided' }
			if ('kept' in record) return [key, { outcome: { handover, kept: record.kept }, moved }]
			try {
				// the lot's own declarations kept in its folder before the worktree goes (the removal rule counted them)
				writeDeclarationArchives({ read: decision.read, archives: decision.archives })
				const { trashed, nodeModules } = closeWorktree({
					worktree: decision.worktree.path,
					check: decision.check,
					checkedLockText: decision.checkedLockText,
					main,
					worktreesFolder,
					now: params.now,
					spawner: params.spawner,
					moved,
					owner: lotOwners.get(key),
				})
				recordRemoved({ file: record.file, id: record.id, outcome: { trashed } })
				return [
					key,
					{
						outcome: {
							handover,
							closed: true,
							...(decision.dropped !== undefined && { dropped: decision.dropped }),
						},
						moved,
						nodeModules,
						trashed,
					},
				]
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
	// each hand-over closed now says so in its registry entry, every one that left with the worktree: the one thing a
	// later close reads as closed (a lot with no entry is closed by its `removed` line)
	if (store) {
		const closedNames = new Set(
			targets.flatMap(function closedEntries(target, index): string[] {
				const { outcome } = outcomes[index]
				if (!('closed' in outcome) || outcome.already === true) return []
				return (leaving.get(keys[index]) ?? [])
					.filter((entry) => entry.closed === undefined)
					.map((entry) => entry.name)
			}),
		)
		for (const name of closedNames) recordHandoverClosed({ store, name, at: params.now })
	}
	return outcomes
}

/**
 * Each target of a close decided before anything moves, with what the decisions read (once): the targets as the
 * registry holds their entries now, their keys (a worktree's real path), the lot owners, the cards log.
 */
function closeDecisionsOf(params: CloseDecisionParams): {
	context: CloseContext
	decisions: Decision[]
} {
	const main = mainCheckoutOf(params.cwd)
	const store = findHandoverStore(params.cwd)
	const worktreesFolder = join(dirname(main), WORKTREES_FOLDER)
	const runs = readOwnedRuns(main)
	const processes = readProcesses(params.listProcesses ?? listProcessFolders)
	const registered = params.registered ?? (store ? readStoreEntries(store) : [])
	// each target's entry as the registry holds it now: the settle commits a landed lot's pending entry
	const targets = params.settled.map(function refreshed({ target }): CloseTarget {
		if (target.entry === undefined) return target
		const name = target.entry.name
		return { ...target, entry: registered.find((entry) => entry.name === name) ?? target.entry }
	})
	// one worktree is closed once, whichever names and indexes reach it: keyed by its real path, read before
	// anything moves (a moved worktree has no real path left: its registered spelling would be another key)
	const keys = targets.map(function keyOf(target): string {
		return target.kind === 'unknown' || target.worktreePath === undefined
			? `argument:${target.argument}`
			: target.worktreePath
	})
	// every decision first, nothing moved yet: each argument with every keep rule (its own state, its own
	// branch), and the check of its worktree's node_modules
	// the lot keep rule: the repository's store read once for every argument, after the landings were settled (a
	// merged lot holds its landed fact: committed, it keeps nothing)
	const lotKeeps = lotsKeepingWorktrees({ repository: main })
	// the lot each worktree was made for, read once: its node_modules parks with that lot as its owner
	const lotOwners = readLotOwners(main)
	// read once for every argument: the registry's entries, the links around the workspace
	const links = readLinkScanSet({
		workspace: dirname(main),
		scratchRoots: params.scratchRoots ?? [],
	})
	// the final records and the removals of the repository, beside its registry (made with the first line it holds)
	const cardsLog = join(store ?? handoverStoreOf(main), CARDS_LOG_FILE)
	const decisions = params.settled.map(function decide({ kept }, index): Decision {
		const target = targets[index]
		if (kept !== undefined) return { kept }
		if (target.kind === 'unknown')
			return {
				kept: fillMessage({
					template: CLOSE_TARGET_TEXTS.unknown,
					values: { argument: target.argument },
				}),
			}
		return decideTarget({
			target,
			cardsLog,
			main,
			runFrom: params.runFrom,
			worktreesFolder,
			runs,
			processes,
			lotKeeps,
			registered,
			links,
		})
	})
	return {
		context: { main, store, worktreesFolder, registered, targets, keys, lotOwners, cardsLog },
		decisions,
	}
}

/**
 * What `lot close`'s own rules decide for each target, nothing moved: kept with why, closed already, or let go (with
 * its `node_modules` check). `lot prune` reads its plan's worktree items from it.
 *
 * @intent decide lot close targets without acting, one rule set for lot close and lot prune
 * @internal
 */
export function decideCloseTargets(params: CloseDecisionParams): Decision[] {
	return closeDecisionsOf(params).decisions
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
	target: Exclude<CloseTarget, { kind: 'unknown' }>
	/** The repository's `cards.log`: a lot whose worktree is gone is closed already when a removal moved it. */
	cardsLog: string
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
}): Decision {
	const { target } = params
	// an earlier close recorded it on the entry: nothing to decide, nothing to move
	if (
		target.entry?.closed !== undefined &&
		(target.kind === 'entry' || target.worktree === undefined)
	)
		return { alreadyClosed: true }
	if (target.kind === 'lot') {
		const { worktreePath } = target
		if (worktreePath === undefined)
			return { kept: fillMessage({ template: NO_LOT_WORKTREE, values: { lot: target.lot } }) }
		// a lot's worktree gone: closed when a recorded removal moved it, else nothing to close
		if (target.worktree === undefined)
			return movedByRemoval({ file: params.cardsLog, lot: target.lot, worktree: worktreePath })
				? { alreadyClosed: true }
				: {
						kept: fillMessage({
							template: CLOSE_TARGET_TEXTS.nothingToClose,
							values: { worktree: worktreePath },
						}),
					}
	}
	try {
		const why = whyKeep(params)
		if ('kept' in why) return why
		if (!existsSync(params.worktreesFolder))
			return {
				kept: `no ${WORKTREES_FOLDER}/ beside ${params.main}: the pool and the trash live there`,
			}
		const { worktree } = why
		if (!existsSync(join(worktree.path, 'node_modules')))
			return { ...why, check: undefined, checkedLockText: undefined }
		// the lock text read with the check: the pool entry is stamped with the key of what the check read
		return {
			...why,
			checkedLockText: readPackageLockText({ worktree: worktree.path }),
			check: checkNodeModules({ worktree: worktree.path }),
		}
	} catch (error) {
		return { kept: (error as Error).message.trim() }
	}
}

/**
 * Whether `cards.log` holds a removal that moved the lot's worktree: a `removing` line of the worktree item joined to a
 * `removed` outcome `trashed` or `deleted`, by the lot's name, else (a hand-over outside the store wrote `lot: null`)
 * by the worktree's real path.
 */
function movedByRemoval(params: { file: string; lot: string; worktree: string }): boolean {
	if (!existsSync(params.file)) return false
	const worktree = realPathThroughAncestors(params.worktree)
	return readCardsLog({ file: params.file }).removals.some(
		(removal) =>
			removal.item === 'worktree' &&
			(removal.outcome === 'trashed' || removal.outcome === 'deleted') &&
			(removal.lot === params.lot || realPathThroughAncestors(removal.path) === worktree),
	)
}

/**
 * The processes, or "not known" when the lister throws or cannot tell: then everything is kept.
 *
 * @intent read the processes once, a lister failure reading as "not known"
 * @internal
 */
export function readProcesses(
	listProcesses: () => ProcessFolder[] | string,
): ProcessFolder[] | string {
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
}): { kept: string } | Kept {
	const { target } = params
	if (target.kind === 'unknown' || target.worktreePath === undefined)
		return { kept: 'no hand-over of that name or index' }
	const { entry, worktreePath } = target
	// a target whose identity names no branch has nothing to compare its worktree with: kept
	if (target.branch === undefined) return { kept: CLOSE_TARGET_TEXTS.noBranch }
	const { branch } = target
	const lotKeep = params.lotKeeps.get(worktreePath)
	if (lotKeep) return { kept: lotKeep }
	// a lot target closes on its own settled state; one an entry registers, by that entry's state too
	if (target.kind === 'lot' && target.lotState === undefined) return { kept: 'not decided' }
	if (entry && entry.state !== 'committed' && entry.state !== 'abandoned')
		return { kept: `${entry.state}: only a committed or abandoned hand-over closes` }
	const open = openHandoverOfWorktree({
		worktree: worktreePath,
		name: entry?.name,
		registered: params.registered,
	})
	if (open)
		return {
			kept: `another hand-over of this worktree is ${open.state}: ${open.name} (only committed or abandoned ones let it close)`,
		}
	if (worktreePath === realPathOf(params.main))
		return {
			kept: `its worktree is the main checkout ${params.main}: never parked, moved or trashed`,
		}
	const worktree = target.worktree
	if (!worktree)
		return {
			kept: `${entry?.worktree ?? worktreePath} is no worktree of the repository (closed already, moved, or in the trash): nothing to close`,
		}
	if (worktree.branch !== branch)
		return {
			kept: `on ${worktree.branch ?? 'a detached HEAD'}, not on the hand-over's branch ${branch}: the worktree holds other work now`,
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
	// the landing a target closes by: its lot's folder (a hand-over's lot keeps its fact there), else the entry's
	const landedFolder = target.lotFolder ?? entry?.folder ?? worktreePath
	const landedFact = readLanded({ lotFolder: landedFolder })
	const landedBase = readIdentity({ lotFolder: landedFolder })?.base.commit
	const landedTips = landedFact !== undefined && 'tip' in landedFact ? [landedFact.tip] : []
	// a landed lot: is its current work landed (Q1); then, landed or not, would the removal lose a commit (Q2)
	const since = landedTips.flatMap((landedTip) =>
		workSinceLanding({
			root: worktree.path,
			branch,
			cut: landedBase ?? landedTip,
			landedTip,
		}),
	)
	if (since.length > 0)
		return {
			kept: fillMessage({
				template: CLOSE_KEPT_WORK,
				values: { work: workSinceLandingText(since), worktree: worktree.path },
			}),
		}
	const removes = { worktrees: [worktree.path], branches: [] }
	const lost = lostWork({ root: worktree.path, removes, landedTips })
	if (lost.length > 0)
		return {
			kept: fillMessage({
				template: CLOSE_KEPT_WORK,
				values: { work: lostWorkText(lost), worktree: worktree.path },
			}),
		}
	const own = ownDeclarationsOf({
		worktree: worktree.path,
		lotFolder: target.lotFolder,
		// the lot's base, read from the same folder whenever the target names one: a package it deleted is found there
		base: landedBase,
		owned: landedTips.length > 0 || (target.kind === 'lot' && target.lotState === 'canceled'),
	})
	if ('kept' in own) return own
	const { kept } = removableIgnored({
		worktree: worktree.path,
		main: params.main,
		archivedDeclarations: [
			...registeredArchivesOf({ worktree: worktree.path, entries: params.registered }),
			...own.counted,
		],
	})
	if (kept.length > IGNORED_FILES_SHOWN)
		return {
			kept: `${kept.length} ignored files git worktree remove would delete, first: ${kept.slice(0, IGNORED_FILES_SHOWN).join(', ')}`,
		}
	if (kept.length)
		return { kept: `ignored files git worktree remove would delete: ${kept.join(', ')}` }
	return {
		worktree,
		branch,
		dropped: droppedFromBranch({
			root: worktree.path,
			worktree: worktree.path,
			branch,
			landedTips,
		}),
		read: own.read,
		archives: own.archives,
	}
}

/**
 * The lot's own declarations (the worktree's lot files, the root's and each package's) by the one archive rule
 * (`keepDeclarations`), when its lot landed or is canceled and the worktree's root `.dialecte/lot` link resolves to its
 * folder: the bytes counted as archived (so they keep nothing), the lot files they were read from, and the archives
 * to write before the move; why it
 * stays when both archives of a package hold other bytes. Nothing for another lot's declarations, or none: the
 * ignored-file rule decides.
 */
function ownDeclarationsOf(params: {
	worktree: string
	lotFolder: string | undefined
	/** The lot's base commit, when its identity names one. */
	base: string | undefined
	owned: boolean
}):
	| { counted: CountedArchive[]; read: ReadDeclaration[]; archives: DeclarationArchive[] }
	| { kept: string } {
	const { worktree, lotFolder } = params
	if (lotFolder === undefined || !isLinkedToLot({ worktree, folder: lotFolder }))
		return { counted: [], read: [], archives: [] }
	const { base } = params
	const { counted, read, archives, kept } = keepDeclarations({
		worktree,
		folder: lotFolder,
		owned: params.owned,
		bases: base === undefined ? [] : [base],
	})
	if (kept.length > 0)
		return {
			kept: kept
				.map((declaration) =>
					fillMessage({
						template: CLOSE_TARGET_TEXTS.declarationKept,
						values: { ...declaration, folder: lotFolder },
					}),
				)
				.join('; '),
		}
	return { counted, read, archives }
}

/**
 * Whether the worktree's root `.dialecte/lot` link resolves to the lot folder `folder`: what proves the worktree's
 * lot files are that lot's own. None, a broken one, or one to another lot says no.
 */
function isLinkedToLot(params: { worktree: string; folder: string }): boolean {
	const link = join(params.worktree, ...LOT_LINK_SEGMENTS)
	const target = realPathOf(link)
	return target !== link && target === realPathOf(params.folder)
}

/**
 * The commits the branch's reflog alone holds once its worktree goes (reset or rebased away from the branch, none of
 * them on its tip), said as information: their line, or undefined when there is none. Git expires them with the
 * reflog, as it would have with the worktree's HEAD reflog.
 */
function droppedFromBranch(params: {
	root: string
	worktree: string
	branch: string
	landedTips: string[]
}): string | undefined {
	const { root, branch } = params
	const tip = readCommitOrNone({ root, ref: `refs/heads/${branch}` })
	const dropped = lostWork({
		root,
		removes: { worktrees: [params.worktree], branches: [branch] },
		landedTips: params.landedTips,
	})
		.map((lost) => lost.commit)
		.filter(
			(commit) =>
				tip === undefined || !isAncestorCommit({ root, ancestor: commit, descendant: tip }),
		)
	return dropped.length === 0 ? undefined : droppedHeldText(dropped)
}

/** Another hand-over registered for the same worktree (by real path) that is neither committed nor abandoned. */
function openHandoverOfWorktree(params: {
	/** The worktree's real path. */
	worktree: string
	/** The entry the close names, left out of the others. */
	name: string | undefined
	registered: readonly StoreEntry[]
}): StoreEntry | undefined {
	const { worktree } = params
	return params.registered.find(
		(other) =>
			other.name !== params.name &&
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
	/** The `package-lock.json` text `check` read, read with it. */
	checkedLockText: string | undefined
	main: string
	worktreesFolder: string
	now: Date
	spawner: BackgroundSpawner
	moved: string[]
	/** The lot the worktree was made for, when one names it: the pool entry's owner. */
	owner?: string
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
			checkedLockText: params.checkedLockText,
			owner: params.owner,
		})
		where =
			typeof parked === 'string'
				? `trashed: ${parked}`
				: `pooled in ${parked.entry}${parked.note === undefined ? '' : ` (${parked.note})`}`
	}
	for (const removal of removals) params.spawner(removal)
	return { trashed, nodeModules: where }
}

/** The lot of the repository's store that names each worktree, by the worktree's real path; none without a store. */
function readLotOwners(main: string): Map<string, string> {
	const location = locateStore({ from: main })
	if (location === undefined) return new Map()
	return new Map(
		listLotIdentities({ store: location.store }).flatMap(function ownerOf(entry): [
			string,
			string,
		][] {
			return typeof entry.identity.worktree === 'string'
				? [[realPathOf(entry.identity.worktree), entry.name]]
				: []
		}),
	)
}
