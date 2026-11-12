/**
 * What `plan next` proposes from the entries' states: the ready lots that meet no open lot (in critical-path
 * order), the ready lots held by an overlap, the spec work, the counts. Pure.
 */
import { normaliseScopeEntry, overlaps } from '../store/brief-scope.ts'
import { dependenciesOf, dependentsOf } from './plan-dependencies.ts'
import { clockTimeOf, stepTextOf } from './plan-heavy.ts'
import {
	HEAVY_PART_STEP_PREFIXES,
	LOT_START_COMMAND,
	MUTATION_STEP,
	PLAN_REPOSITORY_KINDS,
	REASON_SEPARATOR,
	SHORT_MACHINE_END,
	SHORT_MACHINE_START,
	WHOLE_REPOSITORY_ENTRY,
	WHOLE_SUITE_STEPS,
} from './plan.constants.ts'

import type { EntryStatus, PlanStates } from './entry-state.types.ts'
import type { PlanBlock, PlanEntry } from './plan-block.types.ts'
import type { PlanFacts } from './plan.types.ts'
import type {
	Held,
	PlanCounts,
	PlanHeavyReading,
	PlanOpenLot,
	PlanProposals,
	PlanRank,
	Proposal,
	ProposePlanParams,
	SpecWork,
} from './propose.types.ts'

/**
 * What can start now, what is held by an overlap with open lots, the spec work, in critical-path order (more
 * entries unblocked first, then the longest chain, then block order). Shared files never hold a lot: meeting open
 * lots on them marks a merge. Pure.
 */
export function proposePlan(params: ProposePlanParams): PlanProposals {
	const { block, facts, states } = params
	const statuses = new Map(states.entries.map((status) => [status.id, status]))
	const ranks = ranksOf({ block, statuses })
	const ordered = orderedEntriesOf({ block, ranks })
	const openLots = openLotsOf({ block, states })
	const proposals: Proposal[] = []
	const held: Held[] = []
	for (const entry of ordered.filter((candidate) => isCandidate({ entry: candidate, statuses }))) {
		const met = metOf({ entry, block, facts, openLots })
		if (met.length > 0) {
			held.push({
				id: entry.id,
				open: [...new Set(met.map(({ open }) => open.name))],
				met: met.map(({ text }) => text),
			})
			continue
		}
		proposals.push(
			proposalOf({ entry, block, facts, states, openLots, ranks, proposals, heavy: params.heavy }),
		)
	}
	const proposed = new Set(proposals.map((proposal) => proposal.id))
	return {
		counts: countsOf({ states, held }),
		proposals,
		held,
		specWork: specWorkOf({ ordered, statuses, proposed }),
	}
}

/** A ready `lot` or `fix` whose spec, when it names one, is written. */
function isCandidate(params: { entry: PlanEntry; statuses: Map<string, EntryStatus> }): boolean {
	const status = params.statuses.get(params.entry.id)
	if (status === undefined || status.state !== 'ready') return false
	if (!PLAN_REPOSITORY_KINDS.includes(params.entry.kind)) return false
	return status.spec === null || status.spec.status === 'written'
}

/** The proposal of a candidate meeting no open lot. */
function proposalOf(params: {
	entry: PlanEntry
	block: PlanBlock
	facts: PlanFacts
	states: PlanStates
	openLots: PlanOpenLot[]
	ranks: Map<string, PlanRank>
	proposals: Proposal[]
	heavy: PlanHeavyReading
}): Proposal {
	const { entry, block, facts, states, openLots, ranks } = params
	const repositories = Object.keys(entry.scope)
	const earlier = params.proposals.find(function overlapsEarlier(proposal) {
		const other = block.lots.find((candidate) => candidate.id === proposal.id)
		return other !== undefined && scopesMeet({ first: entry, second: other, block, facts })
	})
	return {
		id: entry.id,
		kind: entry.kind === 'fix' ? 'fix' : 'lot',
		unblocks: ranks.get(entry.id)?.unblocks ?? 0,
		chain: ranks.get(entry.id)?.chain ?? 0,
		after: earlier?.id ?? null,
		merge: [
			...new Set(
				openLots
					.filter(
						(open) =>
							repositories.includes(open.repository) &&
							(block.shared[open.repository] ?? []).length > 0,
					)
					.map((open) => open.name),
			),
		],
		unverified: states.outside
			.filter((work) => work.scope === null && repositories.includes(work.repository))
			.map((work) => work.name),
		heavy: [...entry.heavy],
		stacks: stacksOf({ entry, heavy: params.heavy }),
		...waitOf({ heavy: params.heavy }),
		next: nextOf({ entry, facts }),
	}
}

/**
 * The live heavy steps a proposal's own would run beside, in start order: every lot's whole-suite runs, a declared
 * `mutation`, a declared `browser` against a heavy part of `gate --fast` or `gate --hook`. Advice only.
 */
