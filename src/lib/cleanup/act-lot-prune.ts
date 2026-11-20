/**
 * `lot prune --yes`'s acts, per repository, in order (design 3.2): (1) the pending registry entries of the lots read
 * landed committed; (2) every lot worktree the plan lets go closed by one `closeHandovers` call (its own rules decide
 * again at the move); (3) each throwaway re-proved, recorded, moved into the trash, proved once more there, then its
 * `--force` removal started (a failed second proof leaves it in the trash, registered); (4) each branch re-read (its
 * tip, the worktrees, the open stacks) and deleted by `update-ref -d` at the tip proved, or kept with why.
 */
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { CARDS_LOG_FILE } from '../events/cards-log.constants.ts'
import { writeRemoved, writeRemoving } from '../events/cards-log.ts'
import { realPathOf } from '../file-system.ts'
import { readCommitOrNone, readGit, tryReadGit } from '../git.ts'
import { closeHandovers, readProcesses } from '../handover/close-handovers.ts'
import { closeTargetsOf } from '../handover/close-targets.ts'
import { readStoreEntries } from '../handover/handover-store-read.ts'
import {
	findHandoverStore,
	handoverStoreOf,
	recordHandoverState,
} from '../handover/handover-store.ts'
import { REMOVAL_ID_PREFIX } from '../handover/handover.constants.ts'
import { fillMessage } from '../knowledge/standard/fill-message.ts'
import { lostWork, lostWorkText } from '../landing/lost-work.ts'
import { WORKTREES_FOLDER } from '../workspace.constants.ts'
import { listWorktrees } from '../worktree/add-worktree.ts'
import { listProcessFolders } from '../worktree/process-folders.ts'
import { isParked, trashWorktree } from '../worktree/trash.ts'
import { ACT_TEXTS, NO_SUCH_SECTION } from './act-lot-prune.constants.ts'
import { THROWAWAY_ROUND_PATTERN } from './lot-prune-facts.constants.ts'
import { commonKeepOf, holdersOf, keepReadsOf, leftInTrashOf } from './lot-prune-facts.ts'
import { PRUNE_PLAN_TEXTS } from './plan-lot-prune.constants.ts'
import { heldByOthers } from './plan-lot-prune.ts'
import { proveThrowaway } from './throwaway-proof.ts'

import type { RemovalBy } from '../events/cards-log.types.ts'
import type { CloseSettle } from '../handover/close-targets.types.ts'
import type { BackgroundSpawner, ProcessFolder } from '../worktree/worktree.types.ts'
import type { ActedItem, ActedItems, LotPruneOutcomes } from './act-lot-prune.types.ts'
import type {
	BranchFacts,
	KeepReads,
	LeftInTrash,
	LotFacts,
	LotPruneFacts,
	RepositoryFacts,
	StoreLot,
} from './lot-prune-facts.types.ts'
import type { LotPrunePlan, PlannedItem } from './plan-lot-prune.types.ts'

/**
 * The plan's items acted on, each proof read again at the move: every item's outcome, by lot then `<item> <name>`.
 *
 * @intent remove what a lot prune plan lets go, never on a stale proof
 * @internal
 */
export function actLotPrune(params: {
	plan: LotPrunePlan
	facts: LotPruneFacts
	by: RemovalBy
	runFrom: string
	now: Date
	spawner: BackgroundSpawner
	listProcesses?: () => ProcessFolder[] | string
	scratchRoots?: readonly string[]
	/** Told a throwaway's place in the trash once it moved, before its second proof (a test seam). */
	afterThrowawayMove?: (trashed: string) => void
	/** The store's lots, read again before a branch is deleted (a stack started since keeps its parent). */
	readStoreLots: (main: string) => readonly StoreLot[]
}): LotPruneOutcomes {
	const outcomes: LotPruneOutcomes = new Map()
	params.plan.repositories.forEach(function actRepository(planned, index) {
		const repository = params.facts.repositories[index]
		commitLanded({ repository })
		const closed = closeWorktrees({ ...params, repository, planned })
		const throwaways = moveThrowaways({ ...params, repository, planned })
		const started = new Set([...closed.started, ...throwaways.started].map(realPathOf))
		const branches = deleteBranches({ ...params, repository, planned, started })
		for (const [key, acted] of [...closed.acted, ...throwaways.acted, ...branches])
			outcomes.set(key, acted)
	})
	return outcomes
}

