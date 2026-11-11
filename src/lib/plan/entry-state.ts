/**
 * The state of every entry of a lot block, read from the facts alone: a person's mark, a written spec, the
 * repositories' store lots, hand-over registry and worktrees; then parked, ready or waiting. Pure.
 */
import { resolve } from 'node:path'

import { dependenciesOf } from './plan-dependencies.ts'
import {
	DAMAGED_NOTE_PREFIX,
	INDEX_WORKTREE_PATTERN,
	ISO_DATE_LENGTH,
	KNOWN_REGISTRY_STATES,
	LIST_SEPARATOR,
	MANUAL_OPEN_NOTE,
	OPEN_LOT_STATES,
	PENDING_NOTE_PREFIX,
	PLAN_REPOSITORY_KINDS,
	THROWAWAY_BRANCH_PATTERN,
	THROWAWAY_WORKTREE_PATTERN,
	UNKNOWN_REGISTRY_STATE_PREFIX,
	UNKNOWN_REGISTRY_STATE_SUFFIX,
} from './plan.constants.ts'

import type {
	EntryRecord,
	EntryStatesParams,
	EntryStatus,
	OutsideWork,
	PlanStates,
	RepositoryStoreLot,
	WorktreeAttribution,
} from './entry-state.types.ts'
import type { PlanBlock, PlanEntry } from './plan-block.types.ts'
import type { PlanFacts, RegistryFact, RepositoryFacts, StoreLotFact } from './plan.types.ts'

/**
 * The state of every entry of the block, in block order, and the open work no entry accounts for. A `lot` or `fix`
 * is done only by a committed registry entry or store lot; an entry of a repository that cannot be read is
 * `unknown`. Pure.
 */
export function entryStates(params: EntryStatesParams): PlanStates {
	const { block, facts } = params
	const dependencies = dependenciesOf({ block })
	const sharedBranches = sharedBranchesOf({ block })
	const records = new Map(
		block.lots.map((entry) => [entry.id, recordOf({ entry, facts, sharedBranches })] as const),
	)
	const attributions = worktreeAttributionsOf({ block, facts, records, dependencies })
	const statuses = new Map<string, EntryStatus>()
	for (const entry of block.lots)
		statusOf({ entry, block, facts, records, attributions, dependencies, statuses })
	const entries = block.lots.map((entry) => statuses.get(entry.id) as EntryStatus)
	return { entries, outside: outsideWorkOf({ block, facts, statuses: entries }) }
}

/**
 * The status of one entry, its dependencies first (the block has no cycle), kept in `statuses` so each is made
 * once.
 */
function statusOf(params: {
	entry: PlanEntry
	block: PlanBlock
	facts: PlanFacts
	records: Map<string, EntryRecord | undefined>
	attributions: Map<string, WorktreeAttribution>
	dependencies: Map<string, string[]>
	statuses: Map<string, EntryStatus>
}): EntryStatus {
	const { entry, statuses } = params
	const known = statuses.get(entry.id)
	if (known !== undefined) return known
	const status: EntryStatus = {
		id: entry.id,
		kind: entry.kind,
		spec: specOf({ entry, facts: params.facts }),
		waitsFor: [],
		...(params.records.get(entry.id) ??
			attributedRecordOf({ attribution: params.attributions.get(entry.id) }) ??
			unrecordedOf({ ...params })),
	}
	statuses.set(entry.id, status)
	return status
}

/** A parked entry, else ready when every dependency is done, else waiting on the ones that are not. */
function unrecordedOf(params: {
	entry: PlanEntry
	block: PlanBlock
	facts: PlanFacts
	records: Map<string, EntryRecord | undefined>
	attributions: Map<string, WorktreeAttribution>
	dependencies: Map<string, string[]>
	statuses: Map<string, EntryStatus>
}): EntryRecord & Pick<EntryStatus, 'waitsFor'> {
	const empty = { lotState: null, realizedBy: null, note: null, heldScope: {} }
	if (params.entry.parked !== undefined)
		return { ...empty, state: 'parked', reason: params.entry.parked, waitsFor: [] }
	const waitsFor = (params.dependencies.get(params.entry.id) ?? []).flatMap(function notDoneOf(id) {
		const dependency = params.block.lots.find((candidate) => candidate.id === id)
		if (dependency === undefined) return []
		const { state } = statusOf({ ...params, entry: dependency })
		return state === 'done' ? [] : [{ id, state }]
	})
	return {
		...empty,
		state: waitsFor.length === 0 ? 'ready' : 'waiting',
		reason: null,
		waitsFor,
	}
}

