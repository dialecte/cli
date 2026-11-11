import {
	blockOf,
	branchOf,
	byId,
	factsOf,
	lotOf,
	markOf,
	personOf,
	planFile,
	registryOf,
	specEntryOf,
	storeLotOf,
	worktreeOf,
} from '../../../test/plan-state-facts.ts'
import { entryStates } from './entry-state.ts'

import { describe, expect, it } from 'vitest'

import type { RepositorySpec } from '../../../test/plan-state-facts.types.ts'
import type { EntryStatus, OutsideWork } from './entry-state.types.ts'
import type { PlanEntry } from './plan-block.types.ts'
import type {
	DamagedRecord,
	PlanMark,
	RegistryFact,
	RepositoryFacts,
	SpecStatusName,
} from './plan.types.ts'

type StateRow = {
	name: string
	lots: PlanEntry[]
	repositories?: Record<string, RepositorySpec>
	specs?: Record<string, SpecStatusName>
	marks?: PlanMark[]
	expected: Record<string, Expected>
}

/** What a row asserts of an entry: any of its fields, nested ones partial (matched with toMatchObject). */
type Expected = { [Field in keyof EntryStatus]?: unknown }

const SPEC_FILE = planFile('spec.md')
const SHARED = 'feat/shared'

/** Three entries on one branch, ordered by `dependsOn` (L0-0, L0a1, L0a2 of the real plan). */
const SHARED_CHAIN: PlanEntry[] = [
	lotOf('C0', {
		scope: { cli: ['src/c0/'] },
		match: { branch: SHARED, handover: planFile('C0') },
	}),
	lotOf('C1', {
		dependsOn: ['C0'],
		scope: { cli: ['src/c1/'] },
		match: { branch: SHARED, handover: planFile('C1') },
	}),
	lotOf('C2', {
		dependsOn: ['C1'],
		scope: { cli: ['src/c2/'] },
		match: { branch: SHARED, handover: planFile('C2') },
	}),
]

const DONE_C0 = registryOf({
	name: '2026-11-09-c0',
	branch: SHARED,
	folder: planFile('C0'),
	state: 'committed',
})

