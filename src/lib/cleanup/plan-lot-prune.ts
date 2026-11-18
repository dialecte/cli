/**
 * `lot prune`'s plan: pure. Every item of every lot decided from the facts before anything moves; the first reason
 * that keeps an item wins; a lot two arguments reach is listed once, an item two lots reach decided once.
 */
import { SHORT_SHA_LENGTH } from '../gate-records/gate-records.constants.ts'
import { fillMessage } from '../knowledge/standard/fill-message.ts'
import { lostWorkText, workSinceLandingText } from '../landing/lost-work.ts'
import { landedLineOf } from '../landing/lot-landing.ts'
import { PRUNE_PLAN_TEXTS } from './plan-lot-prune.constants.ts'

import type { SettledLot } from '../landing/lot-landing.types.ts'
import type {
	BranchFacts,
	BranchHolders,
	LotFacts,
	LotPruneFacts,
	RepositoryFacts,
	ThrowawayFacts,
} from './lot-prune-facts.types.ts'
import type { ItemDecision, LotPlan, LotPrunePlan, PlannedItem } from './plan-lot-prune.types.ts'

/**
 * Each lot's worktree, throwaways and branches decided from `facts`, nothing read nor moved.
 *
 * @intent decide every lot prune item before anything moves
 * @internal
 */
export function planLotPrune(facts: LotPruneFacts): LotPrunePlan {
	return {
		repositories: facts.repositories.map(function planRepository(repository) {
			const planned = uniqueLots(repository.lots).map((lot) => planLot({ repository, lot }))
			return { main: repository.main, lots: firstDecisions(planned) }
		}),
	}
}

/** The lots, each once (two arguments may name the same lot). */
function uniqueLots(lots: readonly LotFacts[]): LotFacts[] {
	const seen = new Set<string>()
	return lots.filter(function firstOfLot(lot) {
		if (seen.has(lot.lotFolder)) return false
		seen.add(lot.lotFolder)
		return true
	})
}

/**
 * Each item listed once, under the first lot reaching it, its decision taken from every lot reaching it: the first
 * keep wins, else the first lot's decision.
 */
function firstDecisions(lots: readonly LotPlan[]): LotPlan[] {
	const owner = new Map<string, number>()
	const decisions = new Map<string, ItemDecision[]>()
	lots.forEach((lot, at) => {
		for (const item of lot.items) {
			const key = itemKeyOf(item)
			if (!owner.has(key)) owner.set(key, at)
			decisions.set(key, [...(decisions.get(key) ?? []), item.decision])
		}
	})
	return lots.map((lot, at) => ({
		...lot,
		items: lot.items
			.filter((item) => owner.get(itemKeyOf(item)) === at)
			.map((item) => ({
				...item,
				decision:
					(decisions.get(itemKeyOf(item)) ?? []).find((decision) => 'kept' in decision) ??
					item.decision,
			})),
	}))
}

/** An item's key across the lots of a run: its kind and its name. */
function itemKeyOf(item: PlannedItem): string {
	return `${item.item} ${item.name}`
}