/** The spec an entry names, with its status (missing when the facts did not read it). */
function specOf(params: { entry: PlanEntry; facts: PlanFacts }): EntryStatus['spec'] {
	const { spec } = params.entry
	if (spec === undefined) return null
	return { file: spec, status: params.facts.specs[spec]?.status ?? 'missing' }
}

/** An entry open by the worktree attributed to it. */
function attributedRecordOf(params: {
	attribution: WorktreeAttribution | undefined
}): EntryRecord | undefined {
	const { attribution } = params
	if (attribution === undefined) return undefined
	return {
		state: 'open',
		lotState: null,
		realizedBy: {
			kind: 'worktree',
			name: attribution.worktree.name,
			folder: null,
			worktree: attribution.worktree.path,
		},
		reason: null,
		note: MANUAL_OPEN_NOTE,
		heldScope: attribution.heldScope,
	}
}

/** What an entry's own records say: a mark, a written spec, a store lot or a registry entry. */
function recordOf(params: {
	entry: PlanEntry
	facts: PlanFacts
	sharedBranches: Set<string>
}): EntryRecord | undefined {
	const { entry, facts } = params
	if (entry.kind === 'person') return markRecordOf({ entry, facts })
	if (entry.kind === 'spec') return specRecordOf({ entry, facts })
	return repositoryRecordOf(params)
}

/** A person entry is done by a mark on its id. */
function markRecordOf(params: { entry: PlanEntry; facts: PlanFacts }): EntryRecord | undefined {
	const mark = params.facts.marks.find((candidate) => candidate.id === params.entry.id)
	if (mark === undefined) return undefined
	return doneOf({ realizedBy: { kind: 'mark', name: mark.by, folder: null, worktree: null } })
}

/** A spec entry is done when its file is written. */
function specRecordOf(params: { entry: PlanEntry; facts: PlanFacts }): EntryRecord | undefined {
	const { spec } = params.entry
	if (spec === undefined || params.facts.specs[spec]?.status !== 'written') return undefined
	return doneOf({ realizedBy: { kind: 'spec', name: spec, folder: null, worktree: null } })
}

/**
 * A `lot` or `fix` entry from its repositories' records: unknown when one cannot be read; done by a committed
 * registry entry or store lot; open by an open store lot (its brief scope held) or a pending registry entry (the
 * entry's scope held, its date named).
 */
function repositoryRecordOf(params: {
	entry: PlanEntry
	facts: PlanFacts
	sharedBranches: Set<string>
}): EntryRecord | undefined {
	const { entry, facts } = params
	const names = Object.keys(entry.scope)
	const unreadable = names.flatMap(function reasonOf(name) {
		const repository = facts.repositories[name]
		if (repository === undefined) return [`repository ${name} was not read`]
		return repository.readable ? [] : [`repository ${name}: ${repository.reason}`]
	})
	if (unreadable.length > 0)
		return {
			state: 'unknown',
			lotState: null,
			realizedBy: null,
			reason: unreadable.join('; '),
			note: null,
			heldScope: {},
		}
	const storeLots = names.flatMap((name) =>
		storeLotsOf({ repository: facts.repositories[name] })
			.filter((lot) => isStoreLotOf({ entry, lot, sharedBranches: params.sharedBranches }))
			.map((lot) => ({ repository: name, lot })),
	)
	const registry = names.flatMap((name) =>
		registryOf({ repository: facts.repositories[name] }).filter((record) =>
			isRegistryEntryOf({ entry, record }),
		),
	)
	return committedRecordOf({ storeLots, registry }) ?? openRecordOf({ entry, storeLots, registry })
}

/** Done by the first committed registry entry, else the first committed store lot. */
function committedRecordOf(params: {
	storeLots: RepositoryStoreLot[]
	registry: RegistryFact[]
}): EntryRecord | undefined {
	const record = params.registry.find((candidate) => candidate.state === 'committed')
	if (record !== undefined) return doneOf({ realizedBy: registryRealizationOf({ record }) })
	const committed = params.storeLots.find(({ lot }) => lot.state === 'committed')
	if (committed === undefined) return undefined
	return doneOf({ realizedBy: storeRealizationOf({ lot: committed.lot }) })
}