const RECORD_ROWS: StateRow[] = [
	{
		name: 'person entry with a mark is done',
		lots: [personOf('K0')],
		marks: [markOf('K0')],
		expected: { K0: { state: 'done', realizedBy: { kind: 'mark' } } },
	},
	{
		name: 'person entry without a mark is ready',
		lots: [personOf('K0')],
		expected: { K0: { state: 'ready', realizedBy: null } },
	},
	{
		name: 'spec entry with a written spec is done',
		lots: [specEntryOf('S', SPEC_FILE)],
		specs: { [SPEC_FILE]: 'written' },
		expected: { S: { state: 'done', realizedBy: { kind: 'spec' } } },
	},
	{
		name: 'spec entry with a DRAFT spec is ready',
		lots: [specEntryOf('S', SPEC_FILE)],
		specs: { [SPEC_FILE]: 'DRAFT' },
		expected: { S: { state: 'ready' } },
	},
	{
		name: 'spec entry with a missing spec is ready',
		lots: [specEntryOf('S', SPEC_FILE)],
		specs: { [SPEC_FILE]: 'missing' },
		expected: { S: { state: 'ready' } },
	},
	{
		name: 'committed registry entry by the hand-over folder is done',
		lots: [lotOf('L1', { match: { branch: 'feat/l1', handover: planFile('L1') } })],
		repositories: {
			cli: {
				registry: [
					registryOf({
						name: 'r1',
						branch: 'feat/other',
						folder: planFile('L1'),
						state: 'committed',
					}),
				],
			},
		},
		expected: {
			L1: { state: 'done', realizedBy: { kind: 'registry', folder: planFile('L1') } },
		},
	},
	{
		name: 'committed registry entry by the branch is done',
		lots: [lotOf('L1')],
		repositories: {
			cli: { registry: [registryOf({ name: 'r1', branch: branchOf('L1'), state: 'committed' })] },
		},
		expected: { L1: { state: 'done', realizedBy: { kind: 'registry' } } },
	},
	{
		name: 'a hand-over folder rule ignores a committed entry of the same branch in another folder',
		lots: [lotOf('L1', { match: { branch: 'feat/l1', handover: planFile('L1') } })],
		repositories: {
			cli: {
				registry: [
					registryOf({ name: 'r1', branch: 'feat/l1', folder: planFile('L0'), state: 'committed' }),
				],
			},
		},
		expected: { L1: { state: 'ready' } },
	},
	{
		name: 'committed store lot by the branch is done',
		lots: [lotOf('L1')],
		repositories: {
			cli: {
				storeLots: [
					storeLotOf({
						name: '0001-cli-l1',
						branch: branchOf('L1'),
						state: 'committed',
						open: false,
					}),
				],
			},
		},
		expected: {
			L1: { state: 'done', realizedBy: { kind: 'store', name: '0001-cli-l1' } },
		},
	},
	{
		name: 'committed store lot by match.feature is done',
		lots: [lotOf('L1', { match: { branch: 'feat/placeholder', feature: 'l1-feature' } })],
		repositories: {
			cli: {
				storeLots: [
					storeLotOf({
						name: '0001-cli-l1',
						branch: 'feat/real',
						feature: 'l1-feature',
						state: 'committed',
						open: false,
					}),
				],
			},
		},
		expected: { L1: { state: 'done' } },
	},
	{
		name: 'pending registry entry is open and names its date',
		lots: [lotOf('L1')],
		repositories: {
			cli: {
				registry: [
					registryOf({
						name: 'r1',
						branch: branchOf('L1'),
						written: '2026-11-09T10:00:00.000Z',
					}),
				],
			},
		},
		expected: {
			L1: {
				state: 'open',
				note: 'pending since 2026-11-09',
				realizedBy: { kind: 'registry' },
				heldScope: { cli: ['src/L1/'] },
			},
		},
	},
	{
		name: 'a stale pending registry entry keeps the lot open and names its old date',
		lots: [lotOf('L1')],
		repositories: {
			cli: { registry: [registryOf({ name: 'r1', branch: branchOf('L1') })] },
		},
		expected: { L1: { state: 'open', note: 'pending since 2026-11-04' } },
	},
	{
		name: 'store lot working is open with its lot state',
		lots: [lotOf('L1')],
		repositories: {
			cli: {
				storeLots: [storeLotOf({ name: '0001-cli-l1', branch: branchOf('L1'), state: 'working' })],
			},
		},
		expected: {
			L1: { state: 'open', lotState: 'working', realizedBy: { kind: 'store' } },
		},
	},
	{
		name: 'an entry open through a store lot holds the store lot brief scope, not its own',
		lots: [lotOf('L1', { scope: { cli: ['src/L1/'] } })],
		repositories: {
			cli: {
				storeLots: [
					storeLotOf({
						name: '0001-cli-l1',
						branch: branchOf('L1'),
						state: 'working',
						scope: ['src/brief-scope/', 'test/brief-scope.ts'],
					}),
				],
			},
		},
		expected: {
			L1: { state: 'open', heldScope: { cli: ['src/brief-scope/', 'test/brief-scope.ts'] } },
		},
	},
	{
		name: 'store lot input-required is open with its lot state',
		lots: [lotOf('L1')],
		repositories: {
			cli: {
				storeLots: [
					storeLotOf({ name: '0001-cli-l1', branch: branchOf('L1'), state: 'input-required' }),
				],
			},
		},
		expected: { L1: { state: 'open', lotState: 'input-required' } },
	},
	{
		name: 'store lot ready is open with its lot state',
		lots: [lotOf('L1')],
		repositories: {
			cli: {
				storeLots: [storeLotOf({ name: '0001-cli-l1', branch: branchOf('L1'), state: 'ready' })],
			},
		},
		expected: { L1: { state: 'open', lotState: 'ready' } },
	},
	{
		name: 'store lot failed (and open) is open with its lot state',
		lots: [lotOf('L1')],
		repositories: {
			cli: {
				storeLots: [storeLotOf({ name: '0001-cli-l1', branch: branchOf('L1'), state: 'failed' })],
			},
		},
		expected: { L1: { state: 'open', lotState: 'failed' } },
	},
	{
		name: 'a store lot failed by overlap is not open (case 7)',
		lots: [lotOf('L1')],
		repositories: {
			cli: {
				storeLots: [
					storeLotOf({ name: '0001-cli-l1', branch: branchOf('L1'), state: 'failed', open: false }),
				],
			},
		},
		expected: { L1: { state: 'ready', lotState: null } },
	},
	{
		name: 'a canceled store lot counts for nothing',
		lots: [lotOf('L1')],
		repositories: {
			cli: {
				storeLots: [
					storeLotOf({
						name: '0001-cli-l1',
						branch: branchOf('L1'),
						state: 'canceled',
						open: false,
					}),
				],
			},
		},
		expected: { L1: { state: 'ready' } },
	},
	{
		name: 'an abandoned registry entry is not done and not open',
		lots: [lotOf('L1')],
		repositories: {
			cli: {
				registry: [registryOf({ name: 'r1', branch: branchOf('L1'), state: 'abandoned' })],
			},
		},
		expected: { L1: { state: 'ready', realizedBy: null } },
	},
	{
		name: 'a lot depending on an abandoned entry waits (case 5)',
		lots: [lotOf('L1'), lotOf('L2', { dependsOn: ['L1'] })],
		repositories: {
			cli: {
				registry: [registryOf({ name: 'r1', branch: branchOf('L1'), state: 'abandoned' })],
			},
		},
		expected: { L2: { state: 'waiting', waitsFor: [{ id: 'L1', state: 'ready' }] } },
	},
	{
		name: 'several registry entries for one branch: any committed gives done',
		lots: [lotOf('L1')],
		repositories: {
			cli: {
				registry: [
					registryOf({ name: 'r1', branch: branchOf('L1'), state: 'pending' }),
					registryOf({ name: 'r2', branch: branchOf('L1'), state: 'committed' }),
				],
			},
		},
		expected: { L1: { state: 'done' } },
	},
	{
		name: 'several registry entries for one branch: else any pending gives open',
		lots: [lotOf('L1')],
		repositories: {
			cli: {
				registry: [
					registryOf({ name: 'r1', branch: branchOf('L1'), state: 'abandoned' }),
					registryOf({ name: 'r2', branch: branchOf('L1'), state: 'pending' }),
				],
			},
		},
		expected: { L1: { state: 'open' } },
	},
	{
		name: 'a committed record beats a worktree still on the branch',
		lots: [lotOf('L1')],
		repositories: {
			cli: {
				registry: [registryOf({ name: 'r1', branch: branchOf('L1'), state: 'committed' })],
				worktrees: [worktreeOf('0001-cli-l1', branchOf('L1'))],
			},
		},
		expected: { L1: { state: 'done' } },
	},
	{
		name: 'a worktree on the branch with no record is open, manual (case 1)',
		lots: [lotOf('L1', { scope: { cli: ['src/a/', 'src/b.ts'] } })],
		repositories: { cli: { worktrees: [worktreeOf('0005-cli-l1', branchOf('L1'))] } },
		expected: {
			L1: {
				state: 'open',
				note: 'manual, no hand-over yet',
				realizedBy: { kind: 'worktree', name: '0005-cli-l1' },
				heldScope: { cli: ['src/a/', 'src/b.ts'] },
			},
		},
	},
	{
		name: 'a detached worktree makes nothing open',
		lots: [lotOf('L1')],
		repositories: { cli: { worktrees: [worktreeOf('0005-cli-l1', undefined)] } },
		expected: { L1: { state: 'ready' } },
	},
	{
		name: 'a worktree on another branch makes nothing open',
		lots: [lotOf('L1')],
		repositories: { cli: { worktrees: [worktreeOf('0005-cli-x', 'feat/x')] } },
		expected: { L1: { state: 'ready' } },
	},
	{
		name: 'a lot with a written spec and no record is ready, never done',
		lots: [lotOf('L1', { spec: SPEC_FILE })],
		specs: { [SPEC_FILE]: 'written' },
		expected: { L1: { state: 'ready', spec: { file: SPEC_FILE, status: 'written' } } },
	},
	{
		name: 'a lot with a DRAFT spec keeps its state and shows the spec status',
		lots: [lotOf('L1', { spec: SPEC_FILE })],
		specs: { [SPEC_FILE]: 'DRAFT' },
		expected: { L1: { state: 'ready', spec: { file: SPEC_FILE, status: 'DRAFT' } } },
	},
	{
		name: 'an entry without a spec field has no spec',
		lots: [lotOf('L1')],
		expected: { L1: { spec: null } },
	},
]