/** One lot's plan: its landing line, whether it is stale, its items in order (worktree, throwaways, branches). */
function planLot(params: { repository: RepositoryFacts; lot: LotFacts }): LotPlan {
	const { repository, lot } = params
	const base = {
		lot: lot.lot,
		state: lot.state,
		landing:
			lot.worktreeGone && 'landed' in lot.settled && lot.landedTipGone === undefined
				? `${landingLineOf(lot.settled)}${PRUNE_PLAN_TEXTS.worktreeGone}`
				: lot.landedTipGone === undefined
					? landingLineOf(lot.settled)
					: `${landingLineOf(lot.settled)}; ${fillMessage({ template: PRUNE_PLAN_TEXTS.landedTipGone, values: { tip: lot.landedTipGone.slice(0, SHORT_SHA_LENGTH) } })}`,
		simulated: lot.simulated,
		stale: staleOf(lot),
	}
	if (lot.simulated) return { ...base, items: [] }
	const open = openReason(lot)
	const worktreeItems: PlannedItem[] = [
		...(lot.worktree === undefined
			? []
			: [
					{
						item: 'worktree' as const,
						name: lot.worktree.path,
						decision: worktreeDecision({ repository, lot, open }),
					},
				]),
		...lot.throwaways.map((throwaway): PlannedItem => ({
			item: 'throwaway',
			name: throwaway.path,
			decision: throwawayDecision({ repository, throwaway, open }),
		})),
	]
	const going = new Set(
		worktreeItems.filter((item) => 'go' in item.decision).map((item) => item.name),
	)
	const branchItems = lot.branches.map((branch): PlannedItem => ({
		item: 'branch',
		name: branch.branch,
		decision: branchDecision({ repository, lot, branch, open, going }),
	}))
	return { ...base, items: [...worktreeItems, ...branchItems] }
}

/** Why every item of a lot that is not terminal is kept: its state; undefined for a committed or canceled lot. */
function openReason(lot: LotFacts): string | undefined {
	if (lot.state === 'damaged') return lot.damage ?? 'damaged'
	if (lot.state === 'committed' || lot.state === 'canceled') return undefined
	return fillMessage({
		template: PRUNE_PLAN_TEXTS.openLot,
		values: { lot: lot.lot, state: lot.state },
	})
}

/** The lot's worktree: kept with its lot's state, the processes not known, or its close's own reason; else it goes. */
function worktreeDecision(params: {
	repository: RepositoryFacts
	lot: LotFacts
	open: string | undefined
}): ItemDecision {
	const { repository, lot, open } = params
	if (open !== undefined) return { kept: open }
	if (repository.processes !== 'known') return { kept: repository.processes }
	const worktree = lot.worktree
	if (worktree === undefined || 'kept' in worktree) return { kept: worktree?.kept ?? '' }
	return { go: true }
}

/** A throwaway: kept with its lot's state, the processes not known, not matched, its keep rule or its proof's reason. */
function throwawayDecision(params: {
	repository: RepositoryFacts
	throwaway: ThrowawayFacts
	open: string | undefined
}): ItemDecision {
	const { repository, throwaway, open } = params
	if (open !== undefined) return { kept: open }
	if (repository.processes !== 'known') return { kept: repository.processes }
	const { decision } = throwaway
	if ('notMatched' in decision)
		return {
			kept: fillMessage({
				template: PRUNE_PLAN_TEXTS.notMatched,
				values: { why: decision.notMatched },
			}),
		}
	if ('kept' in decision) return { kept: decision.kept }
	return { go: true }
}

/**
 * A branch: kept with its lot's state, then by what else holds it (the base, the main checkout, an open lot, a stack
 * child, a damaged stack, a pending hand-over, a stash), then by the commits its deletion would lose and its lot's
 * landing, then checked out (after its worktree when that goes in this run); else it goes.
 */
function branchDecision(params: {
	repository: RepositoryFacts
	lot: LotFacts
	branch: BranchFacts
	open: string | undefined
	going: ReadonlySet<string>
}): ItemDecision {
	const { repository, lot, branch, open } = params
	if (open !== undefined) return { kept: open }
	if (branch.notMatched !== undefined)
		return {
			kept: fillMessage({
				template: PRUNE_PLAN_TEXTS.notMatched,
				values: { why: branch.notMatched },
			}),
		}
	const held = heldBy({ repository, branch: branch.branch })
	if (held !== undefined) return { kept: held }
	const kept = keptByWork({ repository, lot, branch })
	if (kept !== undefined) return { kept }
	const checkedOut = repository.holders.checkedOut.get(branch.branch)
	if (checkedOut === undefined) return { go: true }
	// its worktree a removal left in the trash: the branch stays with that worktree's reason
	const left = repository.leftInTrash?.get(checkedOut)
	if (left !== undefined) return { kept: left }
	return params.going.has(checkedOut)
		? { after: checkedOut }
		: {
				kept: fillMessage({
					template: PRUNE_PLAN_TEXTS.checkedOut,
					values: { worktree: checkedOut },
				}),
			}
}