/**
 * The pending entries of the lots read landed, committed: what `lot close` does for a merged lot. One that cannot be
 * written stays pending, and that lot's worktree close keeps it with the entry's state.
 */
function commitLanded(params: { repository: RepositoryFacts }): void {
	const store = findHandoverStore(params.repository.main)
	for (const lot of params.repository.lots)
		if ('landed' in lot.settled)
			tryTo(() => recordHandoverState({ store, folder: lot.lotFolder, state: 'committed' }))
}

/** The answer of `act`, or the message of what it threw. */
function tryTo<T>(act: () => T): T | { thrown: string } {
	try {
		return act()
	} catch (error) {
		return { thrown: (error as Error).message.trim() }
	}
}

/** The repository's `cards.log`, beside its registry, its folder made when the registry has none yet. */
function cardsLogFileOf(main: string): string {
	const store = findHandoverStore(main) ?? handoverStoreOf(main)
	mkdirSync(store, { recursive: true })
	return join(store, CARDS_LOG_FILE)
}

/** The key of an item's outcome: its lot, its kind, its name. */
export function outcomeKeyOf(params: { lot: string; item: PlannedItem }): string {
	return `${params.lot} ${params.item.item} ${params.item.name}`
}

/** The lot worktrees the plan lets go, closed by one `closeHandovers` call: each outcome, and where each moved. */
function closeWorktrees(params: {
	repository: RepositoryFacts
	planned: LotPrunePlan['repositories'][number]
	by: RemovalBy
	runFrom: string
	now: Date
	spawner: BackgroundSpawner
	listProcesses?: () => ProcessFolder[] | string
	scratchRoots?: readonly string[]
}): ActedItems {
	const going = params.planned.lots.flatMap((lot) =>
		lot.items
			.filter((item) => item.item === 'worktree' && 'go' in item.decision)
			.map((item) => ({ lot: lot.lot, item })),
	)
	if (going.length === 0) return { acted: [], started: [] }
	const closed = tryTo(() => closeGoing({ ...params, going }))
	if ('thrown' in closed)
		return {
			acted: going.map((one): [string, ActedItem] => [outcomeKeyOf(one), { kept: closed.thrown }]),
			started: [],
		}
	return closed
}

/** The worktrees going, closed by `lot close`'s own rules at the move: each outcome, and where each removal started. */
function closeGoing(params: {
	repository: RepositoryFacts
	going: { lot: string; item: PlannedItem }[]
	by: RemovalBy
	runFrom: string
	now: Date
	spawner: BackgroundSpawner
	listProcesses?: () => ProcessFolder[] | string
	scratchRoots?: readonly string[]
}): ActedItems {
	const { repository, going } = params
	const main = repository.main
	const worktrees = listWorktrees(main).filter(
		(worktree) => !isParked({ path: worktree.path, main }),
	)
	const targets = closeTargetsOf({ main, names: going.map((one) => one.lot), worktrees })
	const settled: CloseSettle = targets.map(function settleTarget(target, index) {
		const lot = lotOf({ repository, lot: going[index].lot })
		const { settled: landing } = lot
		if (target.kind !== 'lot' || 'open' in landing || 'notRead' in landing)
			return { target, landed: [], kept: ACT_TEXTS.notDecided }
		// the landed tip the facts proved still in the repository: a pruned one holds nothing
		return {
			target: { ...target, lotState: 'canceled' in landing ? 'canceled' : 'committed' },
			landed: [],
			...('landed' in landing &&
				lot.landedTipGone === undefined && { landedTip: landing.landed.tip }),
		}
	})
	const results = closeHandovers({
		cwd: main,
		runFrom: params.runFrom,
		settled,
		now: params.now,
		spawner: params.spawner,
		listProcesses: params.listProcesses,
		scratchRoots: params.scratchRoots,
		by: params.by,
	})
	const acted = results.map(function actedOf(result, index): [string, ActedItem] {
		const key = outcomeKeyOf(going[index])
		const { outcome } = result
		if (!('closed' in outcome)) return [key, { kept: outcome.kept }]
		// closed by another run in the meantime: nothing of this run moved it
		if (outcome.already === true || result.trashed === undefined)
			return [key, { kept: ACT_TEXTS.gone }]
		return [key, { removed: result.trashed }]
	})
	return {
		acted,
		started: acted.flatMap(([, outcome]) => ('removed' in outcome ? [outcome.removed] : [])),
	}
}