const WAITING_ROWS: StateRow[] = [
	{
		name: 'a parked entry is parked and says why',
		lots: [lotOf('F', { parked: 'the user call' })],
		expected: { F: { state: 'parked', reason: 'the user call' } },
	},
	{
		name: 'an entry whose dependencies are done is ready',
		lots: [lotOf('A'), lotOf('B', { dependsOn: ['A'] })],
		repositories: {
			cli: { registry: [registryOf({ name: 'r1', branch: branchOf('A'), state: 'committed' })] },
		},
		expected: { A: { state: 'done' }, B: { state: 'ready', waitsFor: [] } },
	},
	{
		name: 'an entry waits for the entries not done, with their states',
		lots: [lotOf('A'), lotOf('B'), lotOf('C', { dependsOn: ['A', 'B'] })],
		repositories: { cli: { worktrees: [worktreeOf('0001-cli-a', branchOf('A'))] } },
		expected: {
			C: {
				state: 'waiting',
				waitsFor: [
					{ id: 'A', state: 'open' },
					{ id: 'B', state: 'ready' },
				],
			},
		},
	},
	{
		name: 'a dependency on a group means every entry of it',
		lots: [
			lotOf('A1', { group: 'G' }),
			lotOf('A2', { group: 'G' }),
			lotOf('C', { dependsOn: ['G'] }),
		],
		repositories: {
			cli: { registry: [registryOf({ name: 'r1', branch: branchOf('A1'), state: 'committed' })] },
		},
		expected: { C: { state: 'waiting', waitsFor: [{ id: 'A2', state: 'ready' }] } },
	},
	{
		name: 'a parked dependency makes its dependents wait, named parked (case 21)',
		lots: [lotOf('F', { parked: 'later' }), lotOf('U', { dependsOn: ['F'] })],
		expected: { U: { state: 'waiting', waitsFor: [{ id: 'F', state: 'parked' }] } },
	},
]