/**
 * Open by an open store lot (its own state, its brief scope; the entry's declared scope in that repository when the
 * brief gives none), else by the earliest pending registry entry, or one in a state the cli does not know (read
 * like pending: open, never done).
 */
function openRecordOf(params: {
	entry: PlanEntry
	storeLots: RepositoryStoreLot[]
	registry: RegistryFact[]
}): EntryRecord | undefined {
	const open = params.storeLots.find(({ lot }) => lot.open && OPEN_LOT_STATES.includes(lot.state))
	if (open !== undefined)
		return {
			state: 'open',
			lotState: open.lot.state,
			realizedBy: storeRealizationOf({ lot: open.lot }),
			reason: null,
			note: null,
			heldScope: {
				[open.repository]:
					open.lot.scope.length > 0
						? [...open.lot.scope]
						: [...(params.entry.scope[open.repository] ?? [])],
			},
		}
	const pending = params.registry
		.filter((candidate) => isPendingLike({ record: candidate }))
		.sort((first, second) => first.written.localeCompare(second.written))[0]
	if (pending === undefined) return undefined
	return {
		state: 'open',
		lotState: null,
		realizedBy: registryRealizationOf({ record: pending }),
		reason: null,
		note: pendingNoteOf({ record: pending }),
		heldScope: copiedScopeOf({ scope: params.entry.scope }),
	}
}

/** A registry entry that is open work: `pending`, or a state the cli does not know (the conservative reading). */
function isPendingLike(params: { record: RegistryFact }): boolean {
	return params.record.state === 'pending' || !KNOWN_REGISTRY_STATES.includes(params.record.state)
}

/** `pending since <date>`, or `state <x> not known` for a state the cli does not know. */
function pendingNoteOf(params: { record: RegistryFact }): string {
	const { record } = params
	return record.state === 'pending'
		? `${PENDING_NOTE_PREFIX} ${dateOf({ written: record.written })}`
		: `${UNKNOWN_REGISTRY_STATE_PREFIX} ${record.state} ${UNKNOWN_REGISTRY_STATE_SUFFIX}`
}

/** A done record realized by `realizedBy`. */
function doneOf(params: { realizedBy: EntryStatus['realizedBy'] }): EntryRecord {
	return {
		state: 'done',
		lotState: null,
		realizedBy: params.realizedBy,
		reason: null,
		note: null,
		heldScope: {},
	}
}

/** The realization of a registry entry. */
function registryRealizationOf(params: { record: RegistryFact }): EntryStatus['realizedBy'] {
	const { record } = params
	return {
		kind: 'registry',
		name: record.name,
		folder: record.folder,
		worktree: record.worktree === '' ? null : record.worktree,
	}
}

/** The realization of a store lot. */
function storeRealizationOf(params: { lot: StoreLotFact }): EntryStatus['realizedBy'] {
	return { kind: 'store', name: params.lot.name, folder: null, worktree: params.lot.worktree }
}

/**
 * The worktrees attributed to entries, by entry id. For each branch the entries share, in `dependsOn` order: a
 * worktree on that branch goes to the first entry neither done, open nor unknown by its own records. When that
 * entry is not ready (a dependency not done), the attribution is uncertain and it holds the union of the scopes of
 * every remaining entry of the branch.
 */