function stacksOf(params: { entry: PlanEntry; heavy: PlanHeavyReading }): string[] {
	const { entry } = params
	return params.heavy.markers
		.filter(
			(marker) =>
				WHOLE_SUITE_STEPS.includes(marker.step) ||
				(entry.heavy.includes('mutation') && marker.step === MUTATION_STEP) ||
				(entry.heavy.includes('browser') &&
					HEAVY_PART_STEP_PREFIXES.some((prefix) => marker.step.startsWith(prefix))),
		)
		.map(
			(marker) =>
				`${stepTextOf({ step: marker.step })} (running in ${marker.worktree} since ${clockTimeOf({ time: marker.since })})`,
		)
}

/** On a short machine, the advice that the proposal's heavy steps would wait; nothing otherwise. */
function waitOf(params: { heavy: PlanHeavyReading }): Pick<Proposal, 'wait'> {
	const reasons = params.heavy.shortReasons ?? []
	if (reasons.length === 0) return {}
	return {
		wait: `${SHORT_MACHINE_START} (${reasons.join(REASON_SEPARATOR)})${SHORT_MACHINE_END}`,
	}
}

/** `dialecte lot start <brief>` when the entry's brief exists, else the brief to write. */
function nextOf(params: { entry: PlanEntry; facts: PlanFacts }): string {
	const { entry } = params
	if (entry.brief !== undefined && params.facts.briefs[entry.brief] === true)
		return `${LOT_START_COMMAND} ${entry.brief}`
	const spec = entry.spec === undefined ? '' : ` (spec ${entry.spec})`
	return `write the brief for ${entry.id}${spec}`
}

/**
 * Every pair of scope entries where the candidate meets an open lot of the same repository, outside the shared
 * files, as `<candidate entry> meets <open entry> (<open lot>, open[, manual])`.
 */
function metOf(params: {
	entry: PlanEntry
	block: PlanBlock
	facts: PlanFacts
	openLots: PlanOpenLot[]
}): { open: PlanOpenLot; text: string }[] {
	const { entry, block, facts } = params
	return params.openLots.flatMap((open) =>
		pairsOf({
			first: entry.scope[open.repository] ?? [],
			second: open.scope,
			repository: open.repository,
			block,
			facts,
		}).map(([candidate, held]) => ({
			open,
			text: `${candidate} meets ${held} (${open.name}, open${open.manual ? ', manual' : ''})`,
		})),
	)
}

/** Two entries' scopes meet in some repository they share, outside its shared files. */
function scopesMeet(params: {
	first: PlanEntry
	second: PlanEntry
	block: PlanBlock
	facts: PlanFacts
}): boolean {
	const { first, second, block, facts } = params
	return Object.keys(first.scope).some(
		(repository) =>
			pairsOf({
				first: first.scope[repository] ?? [],
				second: second.scope[repository] ?? [],
				repository,
				block,
				facts,
			}).length > 0,
	)
}

/**
 * The pairs of scope entries of one repository that overlap (a string prefix of their literal parts, lower-cased on
 * a case-insensitive volume; `"."` meets everything), the repository's shared files left out of both sides.
 */
function pairsOf(params: {
	first: string[]
	second: string[]
	repository: string
	block: PlanBlock
	facts: PlanFacts
}): [string, string][] {
	const shared = new Set(
		(params.block.shared[params.repository] ?? []).map((path) => normaliseScopeEntry(path)),
	)
	const repositoryFacts = params.facts.repositories[params.repository]
	const caseInsensitive = repositoryFacts?.readable === true && repositoryFacts.caseInsensitive
	const seconds = withoutShared({ entries: params.second, shared })
	return withoutShared({ entries: params.first, shared }).flatMap((first) =>
		seconds
			.filter((second) => entriesMeet({ first, second, caseInsensitive }))
			.map((second): [string, string] => [first, second]),
	)
}

/** The scope entries that are not one of the repository's shared files. */
function withoutShared(params: { entries: string[]; shared: Set<string> }): string[] {
	return params.entries.filter((entry) => !params.shared.has(normaliseScopeEntry(entry)))
}

/** Two scope entries meet: either names the whole repository, or they overlap by the brief rule. */
function entriesMeet(params: { first: string; second: string; caseInsensitive: boolean }): boolean {
	if (params.first === WHOLE_REPOSITORY_ENTRY || params.second === WHOLE_REPOSITORY_ENTRY)
		return true
	return overlaps({ a: params.first, b: params.second, caseInsensitive: params.caseInsensitive })
}

/**
 * The open lots of the plan's repositories, in block order: each open entry by the scope it holds, then each open
 * store lot outside the plan by its brief scope. Outside work of unknown scope holds nothing (it marks proposals
 * unverified).
 */
function openLotsOf(params: { block: PlanBlock; states: PlanStates }): PlanOpenLot[] {
	const entries = params.states.entries
		.filter((status) => status.state === 'open')
		.flatMap((status) =>
			Object.entries(status.heldScope).map(([repository, scope]) => ({
				repository,
				name: status.id,
				scope,
				manual: status.realizedBy?.kind === 'worktree',
			})),
		)
	const outside = params.states.outside.flatMap((work) =>
		work.scope === null
			? []
			: [{ repository: work.repository, name: work.name, scope: work.scope, manual: false }],
	)
	return [...entries, ...outside]
}