const SHARED_BRANCH_ROWS: StateRow[] = [
	{
		name: 'shared branch: the first done, the worktree to the next, the last waits (case 2)',
		lots: SHARED_CHAIN,
		repositories: {
			cli: { registry: [DONE_C0], worktrees: [worktreeOf('0016-cli-shared', SHARED)] },
		},
		expected: {
			C0: { state: 'done' },
			C1: {
				state: 'open',
				realizedBy: { kind: 'worktree' },
				heldScope: { cli: ['src/c1/'] },
			},
			C2: { state: 'waiting', waitsFor: [{ id: 'C1', state: 'open' }] },
		},
	},
	{
		name: 'shared branch: a pending hand-over leaves the worktree to the next entry (case 26)',
		lots: SHARED_CHAIN,
		repositories: {
			cli: {
				registry: [
					DONE_C0,
					registryOf({ name: '2026-11-10-c1', branch: SHARED, folder: planFile('C1') }),
				],
				worktrees: [worktreeOf('0016-cli-shared', SHARED)],
			},
		},
		expected: {
			C0: { state: 'done' },
			C1: {
				state: 'open',
				realizedBy: { kind: 'registry' },
				heldScope: { cli: ['src/c1/'] },
			},
			C2: {
				state: 'open',
				realizedBy: { kind: 'worktree' },
				note: 'manual, no hand-over yet',
				heldScope: { cli: ['src/c2/'] },
			},
		},
	},
	{
		name: 'shared branch: an uncertain attribution holds the union of the candidates scopes',
		lots: [
			lotOf('S2'),
			lotOf('C1', {
				dependsOn: ['S2'],
				scope: { cli: ['src/c1/'] },
				match: { branch: SHARED, handover: planFile('C1') },
			}),
			lotOf('C2', {
				dependsOn: ['C1'],
				scope: { cli: ['src/c2/'] },
				match: { branch: SHARED, handover: planFile('C2') },
			}),
		],
		repositories: {
			cli: {
				storeLots: [storeLotOf({ name: '0002-cli-s2', branch: branchOf('S2'), state: 'working' })],
				worktrees: [worktreeOf('0016-cli-shared', SHARED)],
			},
		},
		expected: {
			C1: {
				state: 'open',
				realizedBy: { kind: 'worktree' },
				heldScope: { cli: ['src/c1/', 'src/c2/'] },
			},
			C2: { state: 'waiting' },
		},
	},
]