function worktreeAttributionsOf(params: {
	block: PlanBlock
	facts: PlanFacts
	records: Map<string, EntryRecord | undefined>
	dependencies: Map<string, string[]>
}): Map<string, WorktreeAttribution> {
	const { block, facts, records, dependencies } = params
	const repositoryEntries = block.lots.filter(
		(entry) => PLAN_REPOSITORY_KINDS.includes(entry.kind) && entry.match !== undefined,
	)
	const branches = [...new Set(repositoryEntries.map((entry) => entry.match?.branch ?? ''))]
	return new Map(
		branches.flatMap(function attributionOfBranch(branch) {
			const chain = chainOf({
				entries: repositoryEntries.filter((entry) => entry.match?.branch === branch),
				dependencies,
			})
			const candidates = chain.filter((entry) => records.get(entry.id) === undefined)
			if (candidates.length === 0) return []
			const [first] = candidates
			const worktree = Object.keys(first.scope)
				.flatMap((name) => worktreesOf({ repository: facts.repositories[name] }))
				.find((candidate) => candidate.branch === branch)
			if (worktree === undefined) return []
			const certain = (dependencies.get(first.id) ?? []).every(
				(id) => records.get(id)?.state === 'done',
			)
			const holders = certain ? [first] : candidates
			return [
				[
					first.id,
					{
						worktree: { name: worktree.name, path: worktree.path },
						heldScope: unionScopeOf({ scopes: holders.map((entry) => entry.scope) }),
					},
				] as const,
			]
		}),
	)
}

/** The entries of one branch in `dependsOn` order: an entry after every entry of the branch it depends on. */
function chainOf(params: {
	entries: PlanEntry[]
	dependencies: Map<string, string[]>
}): PlanEntry[] {
	const ids = new Set(params.entries.map((entry) => entry.id))
	const depth = new Map<string, number>()
	for (const entry of params.entries)
		depth.set(entry.id, ancestorsCountOf({ id: entry.id, ids, dependencies: params.dependencies }))
	return [...params.entries].sort(
		(first, second) => (depth.get(first.id) ?? 0) - (depth.get(second.id) ?? 0),
	)
}

/** How many entries of `ids` the entry depends on, directly or through others. */
function ancestorsCountOf(params: {
	id: string
	ids: Set<string>
	dependencies: Map<string, string[]>
}): number {
	const reached = new Set<string>()
	const pending = [...(params.dependencies.get(params.id) ?? [])]
	while (pending.length > 0) {
		const next = pending.pop() as string
		if (reached.has(next)) continue
		reached.add(next)
		pending.push(...(params.dependencies.get(next) ?? []))
	}
	return [...reached].filter((id) => params.ids.has(id)).length
}

/** The union of scopes by repository, each entry once, in the order met. */
function unionScopeOf(params: { scopes: Record<string, string[]>[] }): Record<string, string[]> {
	const union: Record<string, string[]> = {}
	for (const scope of params.scopes)
		for (const [name, entries] of Object.entries(scope))
			union[name] = [...new Set([...(union[name] ?? []), ...entries])]
	return union
}

/** A copy of a scope, so a status never shares the block's arrays. */
function copiedScopeOf(params: { scope: Record<string, string[]> }): Record<string, string[]> {
	return unionScopeOf({ scopes: [params.scope] })
}

/**
 * The open work of each readable repository the entries do not hold: every open store lot no entry is open through
 * (with its brief scope, the entry it matches named), a pending registry entry no entry matches, a worktree on the
 * branch of entries none of which is open (their scope), an index-numbered worktree on a branch nothing holds
 * (scope unknown). A review or verify throwaway of an accounted worktree is not outside work.
 */
function outsideWorkOf(params: {
	block: PlanBlock
	facts: PlanFacts
	statuses: EntryStatus[]
}): OutsideWork[] {
	const { block, facts, statuses } = params
	const sharedBranches = sharedBranchesOf({ block })
	return Object.keys(block.repositories).flatMap(function outsideOfRepository(repository) {
		const repositoryFacts = facts.repositories[repository]
		if (repositoryFacts === undefined || !repositoryFacts.readable) return []
		const entries = block.lots.filter(
			(entry) =>
				PLAN_REPOSITORY_KINDS.includes(entry.kind) &&
				entry.match !== undefined &&
				repository in entry.scope,
		)
		const storeLots: OutsideWork[] = repositoryFacts.storeLots
			.filter((lot) => lot.open && !isOpenThrough({ statuses, repository, name: lot.name }))
			.map((lot) => ({
				repository,
				kind: 'store',
				name: lot.name,
				scope: [...lot.scope],
				since: null,
				...entriesNoteOf({
					entries: entries.filter((entry) => isStoreLotOf({ entry, lot, sharedBranches })),
					statuses,
				}),
			}))
		const registry: OutsideWork[] = repositoryFacts.registry
			.filter((record) => isPendingLike({ record }))
			.flatMap(function registryWorkOf(record): OutsideWork[] {
				const work = {
					repository,
					kind: 'registry' as const,
					name: record.name,
					since: dateOf({ written: record.written }),
					...(record.state !== 'pending' && { note: pendingNoteOf({ record }) }),
				}
				const matched = entries.filter((entry) => isRegistryEntryOf({ entry, record }))
				if (matched.length === 0) return [{ ...work, scope: null }]
				return unknownHoldingOf({ repository, entries: matched, statuses }).map((holding) => ({
					...work,
					...holding,
				}))
			})
		const damaged: OutsideWork[] = (repositoryFacts.damaged ?? []).map((record) => ({
			repository,
			kind: record.kind,
			name: record.name,
			scope: null,
			since: null,
			note: `${DAMAGED_NOTE_PREFIX} ${record.file}`,
		}))
		return [
			...storeLots,
			...registry,
			...entryWorktreesOf({ repository, repositoryFacts, entries, statuses }),
			...outsideWorktreesOf({ repository, repositoryFacts, entries }),
			...damaged,
		]
	})
}