/** The lot named `lot` among the repository's facts. */
function lotOf(params: { repository: RepositoryFacts; lot: string }): LotFacts {
	const found = params.repository.lots.find((one) => one.lot === params.lot)
	if (found === undefined) throw new Error(`no facts for lot ${params.lot}`)
	return found
}

/**
 * Each throwaway the plan lets go: proved again, its `removing` line written, moved into the trash (its removal held
 * back), proved once more where it lies, then its `--force` removal started; a proof that fails keeps it (in the trash
 * after the move, still registered). Its outcome, and the worktrees moved.
 */
function moveThrowaways(params: {
	repository: RepositoryFacts
	planned: LotPrunePlan['repositories'][number]
	by: RemovalBy
	now: Date
	spawner: BackgroundSpawner
	runFrom: string
	listProcesses?: () => ProcessFolder[] | string
	scratchRoots?: readonly string[]
	afterThrowawayMove?: (trashed: string) => void
}): ActedItems {
	const results = params.planned.lots.flatMap((lot) =>
		lot.items
			.filter((item) => item.item === 'throwaway' && 'go' in item.decision)
			.map((item) => ({
				key: outcomeKeyOf({ lot: lot.lot, item }),
				outcome: actedOf(tryTo(() => moveThrowaway({ ...params, lot: lot.lot, path: item.name }))),
			})),
	)
	return {
		acted: results.map((result): [string, ActedItem] => [result.key, result.outcome]),
		started: results.flatMap(({ outcome }) => ('removed' in outcome ? [outcome.removed] : [])),
	}
}

/** An act's outcome, or the item kept with what the act threw. */
function actedOf(outcome: ActedItem | { thrown: string }): ActedItem {
	return 'thrown' in outcome ? { kept: outcome.thrown } : outcome
}

/**
 * One throwaway the plan lets go: proved again, its `removing` line written, moved into the trash (its removal held
 * back), proved once more where it lies, then its `--force` removal started. Its outcome, and whether it moved.
 */