const UNKNOWN_ROWS: StateRow[] = [
	{
		name: 'an unreadable repository makes its entries unknown, with the reason',
		lots: [lotOf('L1'), personOf('K0')],
		repositories: { cli: 'cannot read /work/cli/.git' },
		expected: {
			L1: {
				state: 'unknown',
				reason: expect.stringContaining('cannot read /work/cli/.git'),
			},
			K0: { state: 'ready' },
		},
	},
	{
		name: 'a dependent of an unknown entry waits, never ready (case 11)',
		lots: [lotOf('A'), lotOf('B', { dependsOn: ['A'], scope: { core: ['src/b/'] } })],
		repositories: { cli: 'moved away', core: {} },
		expected: {
			A: { state: 'unknown' },
			B: { state: 'waiting', waitsFor: [{ id: 'A', state: 'unknown' }] },
		},
	},
]

RECORD_ROWS.push(
	{
		name: 'an entry open through its store lot whose brief gives no scope holds the entry scope',
		lots: [lotOf('L1', { scope: { cli: ['src/l1/', 'src/l1.ts'] } })],
		repositories: {
			cli: {
				storeLots: [storeLotOf({ name: '0001-cli-l1', branch: branchOf('L1'), scope: [] })],
			},
		},
		expected: {
			L1: {
				state: 'open',
				realizedBy: { kind: 'store', name: '0001-cli-l1' },
				heldScope: { cli: ['src/l1/', 'src/l1.ts'] },
			},
		},
	},
	{
		name: 'a registry entry in a state not known is read like pending: open, its scope held, never done',
		lots: [lotOf('L1')],
		repositories: {
			cli: {
				registry: [
					registryOf({
						name: 'r1',
						branch: branchOf('L1'),
						state: 'merged' as RegistryFact['state'],
					}),
				],
			},
		},
		expected: {
			L1: {
				state: 'open',
				realizedBy: { kind: 'registry', name: 'r1' },
				note: 'state merged not known',
				heldScope: { cli: ['src/L1/'] },
			},
		},
	},
)

describe('entryStates: the table of section 5', () => {
	it.each(RECORD_ROWS)('$name', ({ lots, repositories, specs, marks, expected }) => {
		const block = blockOf({ lots })
		const facts = factsOf({ repositories, specs, marks })
		expect(byId(entryStates({ block, facts }))).toMatchObject(expected)
	})
})

describe('entryStates: ready, waiting, parked', () => {
	it.each(WAITING_ROWS)('$name', ({ lots, repositories, expected }) => {
		const block = blockOf({ lots })
		const facts = factsOf({ repositories })
		expect(byId(entryStates({ block, facts }))).toMatchObject(expected)
	})
})

/** SHARED_CHAIN with a store lot feature on each entry. */
const FEATURED_CHAIN: PlanEntry[] = SHARED_CHAIN.map((entry) => ({
	...entry,
	match: { branch: SHARED, handover: planFile(entry.id), feature: `feature-${entry.id}` },
}))