/** An entry is open through the store lot `name` of `repository`. */
function isOpenThrough(params: {
	statuses: EntryStatus[]
	repository: string
	name: string
}): boolean {
	return params.statuses.some(
		(status) =>
			status.state === 'open' &&
			status.realizedBy?.kind === 'store' &&
			status.realizedBy.name === params.name &&
			params.repository in status.heldScope,
	)
}

/** The state of an entry among the statuses (undefined when it has none). */
function stateOfEntry(params: { entry: PlanEntry; statuses: EntryStatus[] }): string | undefined {
	return params.statuses.find((status) => status.id === params.entry.id)?.state
}

/**
 * The worktrees on the branch of `unknown` entries (a repository of theirs unreadable) when no entry of the branch
 * is open, each holding what `unknownHoldingOf` gives. A done entry's leftover worktree
 * holds nothing (section 5 row 5: a worktree counts only for an entry without a record); a worktree attributed to an
 * open entry is that entry's; a worktree of an open store lot is left out (the lot holds).
 */
function entryWorktreesOf(params: {
	repository: string
	repositoryFacts: Extract<RepositoryFacts, { readable: true }>
	entries: PlanEntry[]
	statuses: EntryStatus[]
}): OutsideWork[] {
	const { repository, repositoryFacts, entries, statuses } = params
	const lotWorktrees = new Set(
		repositoryFacts.storeLots.flatMap((lot) =>
			lot.open && lot.worktree !== null ? [lot.worktree] : [],
		),
	)
	return repositoryFacts.worktrees.flatMap(function entryWorktreeOf(worktree): OutsideWork[] {
		const onBranch = entries.filter((entry) => entry.match?.branch === worktree.branch)
		if (lotWorktrees.has(worktree.path)) return []
		return unknownHoldingOf({ repository, entries: onBranch, statuses }).map((holding) => ({
			repository,
			kind: 'worktree',
			name: worktree.name,
			since: null,
			...holding,
		}))
	})
}

/**
 * What a record matched by `entries` holds when none of them is open and some are `unknown`: the union of the
 * unknown entries' scopes in the repository, with the note naming them; nothing otherwise (no entry, an open one
 * holds, or every one is done by its own record).
 */
function unknownHoldingOf(params: {
	repository: string
	entries: PlanEntry[]
	statuses: EntryStatus[]
}): Pick<OutsideWork, 'scope' | 'note'>[] {
	const { entries, statuses } = params
	if (entries.some((entry) => stateOfEntry({ entry, statuses }) === 'open')) return []
	const unknown = entries.filter((entry) => stateOfEntry({ entry, statuses }) === 'unknown')
	if (unknown.length === 0) return []
	return [
		{
			scope: unionScopeOf({ scopes: unknown.map((entry) => entry.scope) })[params.repository] ?? [],
			...entriesNoteOf({ entries: unknown, statuses }),
		},
	]
}

/** `of <id> (<state>), ...` for the entries a record matches; nothing when it matches none. */
function entriesNoteOf(params: {
	entries: PlanEntry[]
	statuses: EntryStatus[]
}): Pick<OutsideWork, 'note'> {
	if (params.entries.length === 0) return {}
	const texts = params.entries.map(
		(entry) =>
			`${entry.id} (${params.statuses.find((status) => status.id === entry.id)?.state ?? 'unknown'})`,
	)
	return { note: `of ${texts.join(LIST_SEPARATOR)}` }
}