function moveThrowaway(params: {
	repository: RepositoryFacts
	lot: string
	path: string
	by: RemovalBy
	now: Date
	spawner: BackgroundSpawner
	runFrom: string
	listProcesses?: () => ProcessFolder[] | string
	scratchRoots?: readonly string[]
	afterThrowawayMove?: (trashed: string) => void
}): ActedItem {
	const { repository, path } = params
	const main = repository.main
	const facts = lotOf({ repository, lot: params.lot })
	const throwaway = facts.throwaways.find((one) => one.path === path)
	const branch = throwaway?.branch
	if (throwaway === undefined || branch === undefined) return { kept: ACT_TEXTS.notDecided }
	// moved or removed by another run since the plan: nothing for this run to do
	if (!existsSync(path)) return { kept: ACT_TEXTS.gone }
	const proof = { repository, facts, branch, handMade: throwaway.handMade }
	// the keep rules' reads, once for this throwaway: its second proof lists the processes again, nothing else
	const keepReads = keepReadsOf({ ...params, main })
	const first = reprove({ ...proof, path, keepReads })
	if (first !== undefined) return { kept: first }
	const file = cardsLogFileOf(main)
	const id = `${REMOVAL_ID_PREFIX}${randomUUID()}`
	writeRemoving({
		file,
		line: {
			id,
			at: params.now.toISOString(),
			lot: params.lot,
			item: 'throwaway',
			path: realPathOf(path),
			branch,
			tip: readCommitOrNone({ root: main, ref: `refs/heads/${branch}` }) ?? null,
			records: null,
			by: params.by,
		},
	})
	const worktreesFolder = join(dirname(main), WORKTREES_FOLDER)
	const move = moveHeld({ worktree: path, main, worktreesFolder, now: params.now })
	if ('refused' in move) {
		writeRemoved({
			file,
			line: { id, at: new Date().toISOString(), outcome: 'kept', reason: move.refused },
		})
		return { kept: move.refused }
	}
	const { trashed, held } = move
	params.afterThrowawayMove?.(trashed)
	const second = reprove({
		...proof,
		path: trashed,
		keepReads: {
			...keepReads,
			processes: readProcesses(params.listProcesses ?? listProcessFolders),
		},
	})
	if (second !== undefined) {
		const reason = fillMessage({
			template: ACT_TEXTS.leftInTrash,
			values: { reason: second, trashed },
		})
		// the trashed path recorded: the next runs read it as left in the trash, never as a removal git refused
		writeRemoved({
			file,
			line: { id, at: new Date().toISOString(), outcome: 'kept', reason, trashed },
		})
		return { kept: reason }
	}
	for (const command of held) params.spawner(command)
	writeRemoved({ file, line: { id, at: new Date().toISOString(), outcome: 'trashed', trashed } })
	return { removed: trashed }
}

/** The worktree moved into the trash, its removal held back: where it went with the held commands, or why it did not move. */
function moveHeld(params: {
	worktree: string
	main: string
	worktreesFolder: string
	now: Date
}): { trashed: string; held: Parameters<BackgroundSpawner>[0][] } | { refused: string } {
	const held: Parameters<BackgroundSpawner>[0][] = []
	try {
		const { trashed } = trashWorktree({
			worktree: params.worktree,
			repository: params.main,
			worktreesFolder: params.worktreesFolder,
			now: params.now,
			spawner: function hold(command) {
				held.push(command)
			},
		})
		return { trashed, held }
	} catch (error) {
		return { refused: (error as Error).message.trim() }
	}
}

/** A throwaway's proof read again at `path` (where it is now): why it stays, or undefined when it may go. */
function reprove(params: {
	repository: RepositoryFacts
	facts: LotFacts
	path: string
	branch: string
	handMade: boolean
	/** What the common keep rules read, read right before this proof. */
	keepReads: KeepReads
}): string | undefined {
	const { repository, facts } = params
	// the common keep rules read again now: a process, a mutation run, a link, a lock, a registry entry since the plan
	const listed = listWorktrees(repository.main).find(
		(worktree) => realPathOf(worktree.path) === realPathOf(params.path),
	)
	const keep = commonKeepOf({
		reads: params.keepReads,
		path: realPathOf(params.path),
		branch: params.branch,
		listed,
	})
	if (keep !== undefined) return keep
	const round = Number(THROWAWAY_ROUND_PATTERN.exec(params.branch)?.[1] ?? 0)
	const landedTip =
		'landed' in facts.settled && facts.landedTipGone === undefined
			? facts.settled.landed.tip
			: undefined
	const lotBranch = facts.branches.find((branch) => branch.own)?.branch
	try {
		const proof = proveThrowaway({
			main: repository.main,
			throwaway: params.path,
			branch: params.branch,
			lotFolder: facts.lotFolder,
			round,
			holders: [
				...(lotBranch === undefined ? [] : [`refs/heads/${lotBranch}`]),
				...(landedTip === undefined ? [] : [landedTip]),
				...(repository.baseRef === undefined ? [] : [repository.baseRef]),
			],
			landedTips: landedTip === undefined ? [] : [landedTip],
			...(params.handMade && { handMadeOf: facts.lot }),
		})
		return proof.goes ? undefined : proof.kept
	} catch (error) {
		return (error as Error).message.trim()
	}
}