const ONE_RECORD_ONE_ENTRY_ROWS: StateRow[] = [
	{
		name: 'shared branch: a committed store lot realizes the entry of its feature only',
		lots: FEATURED_CHAIN,
		repositories: {
			cli: {
				storeLots: [
					storeLotOf({
						name: '0010-cli-c0',
						branch: SHARED,
						feature: 'feature-C0',
						state: 'committed',
						open: false,
					}),
				],
			},
		},
		expected: {
			C0: { state: 'done', realizedBy: { kind: 'store', name: '0010-cli-c0' } },
			C1: { state: 'ready', realizedBy: null },
			C2: { state: 'waiting' },
		},
	},
	{
		name: 'shared branch: a committed store lot of no entry feature realizes none of them',
		lots: FEATURED_CHAIN,
		repositories: {
			cli: {
				storeLots: [
					storeLotOf({
						name: '0011-cli-other',
						branch: SHARED,
						feature: 'another-feature',
						state: 'committed',
						open: false,
					}),
				],
			},
		},
		expected: { C0: { state: 'ready' }, C1: { state: 'waiting' }, C2: { state: 'waiting' } },
	},
]

describe('entryStates: one record realizes one entry', () => {
	it.each(ONE_RECORD_ONE_ENTRY_ROWS)('$name', ({ lots, repositories, expected }) => {
		const block = blockOf({ lots })
		const facts = factsOf({ repositories })
		expect(byId(entryStates({ block, facts }))).toMatchObject(expected)
	})

	it('shared branch: an open store lot of no entry feature is open work of its brief scope', () => {
		const block = blockOf({ lots: FEATURED_CHAIN })
		const facts = factsOf({
			repositories: {
				cli: {
					storeLots: [
						storeLotOf({
							name: '0012-cli-other',
							branch: SHARED,
							feature: 'another-feature',
							scope: ['src/other/'],
						}),
					],
				},
			},
		})
		const states = entryStates({ block, facts })
		expect({ C0: byId(states).C0.state, outside: states.outside }).toEqual({
			C0: 'ready',
			outside: [
				{
					repository: 'cli',
					kind: 'store',
					name: '0012-cli-other',
					scope: ['src/other/'],
					since: null,
				},
			],
		})
	})
})

describe('entryStates: shared branch (cases 2, 26)', () => {
	it.each(SHARED_BRANCH_ROWS)('$name', ({ lots, repositories, expected }) => {
		const block = blockOf({ lots })
		const facts = factsOf({ repositories })
		expect(byId(entryStates({ block, facts }))).toMatchObject(expected)
	})
})

describe('entryStates: unreadable repositories (case 11)', () => {
	it.each(UNKNOWN_ROWS)('$name', ({ lots, repositories, expected }) => {
		const block = blockOf({ lots, repositories: Object.keys(repositories ?? { cli: 0 }) })
		const facts = factsOf({ repositories })
		expect(byId(entryStates({ block, facts }))).toMatchObject(expected)
	})
})

describe('entryStates: the entries come in block order', () => {
	it('lists one status per entry, in the block order', () => {
		const block = blockOf({ lots: [lotOf('B'), personOf('A'), lotOf('C')] })
		const facts = factsOf({})
		expect(entryStates({ block, facts }).entries.map((status) => status.id)).toEqual([
			'B',
			'A',
			'C',
		])
	})
})

type OutsideRow = {
	name: string
	lots: PlanEntry[]
	repository: RepositorySpec
	expected: OutsideWork[]
}