/**
 * The index-numbered worktrees of a repository on a branch no entry matches and no store lot or live registry
 * entry holds; the throwaways (`-round-<n>`, `-verify`) of an accounted worktree left out.
 */
function outsideWorktreesOf(params: {
	repository: string
	repositoryFacts: Extract<RepositoryFacts, { readable: true }>
	entries: PlanEntry[]
}): OutsideWork[] {
	const { repository, repositoryFacts, entries } = params
	const entryBranches = new Set(entries.map((entry) => entry.match?.branch))
	const heldBranches = new Set([
		...entryBranches,
		...repositoryFacts.storeLots
			.filter((lot) => lot.open || lot.state === 'committed')
			.map((lot) => lot.branch),
		...repositoryFacts.registry
			.filter((record) => record.state === 'committed' || isPendingLike({ record }))
			.map((record) => record.branch),
	])
	const accounted = new Set(
		repositoryFacts.worktrees
			.filter((worktree) => entryBranches.has(worktree.branch))
			.map((worktree) => worktree.name),
	)
	return repositoryFacts.worktrees
		.filter(
			(worktree) =>
				INDEX_WORKTREE_PATTERN.test(worktree.name) &&
				worktree.branch !== undefined &&
				!heldBranches.has(worktree.branch) &&
				!heldBranches.has(THROWAWAY_BRANCH_PATTERN.exec(worktree.branch)?.[1] ?? '') &&
				!accounted.has(THROWAWAY_WORKTREE_PATTERN.exec(worktree.name)?.[1] ?? ''),
		)
		.map((worktree) => ({
			repository,
			kind: 'worktree',
			name: worktree.name,
			scope: null,
			since: null,
		}))
}

/**
 * The store lot is the entry's: of its `match.feature`, or on its branch when no other entry shares that branch
 * (on a shared branch the feature alone tells the entries' lots apart: a record realizes one entry).
 */
function isStoreLotOf(params: {
	entry: PlanEntry
	lot: StoreLotFact
	sharedBranches: Set<string>
}): boolean {
	const { match } = params.entry
	if (match === undefined) return false
	if (match.feature !== undefined && params.lot.feature === match.feature) return true
	return params.lot.branch === match.branch && !params.sharedBranches.has(match.branch)
}

/** The branches two or more `lot` or `fix` entries match. */
function sharedBranchesOf(params: { block: PlanBlock }): Set<string> {
	const seen = new Set<string>()
	const shared = new Set<string>()
	for (const entry of params.block.lots) {
		const branch = entry.match?.branch
		if (branch === undefined || !PLAN_REPOSITORY_KINDS.includes(entry.kind)) continue
		if (seen.has(branch)) shared.add(branch)
		seen.add(branch)
	}
	return shared
}

/**
 * The registry entry is the entry's: its folder is `match.handover` (compared as resolved path strings: a folder
 * moved away still compares), or, without one, its branch is `match.branch`.
 */
function isRegistryEntryOf(params: { entry: PlanEntry; record: RegistryFact }): boolean {
	const { match } = params.entry
	if (match === undefined) return false
	if (match.handover !== undefined) return resolve(params.record.folder) === resolve(match.handover)
	return params.record.branch === match.branch
}

/** The store lots of a readable repository (none otherwise). */
function storeLotsOf(params: { repository: RepositoryFacts | undefined }): StoreLotFact[] {
	return params.repository?.readable ? params.repository.storeLots : []
}

/** The registry entries of a readable repository (none otherwise). */
function registryOf(params: { repository: RepositoryFacts | undefined }): RegistryFact[] {
	return params.repository?.readable ? params.repository.registry : []
}

/** The worktrees of a readable repository (none otherwise). */
function worktreesOf(params: {
	repository: RepositoryFacts | undefined
}): Extract<RepositoryFacts, { readable: true }>['worktrees'] {
	return params.repository?.readable ? params.repository.worktrees : []
}

/** The date part of a registry entry's ISO time (`2026-11-04`). */
function dateOf(params: { written: string }): string {
	return params.written.slice(0, ISO_DATE_LENGTH)
}