/**
 * A branch a worktree still checks out: kept with the reason when a removal left that worktree in the trash, waiting
 * for the trash when its removal started (this run or an earlier one), else kept, checked out.
 */
function checkedOutOutcomeOf(params: {
	main: string
	checkedOut: string
	started: ReadonlySet<string>
	leftInTrash: ReadonlyMap<string, LeftInTrash>
}): ActedItem {
	const { checkedOut } = params
	const left = params.started.has(checkedOut)
		? undefined
		: params.leftInTrash.get(realPathOf(checkedOut))
	if (left !== undefined) return { kept: left.reason }
	if (params.started.has(checkedOut) || isParked({ path: checkedOut, main: params.main }))
		return {
			waiting: fillMessage({ template: ACT_TEXTS.waiting, values: { trashed: checkedOut } }),
		}
	return { kept: fillMessage({ template: ACT_TEXTS.checkedOut, values: { worktree: checkedOut } }) }
}

/**
 * Each branch the plan lets go, or that waits on a worktree of the run: still checked out by a worktree (one moved
 * this run: waiting for the trash), a stack started on it since, or its tip moved: kept; else its `removing` line,
 * `update-ref -d` at the tip proved, its config section, its `removed` line.
 */
function deleteBranches(params: {
	repository: RepositoryFacts
	planned: LotPrunePlan['repositories'][number]
	/** The trashed worktrees whose removal started in this run. */
	started: ReadonlySet<string>
	by: RemovalBy
	now: Date
	readStoreLots: (main: string) => readonly StoreLot[]
}): [string, ActedItem][] {
	const { repository } = params
	const main = repository.main
	const store = findHandoverStore(main)
	// read after the throwaway acts: this run's left-in-trash removals are written by then
	const leftInTrash = leftInTrashOf(main)
	// the landed tips the plan's joint proof held, read again with each branch's own proof at its delete
	const landedTips = repository.lots.flatMap((lot) =>
		'landed' in lot.settled && lot.landedTipGone === undefined ? [lot.settled.landed.tip] : [],
	)
	return params.planned.lots.flatMap(function deleteOfLot(lot): [string, ActedItem][] {
		const facts = lotOf({ repository, lot: lot.lot })
		return lot.items
			.filter((item) => item.item === 'branch' && !('kept' in item.decision))
			.map(function deleteOne(item): [string, ActedItem] {
				const key = outcomeKeyOf({ lot: lot.lot, item })
				const proved = facts.branches.find((branch) => branch.branch === item.name)
				if (proved === undefined) return [key, { kept: ACT_TEXTS.notDecided }]
				const outcome = tryTo(() =>
					deleteAtMove({
						...params,
						main,
						store,
						leftInTrash,
						lot: lot.lot,
						branch: proved,
						landedTips,
					}),
				)
				return [key, actedOf(outcome)]
			})
	})
}

/**
 * One branch deleted once its holders are read again: its tip, the worktrees checking it out, the stacks, the pending
 * hand-overs and the stashes (an open lot's own branch is read from the plan: a lot this run settled reads landed).
 */