const OUTSIDE_ROWS: OutsideRow[] = [
	{
		name: 'an open store lot no entry matches is open work, with its brief scope (case 6)',
		lots: [lotOf('L1')],
		repository: {
			storeLots: [
				storeLotOf({
					name: '0007-cli-adhoc',
					branch: 'feat/adhoc',
					state: 'working',
					scope: ['src/adhoc/'],
				}),
			],
		},
		expected: [
			{
				repository: 'cli',
				kind: 'store',
				name: '0007-cli-adhoc',
				scope: ['src/adhoc/'],
				since: null,
			},
		],
	},
	{
		name: 'a store lot a block entry matches is not outside work',
		lots: [lotOf('L1')],
		repository: {
			storeLots: [storeLotOf({ name: '0001-cli-l1', branch: branchOf('L1'), scope: ['src/L1/'] })],
		},
		expected: [],
	},
	{
		name: 'an unmatched store lot that is not open is not outside work',
		lots: [lotOf('L1')],
		repository: {
			storeLots: [
				storeLotOf({ name: '0007-cli-old', branch: 'feat/old', state: 'committed', open: false }),
			],
		},
		expected: [],
	},
	{
		name: 'an unmatched pending registry entry is open work of unknown scope, with its date',
		lots: [lotOf('L1')],
		repository: {
			registry: [
				registryOf({ name: '2026-11-04-feat-handover-show', branch: 'feat/handover-show' }),
			],
		},
		expected: [
			{
				repository: 'cli',
				kind: 'registry',
				name: '2026-11-04-feat-handover-show',
				scope: null,
				since: '2026-11-04',
			},
		],
	},
	{
		name: 'a pending registry entry a block entry matches is not outside work',
		lots: [lotOf('L1')],
		repository: { registry: [registryOf({ name: 'r1', branch: branchOf('L1') })] },
		expected: [],
	},
	{
		name: 'unmatched committed and abandoned registry entries are not outside work',
		lots: [lotOf('L1')],
		repository: {
			registry: [
				registryOf({ name: 'r1', branch: 'feat/x', state: 'committed' }),
				registryOf({ name: 'r2', branch: 'feat/y', state: 'abandoned' }),
			],
		},
		expected: [],
	},
	{
		name: 'an index-numbered worktree on an unmatched branch is open work of unknown scope',
		lots: [lotOf('L1')],
		repository: { worktrees: [worktreeOf('0030-cli-adhoc', 'feat/adhoc2')] },
		expected: [
			{ repository: 'cli', kind: 'worktree', name: '0030-cli-adhoc', scope: null, since: null },
		],
	},
	{
		name: 'a lot started on another branch than its entry placeholder is outside work (case 25)',
		lots: [lotOf('L1')],
		repository: { worktrees: [worktreeOf('0031-cli-l1', 'feat/l1-real-name')] },
		expected: [
			{ repository: 'cli', kind: 'worktree', name: '0031-cli-l1', scope: null, since: null },
		],
	},
	{
		name: 'a worktree that is not index-numbered is not outside work',
		lots: [lotOf('L1')],
		repository: { worktrees: [worktreeOf('scratch', 'feat/scratch')] },
		expected: [],
	},
	{
		name: 'a worktree on a branch a committed registry entry holds is not outside work',
		lots: [lotOf('L1')],
		repository: {
			registry: [registryOf({ name: 'r1', branch: 'feat/done', state: 'committed' })],
			worktrees: [worktreeOf('0032-cli-done', 'feat/done')],
		},
		expected: [],
	},
	{
		name: 'review and verify throwaways of a matched lot are not outside work (case 25)',
		lots: [lotOf('L1')],
		repository: {
			worktrees: [
				worktreeOf('0022-cli-l1', branchOf('L1')),
				worktreeOf('0022-cli-l1-round-2', 'review/round-2'),
				worktreeOf('0022-cli-l1-verify', 'verify/final'),
			],
		},
		expected: [],
	},
]

OUTSIDE_ROWS.push({
	name: 'the throwaway of an unmatched lot is outside work, listed as the worktree it is',
	lots: [lotOf('L1')],
	repository: { worktrees: [worktreeOf('0040-cli-adhoc-round-1', 'review/adhoc-round-1')] },
	expected: [
		{
			repository: 'cli',
			kind: 'worktree',
			name: '0040-cli-adhoc-round-1',
			scope: null,
			since: null,
		},
	],
})