/**
 * The spec work, one line per spec file in the order of its first entry: each entry (not a person's) whose spec is
 * missing or DRAFT and that is ready, or waits only on entries open or ready and proposed now.
 */
function specWorkOf(params: {
	ordered: PlanEntry[]
	statuses: Map<string, EntryStatus>
	proposed: Set<string>
}): SpecWork[] {
	const lines = new Map<string, SpecWork>()
	for (const entry of params.ordered) {
		const status = params.statuses.get(entry.id)
		if (status === undefined || status.spec === null || entry.kind === 'person') continue
		if (status.spec.status === 'written') continue
		if (!isNextInLine({ status, proposed: params.proposed })) continue
		const line = lines.get(status.spec.file)
		if (line === undefined)
			lines.set(status.spec.file, {
				ids: [entry.id],
				file: status.spec.file,
				status: status.spec.status,
			})
		else line.ids.push(entry.id)
	}
	return [...lines.values()]
}

/** Ready, or waiting only on entries open, or ready and proposed in the same answer. */
function isNextInLine(params: { status: EntryStatus; proposed: Set<string> }): boolean {
	const { status, proposed } = params
	if (status.state === 'ready') return true
	if (status.state !== 'waiting') return false
	return status.waitsFor.every(
		(dependency) =>
			dependency.state === 'open' || (dependency.state === 'ready' && proposed.has(dependency.id)),
	)
}

/** The counts line; `ready` includes the held entries. */
function countsOf(params: { states: PlanStates; held: Held[] }): PlanCounts {
	const { states } = params
	return {
		done: countOf({ states, state: 'done' }),
		open: countOf({ states, state: 'open' }),
		ready: countOf({ states, state: 'ready' }),
		held: params.held.length,
		waiting: countOf({ states, state: 'waiting' }),
		parked: countOf({ states, state: 'parked' }),
		unknown: countOf({ states, state: 'unknown' }),
	}
}

/** How many entries are in `state`. */
function countOf(params: { states: PlanStates; state: EntryStatus['state'] }): number {
	return params.states.entries.filter((status) => status.state === params.state).length
}

/** The entries in critical-path order: more entries unblocked first, then the longest chain, then block order. */
function orderedEntriesOf(params: { block: PlanBlock; ranks: Map<string, PlanRank> }): PlanEntry[] {
	const { ranks } = params
	return params.block.lots
		.map((entry, index) => ({
			entry,
			index,
			rank: ranks.get(entry.id) ?? { unblocks: 0, chain: 0 },
		}))
		.sort(
			(first, second) =>
				second.rank.unblocks - first.rank.unblocks ||
				second.rank.chain - first.rank.chain ||
				first.index - second.index,
		)
		.map(({ entry }) => entry)
}

/**
 * Each entry's rank: the entries not done that depend on it, transitively (groups expanded), and the longest chain
 * of them behind it.
 */
function ranksOf(params: {
	block: PlanBlock
	statuses: Map<string, EntryStatus>
}): Map<string, PlanRank> {
	const { statuses } = params
	const dependents = dependentsOf({ dependencies: dependenciesOf({ block: params.block }) })
	const chains = new Map<string, number>()
	return new Map(
		params.block.lots.map((entry) => [
			entry.id,
			{
				unblocks: reachedOf({ id: entry.id, dependents, statuses }).size,
				chain: chainOf({ id: entry.id, dependents, statuses, chains }),
			},
		]),
	)
}

/** The dependents of `id` that are not done. */
function openDependentsOf(params: {
	id: string
	dependents: Map<string, string[]>
	statuses: Map<string, EntryStatus>
}): string[] {
	return (params.dependents.get(params.id) ?? []).filter(
		(id) => params.statuses.get(id)?.state !== 'done',
	)
}

/** The entries not done reached from `id` along its dependents. */
function reachedOf(params: {
	id: string
	dependents: Map<string, string[]>
	statuses: Map<string, EntryStatus>
}): Set<string> {
	const reached = new Set<string>()
	const pending = openDependentsOf(params)
	while (pending.length > 0) {
		const next = pending.pop() as string
		if (reached.has(next)) continue
		reached.add(next)
		pending.push(...openDependentsOf({ ...params, id: next }))
	}
	return reached
}

/** The longest chain of entries not done behind `id`, kept in `chains` (the block has no cycle). */
function chainOf(params: {
	id: string
	dependents: Map<string, string[]>
	statuses: Map<string, EntryStatus>
	chains: Map<string, number>
}): number {
	const known = params.chains.get(params.id)
	if (known !== undefined) return known
	const behind = openDependentsOf(params).map((id) => 1 + chainOf({ ...params, id }))
	const chain = Math.max(0, ...behind)
	params.chains.set(params.id, chain)
	return chain
}