function deleteAtMove(params: {
	main: string
	store: string | undefined
	lot: string
	branch: BranchFacts
	/** The landed tips of the run's lots: commits they hold are not lost. */
	landedTips: readonly string[]
	started: ReadonlySet<string>
	leftInTrash: ReadonlyMap<string, LeftInTrash>
	by: RemovalBy
	now: Date
	readStoreLots: (main: string) => readonly StoreLot[]
}): ActedItem {
	const { main, store, branch } = params
	const tip = readCommitOrNone({ root: main, ref: `refs/heads/${branch.branch}` })
	if (tip === undefined) return { kept: ACT_TEXTS.gone }
	const holders = holdersOf({
		main,
		worktrees: listWorktrees(main),
		entries: store === undefined ? [] : readStoreEntries(store),
		storeLots: params.readStoreLots(main),
	})
	// the main checkout's branch read again: a checkout made there since the plan keeps it
	const mainBranch = tryReadGit({
		root: main,
		args: ['symbolic-ref', '--quiet', '--short', 'HEAD'],
	})?.trim()
	if (mainBranch === branch.branch) return { kept: PRUNE_PLAN_TEXTS.mainBranch }
	const checkedOut = holders.checkedOut.get(branch.branch)
	if (checkedOut !== undefined) return checkedOutOutcomeOf({ ...params, checkedOut })
	// an open lot's own branch is not read again: a lot this run settled may still read open in its store, and a new
	// lot refuses a branch that exists, so only a terminal lot made open again could slip in, and it holds its branch
	// through its worktree's checkout, read above
	const held = heldByOthers({ holders, branch: branch.branch })
	if (held !== undefined) return { kept: held }
	// its loss read again now: another run may have deleted a branch holding the same commits since the plan (a tip
	// moved since is left to git, which refuses the delete at the tip proved)
	const lost =
		tip === branch.tip
			? lostWork({
					root: main,
					removes: { worktrees: [], branches: [branch.branch] },
					landedTips: [...params.landedTips],
				})
			: []
	if (lost.length > 0) return { kept: lostWorkText(lost) }
	return deleteRef({
		main,
		file: cardsLogFileOf(main),
		lot: params.lot,
		branch: branch.branch,
		tip: branch.tip,
		by: params.by,
		now: params.now,
	})
}

/**
 * The branch deleted at the tip proved: its `removing` line, `git update-ref -d <ref> <tip>` (git refuses a moved
 * tip), its config section (none is fine), its `removed` line; git's refusal keeps it.
 */
function deleteRef(params: {
	main: string
	file: string
	lot: string
	branch: string
	tip: string
	by: RemovalBy
	now: Date
}): ActedItem {
	const { main, file, branch, tip } = params
	const id = `${REMOVAL_ID_PREFIX}${randomUUID()}`
	writeRemoving({
		file,
		line: {
			id,
			at: params.now.toISOString(),
			lot: params.lot,
			item: 'branch',
			path: main,
			branch,
			tip,
			records: null,
			by: params.by,
		},
	})
	try {
		readGit({ root: main, args: ['update-ref', '-d', `refs/heads/${branch}`, tip] })
	} catch (error) {
		const reason = (error as Error).message.trim()
		writeRemoved({ file, line: { id, at: new Date().toISOString(), outcome: 'kept', reason } })
		return { kept: reason }
	}
	const section = tryReadGitError({
		main,
		args: ['config', '--remove-section', `branch.${branch}`],
	})
	writeRemoved({ file, line: { id, at: new Date().toISOString(), outcome: 'deleted' } })
	return section === undefined || section.includes(NO_SUCH_SECTION)
		? { removed: ACT_TEXTS.deleted }
		: { removed: `${ACT_TEXTS.deleted}; ${section}` }
}

/** A git command's error text, or undefined when it succeeded. */
function tryReadGitError(params: { main: string; args: string[] }): string | undefined {
	try {
		readGit({ root: params.main, args: params.args })
		return undefined
	} catch (error) {
		return (error as Error).message.trim()
	}
}
