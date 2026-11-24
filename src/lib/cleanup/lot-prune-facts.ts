/**
 * What `lot prune` reads before it decides (design 3.2): per repository, read once (the base, the main checkout's
 * branch, the worktrees, the registry, the open lots and their stacks, the stashes, the processes, `cards.log`); per
 * lot, its settled landing, what `lot close`'s own rules decide for its worktree, its throwaways (recorded and
 * hand-made) with their proofs, and its branches with the commits deleting them would lose.
 */
import { existsSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

import { CARDS_LOG_FILE } from '../events/cards-log.constants.ts'
import { readCardsLog } from '../events/cards-log.ts'
import { readEvents } from '../events/read-events.ts'
import { isAtOrInsideReal, realPathOf } from '../file-system.ts'
import { findBaseBranchRef } from '../gate/gate-base.ts'
import { readCommitOrNone, tryReadGit } from '../git.ts'
import { decideCloseTargets } from '../handover/close-handovers.ts'
import { closeTargetsOf } from '../handover/close-targets.ts'
import { handoverLockPath } from '../handover/handover-lock.ts'
import { readStoreEntries } from '../handover/handover-store-read.ts'
import { findHandoverStore, handoverStoreOf } from '../handover/handover-store.ts'
import { hostNounsOf } from '../host/select-host.ts'
import { lostWork, workSinceLanding } from '../landing/lost-work.ts'
import { settleLotLanding } from '../landing/lot-landing.ts'
import { readPackageJson } from '../package-json.ts'
import { roundNames } from '../review-rounds/round-names.ts'
import { readIdentity } from '../store/identity.ts'
import { lotItemOf, readLotItems } from '../store/lot-items.ts'
import { keptByDecision } from '../store/lot-keep.ts'
import { readCheckedLotState, registryOfLotFolder } from '../store/lot-records.ts'
import { isClosedState, lotState } from '../store/lot-state.ts'
import { readStack } from '../store/stack.ts'
import { DAMAGED_STATE, LOT_KEEP_REASON, STORE_FILES } from '../store/store.constants.ts'
import { WORKTREES_FOLDER } from '../workspace.constants.ts'
import { listWorktrees } from '../worktree/add-worktree.ts'
import { linkReaching } from '../worktree/folder-links.ts'
import { listProcessFolders, processWorkingIn, readProcesses } from '../worktree/process-folders.ts'
import { mutationRunKeeping, readOwnedRuns } from '../worktree/prune-worktrees.ts'
import { isParked } from '../worktree/trash.ts'
import { STASH_SUBJECT_PATTERN } from '../worktree/worktree.constants.ts'
import { linesOf, readGitOrWhy } from './git-read.ts'
import { matchHandMadeThrowaways } from './hand-made-throwaways.ts'
import {
	PRUNE_FACT_TEXTS,
	THROWAWAY_ADD_STEP,
	THROWAWAY_ROUND_PATTERN,
} from './lot-prune-facts.constants.ts'
import { PRUNE_PLAN_TEXTS } from './plan-lot-prune.constants.ts'
import { readLinkScanSet } from './read-link-scan-set.ts'
import { proveThrowaway } from './throwaway-proof.ts'

import type { Removal } from '../events/cards-log.types.ts'
import type { CloseSettle } from '../handover/close-targets.types.ts'
import type { StoreEntry } from '../handover/handover.types.ts'
import type { HostAdapter } from '../host/host.types.ts'
import type { SettledLot } from '../landing/lot-landing.types.ts'
import type { KeepDecision } from '../store/keep-decisions.types.ts'
import type { LotRecord } from '../store/lot-items.types.ts'
import type { ListedWorktree, ProcessFolder } from '../worktree/worktree.types.ts'
import type {
	BranchFacts,
	BranchHolders,
	BranchLoss,
	CandidateBranch,
	LotFacts,
	PruneReads,
	ReadLot,
	RecordedThrowaway,
	KeepReads,
	LeftInTrash,
	LotPruneFacts,
	RepositoryFacts,
	ThrowawayFacts,
	WorktreeFacts,
} from './lot-prune-facts.types.ts'

/**
 * The facts of the lots in `lotFolders`, grouped by repository, every repository read once.
 *
 * @intent read once everything lot prune decides from
 * @internal
 */
export function readLotPruneFacts(params: {
	lotFolders: readonly string[]
	host: HostAdapter | undefined
	now: Date
	/** Where the command runs from: a worktree it stands in is kept. */
	runFrom: string
	listProcesses?: () => ProcessFolder[] | string
	scratchRoots?: readonly string[]
}): LotPruneFacts {
	const byRepository = new Map<string, string[]>()
	for (const lotFolder of new Set(params.lotFolders.map((folder) => realPathOf(folder)))) {
		const repository = repositoryOf(lotFolder)
		if (repository === undefined) continue
		byRepository.set(repository, [...(byRepository.get(repository) ?? []), lotFolder])
	}
	return {
		repositories: [...byRepository].map(([main, lotFolders]) =>
			readRepositoryFacts({ ...params, main, lotFolders }),
		),
	}
}

/** The repository a lot folder's identity names; undefined when its identity does not read. */
function repositoryOf(lotFolder: string): string | undefined {
	const identity = readIdentity({ lotFolder })
	return identity === undefined ? undefined : realPathOf(identity.repository)
}

/** One repository's facts. */
function readRepositoryFacts(params: {
	main: string
	lotFolders: readonly string[]
	host: HostAdapter | undefined
	now: Date
	runFrom: string
	listProcesses?: () => ProcessFolder[] | string
	scratchRoots?: readonly string[]
}): RepositoryFacts {
	const read = readRepository(params)
	const lots = params.lotFolders.map((lotFolder) => readLot({ reads: read, lotFolder }))
	// the lots this run settled read their settled state: a merged lot is no open lot holding its own branch
	const settledStates = new Map(lots.map((lot) => [lot.lotFolder, lot.state]))
	const lotItems = {
		...read.lotItems,
		lots: read.lotItems.lots.map((lot) => ({
			...lot,
			state: settledStates.get(realPathOf(lot.lotFolder)) ?? lot.state,
		})),
	}
	// a merged lot's entry reads committed: the acts commit it before anything moves
	const landedFolders = new Set(
		lots.flatMap((lot) => ('landed' in lot.settled ? [realPathOf(lot.lotFolder)] : [])),
	)
	const entries = read.entries.map((entry) =>
		landedFolders.has(realPathOf(entry.folder)) ? { ...entry, state: 'committed' as const } : entry,
	)
	const reads: PruneReads = {
		...read,
		entries,
		lotItems,
		holders: holdersOf({
			main: read.main,
			worktrees: read.worktrees,
			entries,
			lots: lotItems.lots,
		}),
	}
	const decided = decideWorktrees({ ...params, reads, lots })
	const candidates = candidateBranchesOf({ reads, lots })
	const lost = lostByBranch({ reads, lots, candidates })
	return {
		main: params.main,
		nouns: hostNounsOf({ root: params.main }),
		baseBranch: reads.baseBranch,
		...(reads.baseRef !== undefined && { baseRef: reads.baseRef }),
		mainBranch: reads.mainBranch,
		processes: typeof reads.processes === 'string' ? reads.processes : 'known',
		holders: reads.holders,
		leftInTrash: new Map(
			[...reads.leftInTrash].map(([trashed, left]) => [trashed, left.reason] as const),
		),
		lots: lots.map((lot, index) =>
			lotFactsOf({ reads, lot, worktree: decided[index], candidates, lost }),
		),
	}
}

/** What the repository's lots share, read once. */
function readRepository(params: {
	main: string
	host: HostAdapter | undefined
	now: Date
	runFrom: string
	listProcesses?: () => ProcessFolder[] | string
	scratchRoots?: readonly string[]
}): PruneReads {
	const { main } = params
	const found = findBaseBranchRef({ root: main, packageJson: readPackageJson(main) })
	const baseBranch = 'refusal' in found ? '' : found.branch
	const baseRef = 'refusal' in found ? undefined : found.ref
	const mainBranch = tryReadGit({
		root: main,
		args: ['symbolic-ref', '--quiet', '--short', 'HEAD'],
	})?.trim()
	const worktrees = listWorktrees(main)
	const store = findHandoverStore(main)
	const entries = store === undefined ? [] : readStoreEntries(store)
	const cardsLog = join(store ?? handoverStoreOf(main), CARDS_LOG_FILE)
	const cards = existsSync(cardsLog) ? readCardsLog({ file: cardsLog }) : undefined
	const lotItems = readLotItems({ repository: main })
	return {
		main,
		baseBranch,
		baseRef,
		mainBranch: mainBranch || undefined,
		worktrees,
		entries,
		cardsLog,
		cards: cards?.cards ?? [],
		removals: cards?.removals ?? [],
		lotItems,
		processes: readProcesses(params.listProcesses ?? listProcessFolders),
		links: readLinkScanSet({ workspace: dirname(main), scratchRoots: params.scratchRoots ?? [] }),
		runs: readOwnedRuns(main),
		leftInTrash: leftInTrashOf(main),
		holders: holdersOf({ main, worktrees, entries, lots: lotItems.lots }),
		host: params.host,
		now: params.now,
		runFrom: params.runFrom,
		listProcesses: params.listProcesses,
		scratchRoots: params.scratchRoots,
	}
}

/**
 * Every branch something other than a terminal lot holds: open lots' own branches, their stack parents' branches, the
 * open lots whose stack is damaged, the stashes', the pending hand-overs', and every registered worktree's checkout.
 */
export function holdersOf(params: {
	main: string
	worktrees: readonly ListedWorktree[]
	entries: readonly StoreEntry[]
	/** The store's lots (`readLotItems`): an open or damaged one holds its branch and its stack parent's. */
	lots: readonly LotRecord[]
}): BranchHolders {
	const { openLots, stackParents, damagedStacks } = lotHoldersOf(params.lots)
	const stashList = readGitOrWhy({
		root: params.main,
		args: ['stash', 'list', '--format=%gs'],
		what: 'the stashes',
	})
	const stashes = new Set(
		('output' in stashList ? linesOf(stashList.output) : []).flatMap((subject) => {
			const branch = STASH_SUBJECT_PATTERN.exec(subject)?.[1]
			return branch === undefined ? [] : [branch]
		}),
	)
	const pendingHandovers = new Map(
		params.entries
			.filter((entry) => entry.state === 'pending')
			.map((entry) => [entry.branch, entry.name]),
	)
	// a worktree whose folder is gone (prunable) checks nothing out: git worktree prune drops its entry; a locked one
	// still does (its folder may be on a volume not mounted now)
	const checkedOut = new Map(
		params.worktrees
			.slice(1)
			.flatMap((worktree) =>
				worktree.branch === undefined || isPrunable(worktree)
					? []
					: [[worktree.branch, realPathOf(worktree.path)] as const],
			),
	)
	return {
		openLots,
		stackParents,
		damagedStacks,
		stashes,
		...('why' in stashList && { stashesUnread: stashList.why }),
		pendingHandovers,
		checkedOut,
	}
}

/**
 * What the store's open or damaged lots hold: their own branches (a lot whose identity does not read holds the branch
 * its registry entry names, fail closed), their stack parents' branches (a stack needs no identity), and the lots whose
 * stack is damaged.
 */
function lotHoldersOf(
	lots: readonly LotRecord[],
): Pick<BranchHolders, 'openLots' | 'stackParents' | 'damagedStacks'> {
	const open = lots.filter((lot) => lot.state === DAMAGED_STATE || !isClosedState(lot.state))
	const openLots = new Map(
		open.flatMap((lot) =>
			lot.branch === undefined
				? []
				: [
						[
							lot.branch,
							LOT_KEEP_REASON.replace('{name}', lot.name).replace('{state}', lot.state),
						] as const,
					],
		),
	)
	const branchOfLot = new Map(
		lots.flatMap((lot) => (lot.branch === undefined ? [] : [[lot.name, lot.branch] as const])),
	)
	const stackParents = new Map<string, string>()
	const damagedStacks: string[] = []
	for (const child of open) {
		const stack = readStack({ lotFolder: child.lotFolder })
		if (stack === undefined) continue
		if ('damage' in stack) {
			damagedStacks.push(child.name)
			continue
		}
		const parentBranch = branchOfLot.get(stack.parent)
		if (parentBranch !== undefined) stackParents.set(parentBranch, `${child.name} (${child.state})`)
	}
	return { openLots, stackParents, damagedStacks }
}

/** One lot's records and settled landing. */
function readLot(params: { reads: PruneReads; lotFolder: string }): ReadLot {
	const { reads, lotFolder } = params
	const lot = basename(lotFolder)
	const identity = readIdentity({ lotFolder })
	const checked = readCheckedLotState({ lotFolder, registry: registryOfLotFolder(lotFolder) })
	const damage =
		identity === undefined || checked === undefined
			? PRUNE_FACT_TEXTS.noRecords
			: 'damage' in checked
				? checked.damage
				: undefined
	const state =
		damage === undefined && checked !== undefined && !('damage' in checked)
			? lotState(checked.input).state
			: 'damaged'
	const simulated = identity?.simulated === true
	const settled: SettledLot =
		damage !== undefined
			? { notRead: damage }
			: simulated
				? { notRead: PRUNE_FACT_TEXTS.simulated }
				: settleLotLanding({
						lotFolder,
						...(reads.host !== undefined && { host: reads.host }),
						now: reads.now,
						recorded: { cards: reads.cards, entries: reads.entries },
					})
	// a lot whose landing settled merged reads committed from now on, whatever its state read before the settle
	const settledState = 'landed' in settled && state !== 'canceled' ? 'committed' : state
	const landedTip = 'landed' in settled ? settled.landed.tip : undefined
	const tipHeld =
		landedTip === undefined ||
		tryReadGit({ root: reads.main, args: ['cat-file', '-e', `${landedTip}^{commit}`] }) !==
			undefined
	return {
		lot,
		lotFolder,
		identity,
		state: settledState,
		damage,
		simulated,
		settled,
		landedTip: tipHeld ? landedTip : undefined,
		landedTipGone: tipHeld ? undefined : landedTip,
		...keptOf({ keep: checked?.keep }),
	}
}

/** The kept text of a lot kept on purpose, damaged or not, as its facts carry it; nothing when it is not kept. */
function keptOf(params: { keep: KeepDecision | undefined }): { kept?: string } {
	const kept = keptByDecision(params)
	return kept === undefined ? {} : { kept }
}

/**
 * What `lot close`'s own rules decide for each lot's worktree (one decision call for the repository), nothing moved:
 * it may close, why not, or none (gone, closed already, or the lot names none).
 */
function decideWorktrees(params: {
	main: string
	reads: PruneReads
	lots: readonly ReadLot[]
}): (WorktreeFacts | undefined)[] {
	const { main, reads, lots } = params
	const worktrees = reads.worktrees.filter((worktree) => !isParked({ path: worktree.path, main }))
	const targets = closeTargetsOf({ main, names: lots.map((lot) => lot.lot), worktrees })
	const settled: CloseSettle = targets.map(function settleTarget(target, index) {
		const lot = lots[index]
		const { settled: landing } = lot
		if (target.kind !== 'lot') return { target, landed: [], kept: PRUNE_FACT_TEXTS.noRecords }
		if ('open' in landing || 'notRead' in landing)
			return { target, landed: [], kept: 'open' in landing ? landing.why : landing.notRead }
		return {
			target: { ...target, lotState: 'canceled' in landing ? 'canceled' : 'committed' },
			landed: [],
			...('landed' in landing && lot.landedTip !== undefined && { landedTip: lot.landedTip }),
		}
	})
	const decisions = decideCloseTargets({
		cwd: main,
		runFrom: reads.runFrom,
		settled,
		listProcesses: reads.listProcesses,
		scratchRoots: reads.scratchRoots,
		registered: reads.entries,
	})
	return decisions.map(function worktreeOf(decision, index): WorktreeFacts | undefined {
		const target = targets[index]
		const path = target.kind === 'lot' ? target.worktree?.path : undefined
		if (path === undefined || 'alreadyClosed' in decision) return undefined
		return 'kept' in decision
			? { path: realPathOf(path), kept: decision.kept }
			: { path: realPathOf(path), closes: true }
	})
}

/**
 * The branches a terminal lot may lose: its own, its recorded throwaways' (while their worktrees stand), and the
 * throwaway branches its earlier removals named; each with its tip, by lot.
 */
function candidateBranchesOf(params: {
	reads: PruneReads
	lots: readonly ReadLot[]
}): Map<string, CandidateBranch[]> {
	const { reads } = params
	return new Map(
		params.lots.map(function branchesOfLot(lot) {
			if (lot.identity === undefined || lot.simulated) return [lot.lotFolder, []]
			const own = branchTipOf({ main: reads.main, branch: lot.identity.branch })
			const throwaways = recordedThrowawaysOf({ reads, lot }).flatMap((throwaway) =>
				throwaway.branch === undefined
					? []
					: [
							{
								branch: throwaway.branch,
								tip: branchTipOf({ main: reads.main, branch: throwaway.branch }),
							},
						],
			)
			const waiting = waitingBranchesOf({ reads, lot })
			const branches = [
				...(own === undefined ? [] : [{ branch: lot.identity.branch, tip: own, own: true }]),
				...throwaways.flatMap((one) =>
					one.tip === undefined ? [] : [{ ...one, tip: one.tip, own: false }],
				),
				...waiting,
			]
			const seen = new Set<string>()
			return [
				lot.lotFolder,
				branches.filter(function first(branch) {
					if (seen.has(branch.branch)) return false
					seen.add(branch.branch)
					return true
				}),
			]
		}),
	)
}

/** A branch's tip; undefined when the ref is gone. */
function branchTipOf(params: { main: string; branch: string }): string | undefined {
	return readCommitOrNone({ root: params.main, ref: `refs/heads/${params.branch}` })
}

/**
 * The throwaway branches an earlier removal of the lot named whose worktree is gone: the throwaway's when its tip is
 * the one the `removing` line recorded or descends from it; else not matched (recreated since).
 */
function waitingBranchesOf(params: { reads: PruneReads; lot: ReadLot }): CandidateBranch[] {
	const { reads, lot } = params
	const registered = new Set(reads.worktrees.flatMap((worktree) => worktree.branch ?? []))
	return reads.removals
		.flatMap(function removedThrowaway(removal: Removal): { branch: string; tip: string }[] {
			const { branch, tip } = removal
			const removed = removal.outcome === 'trashed' || removal.outcome === 'deleted'
			return removal.lot === lot.lot &&
				removal.item === 'throwaway' &&
				removed &&
				branch !== null &&
				tip !== null
				? [{ branch, tip }]
				: []
		})
		.flatMap(function waitingOf(removal): CandidateBranch[] {
			const { branch } = removal
			if (registered.has(branch)) return []
			const tip = branchTipOf({ main: reads.main, branch })
			if (tip === undefined) return []
			// a failed read reads as not descending: the branch is then not matched, so kept
			const descends =
				tip === removal.tip ||
				tryReadGit({
					root: reads.main,
					args: ['merge-base', '--is-ancestor', removal.tip, tip],
				}) !== undefined
			return [
				{
					branch,
					tip,
					own: false,
					...(!descends && { notMatched: PRUNE_PLAN_TEXTS.recreated }),
				},
			]
		})
}

/** The lot's recorded throwaways: each `throwaway-add` step that ended with exit 0, by its worktree's path, once. */
function recordedThrowawaysOf(params: { reads: PruneReads; lot: ReadLot }): RecordedThrowaway[] {
	const { reads, lot } = params
	const { events } = readEvents({ file: join(lot.lotFolder, STORE_FILES.events) })
	const paths = [
		...new Set(
			events.flatMap((event) =>
				event.kind === 'step.end' &&
				event.step === THROWAWAY_ADD_STEP &&
				event.throwaway === true &&
				event.exit === 0 &&
				typeof event.worktree === 'string'
					? [event.worktree]
					: [],
			),
		),
	]
	return paths.map(function throwawayOf(path) {
		// a folder deleted by hand stays registered (prunable): its branch is still the lot's, the folder no item
		const registered = reads.worktrees.find(
			(worktree) => realPathOf(worktree.path) === realPathOf(path),
		)
		// moved into the trash by a removal its proof stopped: still the lot's, registered under the trash
		const left = [...reads.leftInTrash].find(
			([, entry]) => realPathOf(entry.path) === realPathOf(path),
		)
		const inTrash =
			registered === undefined && left !== undefined
				? reads.worktrees.find((worktree) => realPathOf(worktree.path) === left[0])
				: undefined
		if (inTrash !== undefined && left !== undefined)
			return {
				path: inTrash.path,
				branch: inTrash.branch,
				listed: undefined,
				gone: false,
				left: left[1].reason,
			}
		const gone = registered !== undefined && isPrunable(registered)
		return {
			path: realPathOf(path),
			branch: registered?.branch,
			listed: gone ? undefined : registered,
			gone,
		}
	})
}

/**
 * The commits deleting each candidate branch would lose, the run's whole set of candidates proved together (two
 * branches holding each other never both go on separate answers): each lost commit given to the branches reaching it.
 */
function lostByBranch(params: {
	reads: PruneReads
	lots: readonly ReadLot[]
	candidates: ReadonlyMap<string, { branch: string; tip: string }[]>
}): ReadonlyMap<string, BranchLoss> {
	const { reads } = params
	const branches = [
		...new Set(
			params.lots
				.filter((lot) => isClosedState(lot.state))
				.flatMap((lot) => (params.candidates.get(lot.lotFolder) ?? []).map((one) => one.branch)),
		),
	]
	if (branches.length === 0) return new Map()
	const landedTips = params.lots.flatMap((lot) =>
		lot.landedTip === undefined ? [] : [lot.landedTip],
	)
	const lost = lostWork({ root: reads.main, removes: { worktrees: [], branches }, landedTips })
	return new Map(
		branches.map(function lostOfBranch(branch): [string, BranchLoss] {
			const commits = readGitOrWhy({
				root: reads.main,
				args: ['rev-list', `refs/heads/${branch}`],
				what: `the commits of ${branch}`,
			})
			const reflog = readGitOrWhy({
				root: reads.main,
				args: ['reflog', 'show', '--format=%H', `refs/heads/${branch}`, '--'],
				what: `the reflog of ${branch}`,
			})
			if ('why' in commits) return [branch, { lost: [], unread: commits.why }]
			if ('why' in reflog) return [branch, { lost: [], unread: reflog.why }]
			const reached = new Set([...linesOf(commits.output), ...linesOf(reflog.output)])
			return [branch, { lost: lost.filter((commit) => reached.has(commit.commit)) }]
		}),
	)
}

/** One lot's facts, its worktree decided, its throwaways proved, its branches with what they would lose. */
function lotFactsOf(params: {
	reads: PruneReads
	lot: ReadLot
	worktree: WorktreeFacts | undefined
	candidates: ReadonlyMap<string, CandidateBranch[]>
	lost: ReadonlyMap<string, BranchLoss>
}): LotFacts {
	const { reads, lot, worktree } = params
	const identityWorktree = lot.identity?.worktree
	const worktreeGone =
		worktree === undefined && typeof identityWorktree === 'string' && !existsSync(identityWorktree)
	const terminal = isClosedState(lot.state)
	const throwaways =
		lot.identity === undefined || lot.simulated
			? []
			: [
					...recordedThrowawaysOf({ reads, lot }).flatMap((recorded) =>
						recordedFactsOf({ reads, lot, recorded, terminal }),
					),
					...handMadeOf({ reads, lot, terminal }),
				]
	const branches = (params.candidates.get(lot.lotFolder) ?? []).map(
		function branchFactsOf(candidate): BranchFacts {
			const loss = params.lost.get(candidate.branch)
			return {
				branch: candidate.branch,
				tip: candidate.tip,
				own: candidate.own,
				lost: loss?.lost ?? [],
				...(loss?.unread !== undefined && { unread: loss.unread }),
				sinceLanding:
					candidate.own && lot.landedTip !== undefined && lot.identity !== undefined
						? workSinceLanding({
								root: reads.main,
								branch: candidate.branch,
								cut: lot.identity.base.commit,
								landedTip: lot.landedTip,
							})
						: [],
				...(candidate.notMatched !== undefined && { notMatched: candidate.notMatched }),
			}
		},
	)
	return {
		lot: lot.lot,
		lotFolder: lot.lotFolder,
		state: lot.state,
		...(lot.damage !== undefined && { damage: lot.damage }),
		simulated: lot.simulated,
		settled: lot.settled,
		worktree,
		worktreeGone,
		throwaways,
		branches,
		...(lot.landedTipGone !== undefined && { landedTipGone: lot.landedTipGone }),
		...(lot.kept !== undefined && { kept: lot.kept }),
	}
}

/**
 * A recorded throwaway's item: none when its folder is gone, kept with the reason when a removal left it in the trash,
 * else its facts.
 */
function recordedFactsOf(params: {
	reads: PruneReads
	lot: ReadLot
	recorded: RecordedThrowaway
	terminal: boolean
}): ThrowawayFacts[] {
	const { recorded } = params
	if (recorded.gone) return []
	if (recorded.left !== undefined)
		return [
			{
				path: recorded.path,
				branch: recorded.branch,
				handMade: false,
				decision: { kept: recorded.left },
			},
		]
	return [throwawayFactsOf({ ...params, ...recorded })]
}

/**
 * A recorded throwaway's facts: not matched (no longer registered, not on `<lot branch>-round-<n>` with its
 * `round-<n>.base`), kept by a common keep rule, or its proof (read only for a terminal lot).
 */
function throwawayFactsOf(params: {
	reads: PruneReads
	lot: ReadLot
	path: string
	branch: string | undefined
	listed: ListedWorktree | undefined
	terminal: boolean
}): ThrowawayFacts {
	const { reads, lot, path, branch, listed } = params
	const base = { path, branch, handMade: false }
	if (listed === undefined || branch === undefined)
		return { ...base, decision: { notMatched: PRUNE_PLAN_TEXTS.notRegistered } }
	const round = Number(THROWAWAY_ROUND_PATTERN.exec(branch)?.[1] ?? Number.NaN)
	if (
		lot.identity === undefined ||
		!branch.startsWith(`${lot.identity.branch}-round-`) ||
		!Number.isInteger(round) ||
		!existsSync(join(lot.lotFolder, roundNames(round).base))
	)
		return { ...base, decision: { notMatched: PRUNE_FACT_TEXTS.notRound } }
	if (!params.terminal) return { ...base, decision: { goes: true } }
	const kept = commonKeepOf({ reads, path, branch, listed })
	if (kept !== undefined) return { ...base, decision: { kept } }
	return { ...base, decision: proofOf({ reads, lot, path, branch, round, handMadeOf: undefined }) }
}

/** The hand-made throwaways of a terminal lot, each with its common keep rules and its held-commits proof. */
function handMadeOf(params: {
	reads: PruneReads
	lot: ReadLot
	terminal: boolean
}): ThrowawayFacts[] {
	const { reads, lot } = params
	if (!params.terminal || lot.identity === undefined) return []
	const named = new Set(
		reads.entries.flatMap((entry) => [realPathOf(entry.worktree), entry.branch]),
	)
	const candidates = reads.worktrees.slice(1).flatMap(function candidateOf(listed) {
		const path = realPathOf(listed.path)
		const branch = listed.branch
		if (
			branch === undefined ||
			!existsSync(listed.path) ||
			isParked({ path: listed.path, main: reads.main })
		)
			return []
		// a store lot's own worktree or branch, its root link's lot included, is no hand-made throwaway; read at the plan
		// only: lot start never takes over an existing worktree
		if (lotItemOf({ items: reads.lotItems, worktree: path, branch, link: true }) !== undefined)
			return []
		if (named.has(path) || named.has(branch)) return []
		if (THROWAWAY_ROUND_PATTERN.test(branch) && branch.startsWith(`${lot.identity?.branch}-round-`))
			return []
		return [{ path, branch }]
	})
	const matched = matchHandMadeThrowaways({
		main: reads.main,
		candidates,
		lots: [
			{
				lot: lot.lot,
				branch: lot.identity.branch,
				cut: lot.identity.base.commit,
				landedTip: lot.landedTip,
			},
		],
	})
	return matched.map(function handMadeFactsOf(match): ThrowawayFacts {
		const listed = reads.worktrees.find((worktree) => realPathOf(worktree.path) === match.path)
		const base = { path: match.path, branch: match.branch, handMade: true }
		if (match.unread !== undefined) return { ...base, decision: { kept: match.unread } }
		const kept = commonKeepOf({ reads, path: match.path, branch: match.branch, listed })
		if (kept !== undefined) return { ...base, decision: { kept } }
		return {
			...base,
			decision: proofOf({
				reads,
				lot,
				path: match.path,
				branch: match.branch,
				round: 0,
				handMadeOf: lot.lot,
			}),
		}
	})
}

/**
 * The common keep rules of a throwaway (design 3.1): locked, the folder the command runs from, a process or a
 * mutation run working in it, a link from outside reaching it, a hand-over lock, a registry entry neither committed nor
 * abandoned naming its worktree or branch; undefined when none holds.
 */
export function commonKeepOf(params: {
	reads: KeepReads
	path: string
	branch: string
	listed: ListedWorktree | undefined
}): string | undefined {
	const { reads, path, branch } = params
	if (params.listed?.locked === true) return PRUNE_FACT_TEXTS.locked
	if (isAtOrInsideReal({ path: reads.runFrom, folder: path })) return PRUNE_FACT_TEXTS.runFrom
	if (typeof reads.processes === 'string') return reads.processes
	const working = processWorkingIn({ processes: reads.processes, folder: path })
	if (working !== undefined) return PRUNE_FACT_TEXTS.process.replace('{pid}', String(working.pid))
	const run = mutationRunKeeping({ runs: reads.runs, folder: path })
	if (run !== undefined) return run
	const outside = reads.links.filter(
		(link) => !isAtOrInsideReal({ path: dirname(link.link), folder: path }),
	)
	const link = linkReaching({ folder: path, links: outside })
	if (link !== undefined) return PRUNE_FACT_TEXTS.link.replace('{link}', link)
	if (existsSync(handoverLockPath(path))) return PRUNE_FACT_TEXTS.handoverRunning
	const open = reads.entries.find(
		(entry) =>
			entry.state !== 'committed' &&
			entry.state !== 'abandoned' &&
			(realPathOf(entry.worktree) === path || entry.branch === branch),
	)
	return open === undefined
		? undefined
		: PRUNE_FACT_TEXTS.openHandover.replace('{name}', open.name).replace('{state}', open.state)
}

/**
 * What the common keep rules read, read now: the registry's entries, the processes, the mutation runs, the links
 * around the workspace.
 */
export function keepReadsOf(params: {
	main: string
	runFrom: string
	listProcesses?: () => ProcessFolder[] | string
	scratchRoots?: readonly string[]
}): KeepReads {
	const { main } = params
	const store = findHandoverStore(main)
	return {
		runFrom: params.runFrom,
		entries: store === undefined ? [] : readStoreEntries(store),
		processes: readProcesses(params.listProcesses ?? listProcessFolders),
		links: readLinkScanSet({ workspace: dirname(main), scratchRoots: params.scratchRoots ?? [] }),
		runs: readOwnedRuns(main),
	}
}

/** Whether git may prune a registered worktree: its folder gone and the worktree not locked. */
function isPrunable(worktree: ListedWorktree): boolean {
	return worktree.locked !== true && !existsSync(worktree.path)
}

/** The worktrees a removal left in the trash, read from the repository's `cards.log`: by trashed path. */
export function leftInTrashOf(main: string): ReadonlyMap<string, LeftInTrash> {
	const store = findHandoverStore(main)
	const file = join(store ?? handoverStoreOf(main), CARDS_LOG_FILE)
	if (!existsSync(file)) return new Map()
	return new Map(
		readCardsLog({ file }).removals.flatMap((removal) =>
			removal.outcome === 'kept' && removal.trashed !== null
				? [
						[
							realPathOf(removal.trashed),
							{ path: removal.path, reason: removal.reason ?? PRUNE_FACT_TEXTS.leftInTrash },
						] as const,
					]
				: [],
		),
	)
}

/** A throwaway's proof against its lot's held commits (its branch tip, its landed tip, the base); a throw keeps it. */
function proofOf(params: {
	reads: PruneReads
	lot: ReadLot
	path: string
	branch: string
	round: number
	handMadeOf: string | undefined
}): ThrowawayFacts['decision'] {
	const { reads, lot } = params
	try {
		return proveThrowaway({
			main: reads.main,
			throwaway: params.path,
			branch: params.branch,
			lotFolder: lot.lotFolder,
			round: params.round,
			holders: [
				...(lot.identity === undefined ? [] : [`refs/heads/${lot.identity.branch}`]),
				...(lot.landedTip === undefined ? [] : [lot.landedTip]),
				...(reads.baseRef === undefined ? [] : [reads.baseRef]),
			],
			landedTips: lot.landedTip === undefined ? [] : [lot.landedTip],
			...(params.handMadeOf !== undefined && { handMadeOf: params.handMadeOf }),
		})
	} catch (error) {
		return { kept: (error as Error).message.trim() }
	}
}

/** The registered worktrees under the workspace's trash: their paths (a refused deletion stays registered there). */
export function trashedWorktreesOf(params: {
	main: string
	worktrees: readonly ListedWorktree[]
}): string[] {
	const trash = join(dirname(params.main), WORKTREES_FOLDER)
	return params.worktrees
		.slice(1)
		.map((worktree) => worktree.path)
		.filter(
			(path) =>
				isParked({ path, main: params.main }) && realPathOf(path).startsWith(realPathOf(trash)),
		)
}

/**
 * The `git status --porcelain -z` entries of a worktree, one per line, each path as git wrote it (never quoted); why
 * when git cannot read it.
 */
export function statusTextOf(path: string): string {
	const status = tryReadGit({
		root: path,
		args: ['status', '--porcelain', '-z', '--untracked-files=all'],
	})
	if (status === undefined) return PRUNE_FACT_TEXTS.statusUnread
	return statusLinesOf(status.split('\0').filter(Boolean)).join('\n')
}

/** The `-z` fields as one line per entry: a rename or copy (`R`, `C` in either column) takes its source field along. */
function statusLinesOf(fields: readonly string[]): string[] {
	const lines: string[] = []
	for (let at = 0; at < fields.length; at++) {
		const entry = fields[at]
		const moved = /^[RC]|^.[RC]/.test(entry) && at + 1 < fields.length
		lines.push(moved ? `${entry} <- ${fields[++at]}` : entry)
	}
	return lines
}