/** Why a branch's work keeps it: the commits its deletion would lose, then its lot's landing; undefined: none. */
function keptByWork(params: {
	repository: RepositoryFacts
	lot: LotFacts
	branch: BranchFacts
}): string | undefined {
	const { repository, lot, branch } = params
	if (branch.lost.length > 0) {
		const lost = lostWorkText(branch.lost)
		return lot.state === 'canceled'
			? fillMessage({
					template: PRUNE_PLAN_TEXTS.deleteAnyway,
					values: { lost, main: repository.main, branch: branch.branch },
				})
			: lost
	}
	return landingKeep({ settled: lot.settled, branch })
}

/** What else holds a branch, by name: its reason, or undefined. */
function heldBy(params: { repository: RepositoryFacts; branch: string }): string | undefined {
	const { repository, branch } = params
	const { holders } = repository
	if (branch === repository.baseBranch) return PRUNE_PLAN_TEXTS.baseBranch
	if (branch === repository.mainBranch) return PRUNE_PLAN_TEXTS.mainBranch
	const openLot = holders.openLots.get(branch)
	if (openLot !== undefined) return openLot
	return heldByOthers({ holders, branch })
}

/**
 * Why a branch stays for something other than its own lot and the checkouts: a stack started on it, a damaged stack,
 * a pending hand-over, a stash; undefined when none holds it. The acts read it again right before a delete.
 *
 * @intent the branch holders a lot prune delete reads again at the move
 * @internal
 */
export function heldByOthers(params: {
	holders: Omit<BranchHolders, 'openLots' | 'checkedOut'>
	branch: string
}): string | undefined {
	const { holders, branch } = params
	const child = holders.stackParents.get(branch)
	if (child !== undefined)
		return fillMessage({ template: PRUNE_PLAN_TEXTS.stackParent, values: { child } })
	const [damaged] = holders.damagedStacks
	if (damaged !== undefined)
		return fillMessage({ template: PRUNE_PLAN_TEXTS.damagedStack, values: { child: damaged } })
	const handover = holders.pendingHandovers.get(branch)
	if (handover !== undefined)
		return fillMessage({ template: PRUNE_PLAN_TEXTS.pendingHandover, values: { name: handover } })
	if (holders.stashes.has(branch)) return PRUNE_PLAN_TEXTS.stash
	return undefined
}

/** Why a terminal lot's branch stays by its landing: not landed, not read, or work since; undefined: it may go. */
function landingKeep(params: { settled: SettledLot; branch: BranchFacts }): string | undefined {
	const { settled, branch } = params
	if ('notLanded' in settled) return settled.notLanded
	if ('notRead' in settled) return settled.notRead
	if ('landed' in settled && branch.sinceLanding.length > 0)
		return workSinceLandingText([...branch.sinceLanding])
	return undefined
}

/** The line naming a lot's landing as the run settled it. */
function landingLineOf(settled: SettledLot): string {
	if ('landed' in settled) return landedLineOf(settled.landed)
	if ('canceled' in settled) return PRUNE_PLAN_TEXTS.canceled
	if ('notLanded' in settled) return settled.notLanded
	if ('notRead' in settled) return settled.notRead
	return settled.why
}

/** A lot whose worktree is gone and whose landing is not proven (not landed, not canceled): why, and the lot stop command. */
function staleOf(lot: LotFacts): string | undefined {
	const { settled } = lot
	if (!lot.worktreeGone || 'landed' in settled || 'canceled' in settled) return undefined
	return fillMessage({
		template: PRUNE_PLAN_TEXTS.stale,
		values: { state: lot.state, why: landingLineOf(settled), lot: lot.lot },
	})
}