OUTSIDE_ROWS.push(
	{
		name: 'a review throwaway on the branch of a done entry plus -round-<n> is not outside work',
		lots: [lotOf('W', { match: { branch: 'feat/worktree-index' } })],
		repository: {
			registry: [registryOf({ name: 'r1', branch: 'feat/worktree-index', state: 'committed' })],
			worktrees: [
				worktreeOf('cli-worktree-index', 'feat/other-name'),
				worktreeOf('0001-cli-worktree-index-round-1', 'feat/worktree-index-round-1'),
			],
		},
		expected: [],
	},
	{
		name: 'a verify throwaway on the branch of an open store lot plus -verify is not outside work',
		lots: [lotOf('L1')],
		repository: {
			storeLots: [
				storeLotOf({ name: '0041-cli-adhoc', branch: 'feat/adhoc', scope: ['src/adhoc/'] }),
			],
			worktrees: [worktreeOf('0042-cli-check', 'feat/adhoc-verify')],
		},
		expected: [
			{
				repository: 'cli',
				kind: 'store',
				name: '0041-cli-adhoc',
				scope: ['src/adhoc/'],
				since: null,
			},
		],
	},
	{
		name: 'a worktree on the branch of a canceled store lot is outside work',
		lots: [lotOf('L1')],
		repository: {
			storeLots: [
				storeLotOf({ name: '0043-cli-old', branch: 'feat/old', state: 'canceled', open: false }),
			],
			worktrees: [worktreeOf('0044-cli-old', 'feat/old')],
		},
		expected: [
			{ repository: 'cli', kind: 'worktree', name: '0044-cli-old', scope: null, since: null },
		],
	},
	{
		name: 'an unmatched registry entry in a state not known is unattributed open work, like a pending one',
		lots: [lotOf('L1')],
		repository: {
			registry: [
				registryOf({ name: 'r9', branch: 'feat/x', state: 'merged' as RegistryFact['state'] }),
			],
			worktrees: [worktreeOf('0048-cli-x', 'feat/x')],
		},
		expected: [
			{
				repository: 'cli',
				kind: 'registry',
				name: 'r9',
				scope: null,
				since: '2026-11-04',
				note: 'state merged not known',
			},
		],
	},
	{
		name: 'the leftover worktree of an entry done by a committed record is not listed (section 5 row 5)',
		lots: [lotOf('D')],
		repository: {
			registry: [registryOf({ name: 'r1', branch: branchOf('D'), state: 'committed' })],
			worktrees: [worktreeOf('0047-cli-d', branchOf('D'))],
		},
		expected: [],
	},
	{
		name: 'a worktree on the branch of a lot failed by overlap is outside work',
		lots: [lotOf('L1')],
		repository: {
			storeLots: [
				storeLotOf({ name: '0045-cli-lost', branch: 'feat/lost', state: 'failed', open: false }),
			],
			worktrees: [worktreeOf('0046-cli-lost', 'feat/lost')],
		},
		expected: [
			{ repository: 'cli', kind: 'worktree', name: '0046-cli-lost', scope: null, since: null },
		],
	},
)

describe('entryStates: open work outside the plan', () => {
	it.each(OUTSIDE_ROWS)('$name', ({ lots, repository, expected }) => {
		const block = blockOf({ lots })
		const facts = factsOf({ repositories: { cli: repository } })
		expect(entryStates({ block, facts }).outside).toEqual(expected)
	})

	it('each damaged record is open work of unknown scope, saying what does not read', () => {
		const block = blockOf({ lots: [lotOf('L1')] })
		const read = factsOf({ repositories: { cli: {} } })
		const cli = read.repositories.cli as Extract<RepositoryFacts, { readable: true }>
		const damaged: DamagedRecord[] = [
			{ kind: 'store', name: '0002-cli-identity', file: '/s/0002-cli-identity/identity.json' },
			{ kind: 'registry', name: 'torn', file: '/r/torn.json' },
			{ kind: 'worktree', name: '0005-cli-no-gitdir', file: '/w/0005-cli-no-gitdir/gitdir' },
		]
		const facts = { ...read, repositories: { cli: { ...cli, damaged } } }
		expect(entryStates({ block, facts }).outside).toEqual(
			damaged.map((record) => ({
				repository: 'cli',
				kind: record.kind,
				name: record.name,
				scope: null,
				since: null,
				note: `damaged: ${record.file}`,
			})),
		)
	})
})
