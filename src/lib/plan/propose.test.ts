import {
	MORNING_NOV_08_BLOCK,
	MORNING_NOV_08_FACTS,
	MORNING_NOV_10_BLOCK,
	MORNING_NOV_10_BLOCK_WITHOUT_FIX,
	MORNING_NOV_10_FACTS,
} from '../../../test/plan-proposals-by-hand.constants.ts'
import {
	blockOf,
	branchOf,
	byId,
	factsOf,
	fixOf,
	lotOf,
	personOf,
	planFile,
	registryOf,
	specEntryOf,
	storeLotOf,
	worktreeOf,
} from '../../../test/plan-state-facts.ts'
import { entryStates } from './entry-state.ts'
import { proposePlan } from './propose.ts'

import { describe, expect, it } from 'vitest'

import type { RepositorySpec } from '../../../test/plan-state-facts.types.ts'
import type { PlanEntry } from './plan-block.types.ts'
import type { SpecStatusName } from './plan.types.ts'
import type { PlanProposals, PlanHeavyReading, SpecWork } from './propose.types.ts'

/** No live heavy marker: batch C tests the stacking. */
const NO_HEAVY: PlanHeavyReading = { markers: [] }

type ProposeRow = {
	name: string
	lots: PlanEntry[]
	shared?: Record<string, string[]>
	repositories?: Record<string, RepositorySpec>
	specs?: Record<string, SpecStatusName>
	briefs?: Record<string, boolean>
	expected: Expected
}

/** What a row asserts: any part of the answer; its spec work is compared regardless of order. */
type Expected = { specWork?: SpecWork[]; [part: string]: unknown }

/** Spec work with its lines and their ids in a fixed order: the order is not the spec's to state (D4f). */
function sortedSpecWork(list: SpecWork[]): SpecWork[] {
	return list
		.map((line) => ({ ...line, ids: [...line.ids].sort() }))
		.sort((first, second) => first.file.localeCompare(second.file))
}

/** Expected with its spec work put in the same fixed order as `summaryOf`'s. */
function expectedOf(expected: Expected): Expected {
	return expected.specWork === undefined
		? expected
		: { ...expected, specWork: sortedSpecWork(expected.specWork) }
}

/**
 * What the rows compare: the ids to start, the counts, the held (the pairs of each in a fixed order), the spec work
 * (in a fixed order) and the full proposals.
 */
function summaryOf(proposals: PlanProposals): Record<string, unknown> {
	return {
		start: proposals.proposals.map((proposal) => proposal.id),
		counts: proposals.counts,
		held: proposals.held.map((held) => ({ ...held, met: [...held.met].sort() })),
		specWork: sortedSpecWork(proposals.specWork),
		proposals: proposals.proposals,
	}
}

function openByWorktree(id: string): ReturnType<typeof worktreeOf> {
	return worktreeOf(`0001-cli-${id.toLowerCase()}`, branchOf(id))
}

function meets(params: { candidate: string; open: string; who: string }): string {
	return `${params.candidate} meets ${params.open} (${params.who}, open`
}

const HELD_ROWS: ProposeRow[] = [
	{
		name: 'an entry open through a store lot holds its brief scope, not the entry scope',
		lots: [
			lotOf('Open', { scope: { cli: ['src/Open/'] } }),
			lotOf('V', { scope: { cli: ['src/brief-only/x.ts'] } }),
			lotOf('W', { scope: { cli: ['src/Open/'] } }),
		],
		repositories: {
			cli: {
				storeLots: [
					storeLotOf({
						name: '0001-cli-open',
						branch: branchOf('Open'),
						state: 'working',
						scope: ['src/brief-only/'],
					}),
				],
			},
		},
		expected: { start: ['W'], held: [{ id: 'V', open: ['Open'] }] },
	},
	{
		name: 'counts: a held entry counts inside ready, and in held',
		lots: [
			lotOf('D'),
			lotOf('Open', { scope: { cli: ['src/Open/'] } }),
			lotOf('V', { scope: { cli: ['src/Open/x.ts'] } }),
			lotOf('R'),
			lotOf('W', { dependsOn: ['Open'] }),
			lotOf('Pk', { parked: 'later' }),
			personOf('K0'),
		],
		repositories: {
			cli: {
				registry: [registryOf({ name: 'r1', branch: branchOf('D'), state: 'committed' })],
				worktrees: [openByWorktree('Open')],
			},
		},
		expected: {
			counts: { done: 1, open: 1, ready: 3, held: 1, waiting: 1, parked: 1, unknown: 0 },
		},
	},
	{
		name: 'no open work: the candidate is proposed',
		lots: [lotOf('A')],
		expected: { start: ['A'], held: [] },
	},
	{
		name: 'held by overlap names every pair, with how the open lot is open (manual)',
		lots: [
			lotOf('P0', { scope: { cli: ['src/lib/card/card.constants.ts'] } }),
			lotOf('V', { scope: { cli: ['src/lib/card/'] } }),
		],
		repositories: { cli: { worktrees: [openByWorktree('P0')] } },
		expected: {
			start: [],
			held: [
				{
					id: 'V',
					open: ['P0'],
					met: ['src/lib/card/ meets src/lib/card/card.constants.ts (P0, open, manual)'],
				},
			],
		},
	},
	{
		name: 'a held lot lists every open lot it meets, in block order',
		lots: [
			lotOf('X1', { scope: { cli: ['src/x/'] } }),
			lotOf('X2', { scope: { cli: ['src/y/'] } }),
			lotOf('V', { scope: { cli: ['src/x/', 'src/y/'] } }),
		],
		repositories: { cli: { worktrees: [openByWorktree('X1'), openByWorktree('X2')] } },
		expected: {
			start: [],
			held: [
				{
					id: 'V',
					open: ['X1', 'X2'],
					met: [
						expect.stringContaining(meets({ candidate: 'src/x/', open: 'src/x/', who: 'X1' })),
						expect.stringContaining(meets({ candidate: 'src/y/', open: 'src/y/', who: 'X2' })),
					],
				},
			],
		},
	},
	{
		name: 'string prefix of literal parts: src/data* meets src/dataflow/ (case 8)',
		lots: [
			lotOf('Open', { scope: { cli: ['src/dataflow/'] } }),
			lotOf('V', { scope: { cli: ['src/data*'] } }),
		],
		repositories: { cli: { worktrees: [openByWorktree('Open')] } },
		expected: { start: [], held: [{ id: 'V', open: ['Open'] }] },
	},
	{
		name: 'a case-insensitive volume holds src/Card/ against src/card/ (case 9)',
		lots: [
			lotOf('Open', { scope: { cli: ['src/card/'] } }),
			lotOf('V', { scope: { cli: ['src/Card/'] } }),
		],
		repositories: { cli: { caseInsensitive: true, worktrees: [openByWorktree('Open')] } },
		expected: { start: [], held: [{ id: 'V', open: ['Open'] }] },
	},
	{
		name: 'a case-sensitive volume keeps src/Card/ and src/card/ apart (case 9)',
		lots: [
			lotOf('Open', { scope: { cli: ['src/card/'] } }),
			lotOf('V', { scope: { cli: ['src/Card/'] } }),
		],
		repositories: { cli: { caseInsensitive: false, worktrees: [openByWorktree('Open')] } },
		expected: { start: ['V'], held: [] },
	},
	{
		name: '"." open holds every candidate of its repository and none of another (case 10)',
		lots: [
			lotOf('W', { scope: { cli: ['.'] } }),
			lotOf('A', { scope: { cli: ['src/a/'] } }),
			lotOf('B', { scope: { core: ['src/b/'] } }),
		],
		repositories: { cli: { worktrees: [openByWorktree('W')] }, core: {} },
		expected: { start: ['B'], held: [{ id: 'A', open: ['W'] }] },
	},
	{
		name: '"." in a candidate meets any open lot of its repository (case 33)',
		lots: [
			lotOf('Open', { scope: { cli: ['src/a/'] } }),
			lotOf('Whole', { scope: { cli: ['.'] } }),
		],
		repositories: { cli: { worktrees: [openByWorktree('Open')] } },
		expected: { start: [], held: [{ id: 'Whole', open: ['Open'] }] },
	},
	{
		name: '"." in a candidate is proposed when nothing is open (case 33)',
		lots: [lotOf('Whole', { scope: { cli: ['.'] } })],
		expected: { start: ['Whole'], held: [] },
	},
	{
		name: 'the same paths in another repository do not meet',
		lots: [
			lotOf('Open', { scope: { cli: ['src/a/'] } }),
			lotOf('V', { scope: { core: ['src/a/'] } }),
		],
		repositories: { cli: { worktrees: [openByWorktree('Open')] }, core: {} },
		expected: { start: ['V'], held: [] },
	},
	{
		name: 'an open store lot outside the plan holds by its brief scope, named (case 6)',
		lots: [lotOf('V', { scope: { cli: ['src/adhoc/sub/'] } })],
		repositories: {
			cli: {
				storeLots: [
					storeLotOf({ name: '0007-cli-adhoc', branch: 'feat/adhoc', scope: ['src/adhoc/'] }),
				],
			},
		},
		expected: {
			start: [],
			held: [
				{
					id: 'V',
					open: ['0007-cli-adhoc'],
					met: [expect.stringContaining('src/adhoc/sub/ meets src/adhoc/ (0007-cli-adhoc')],
				},
			],
		},
	},
	{
		name: 'a lot meeting a pending hand-over scope is held (open by record)',
		lots: [
			lotOf('Open', { scope: { cli: ['src/a/'] } }),
			lotOf('V', { scope: { cli: ['src/a/b.ts'] } }),
		],
		repositories: { cli: { registry: [registryOf({ name: 'r1', branch: branchOf('Open') })] } },
		expected: { start: [], held: [{ id: 'V', open: ['Open'] }] },
	},
	{
		name: 'a lot whose dependency is unknown is not proposed (case 11)',
		lots: [
			lotOf('A', { scope: { cli: ['src/a/'] } }),
			lotOf('B', { dependsOn: ['A'], scope: { core: ['src/b/'] } }),
		],
		repositories: { cli: 'moved away', core: {} },
		expected: { start: [], held: [] },
	},
	{
		name: 'a lot waiting on an open entry is not proposed',
		lots: [lotOf('A'), lotOf('B', { dependsOn: ['A'] })],
		repositories: { cli: { worktrees: [openByWorktree('A')] } },
		expected: { start: [], held: [] },
	},
	{
		name: 'a parked entry is never proposed',
		lots: [lotOf('A', { parked: 'later' })],
		expected: { start: [], held: [] },
	},
]

const SHARED_ROWS: ProposeRow[] = [
	{
		name: 'a lot meeting open lots only on shared files is proposed with merge: the open lots',
		lots: [
			lotOf('X', { scope: { cli: ['src/x/'] } }),
			lotOf('Y', { scope: { cli: ['src/y/'] } }),
			lotOf('V', { scope: { cli: ['src/v/'] } }),
		],
		shared: { cli: ['CHANGELOG.md', 'README.md'] },
		repositories: { cli: { worktrees: [openByWorktree('X'), openByWorktree('Y')] } },
		expected: { start: ['V'], held: [], proposals: [{ id: 'V', merge: ['X', 'Y'] }] },
	},
	{
		name: 'shared files declared but no open lot: no merge',
		lots: [lotOf('V')],
		shared: { cli: ['CHANGELOG.md'] },
		expected: { start: ['V'], proposals: [{ id: 'V', merge: [] }] },
	},
	{
		name: 'no shared files declared: no merge, whatever is open',
		lots: [lotOf('X'), lotOf('V')],
		repositories: { cli: { worktrees: [openByWorktree('X')] } },
		expected: { start: ['V'], proposals: [{ id: 'V', merge: [] }] },
	},
	{
		name: 'shared files of another repository never mark a merge',
		lots: [lotOf('X'), lotOf('V')],
		shared: { core: ['CHANGELOG.md'] },
		repositories: { cli: { worktrees: [openByWorktree('X')] }, core: {} },
		expected: { start: ['V'], proposals: [{ id: 'V', merge: [] }] },
	},
	{
		name: 'merge names only the open lots of the candidate repository',
		lots: [
			lotOf('X', { scope: { cli: ['src/x/'] } }),
			lotOf('Z', { scope: { core: ['src/z/'] } }),
			lotOf('V', { scope: { cli: ['src/v/'] } }),
		],
		shared: { cli: ['CHANGELOG.md'], core: ['CHANGELOG.md'] },
		repositories: {
			cli: { worktrees: [openByWorktree('X')] },
			core: { worktrees: [openByWorktree('Z')] },
		},
		expected: { proposals: [{ id: 'V', merge: ['X'] }] },
	},
]

const OVERLAP_BETWEEN_ROWS: ProposeRow[] = [
	{
		name: 'two ready candidates overlapping each other: the later is marked after the first (case 22)',
		lots: [
			lotOf('A', { scope: { cli: ['src/x/'] } }),
			lotOf('B', { scope: { cli: ['src/x/y.ts'] } }),
			lotOf('C', { scope: { cli: ['src/z/'] } }),
		],
		expected: {
			start: ['A', 'B', 'C'],
			held: [],
			proposals: [
				{ id: 'A', after: null },
				{ id: 'B', after: 'A' },
				{ id: 'C', after: null },
			],
		},
	},
	{
		name: 'candidates of different repositories never overlap each other',
		lots: [lotOf('A', { scope: { cli: ['src/x/'] } }), lotOf('B', { scope: { core: ['src/x/'] } })],
		repositories: { cli: {}, core: {} },
		expected: {
			proposals: [
				{ id: 'A', after: null },
				{ id: 'B', after: null },
			],
		},
	},
]

const SPEC_FILE = planFile('spec-a.md')
const OTHER_SPEC = planFile('spec-b.md')

const SPEC_WORK_ROWS: ProposeRow[] = [
	{
		name: 'an entry waiting on a ready dependency that is proposed has its spec listed (D4e)',
		lots: [lotOf('A'), lotOf('B', { dependsOn: ['A'], spec: SPEC_FILE })],
		specs: { [SPEC_FILE]: 'DRAFT' },
		expected: {
			start: ['A'],
			specWork: [{ ids: ['B'], file: SPEC_FILE, status: 'DRAFT' }],
		},
	},
	{
		name: 'an entry waiting on a ready dependency that is held has no spec work (D4e)',
		lots: [
			lotOf('X', { scope: { cli: ['src/x/'] } }),
			lotOf('A', { scope: { cli: ['src/x/a.ts'] } }),
			lotOf('B', { dependsOn: ['A'], spec: SPEC_FILE }),
		],
		repositories: { cli: { worktrees: [openByWorktree('X')] } },
		specs: { [SPEC_FILE]: 'DRAFT' },
		expected: { start: [], held: [{ id: 'A', open: ['X'] }], specWork: [] },
	},
	{
		name: 'an entry waiting on a ready person entry has no spec work (D4e)',
		lots: [personOf('P'), lotOf('B', { dependsOn: ['P'], spec: SPEC_FILE })],
		specs: { [SPEC_FILE]: 'DRAFT' },
		expected: { start: [], specWork: [] },
	},
	{
		name: 'a lot whose spec is DRAFT is spec work only (case 27)',
		lots: [lotOf('A', { spec: SPEC_FILE })],
		specs: { [SPEC_FILE]: 'DRAFT' },
		expected: { start: [], specWork: [{ ids: ['A'], file: SPEC_FILE, status: 'DRAFT' }] },
	},
	{
		name: 'a lot whose spec file is missing is spec work only',
		lots: [lotOf('A', { spec: SPEC_FILE })],
		specs: { [SPEC_FILE]: 'missing' },
		expected: { start: [], specWork: [{ ids: ['A'], file: SPEC_FILE, status: 'missing' }] },
	},
	{
		name: 'a lot whose spec is written is proposed, with no spec work',
		lots: [lotOf('A', { spec: SPEC_FILE })],
		specs: { [SPEC_FILE]: 'written' },
		expected: { start: ['A'], specWork: [] },
	},
	{
		name: 'an entry waiting only on open entries has its spec listed',
		lots: [lotOf('A'), lotOf('B', { dependsOn: ['A'], spec: SPEC_FILE })],
		repositories: { cli: { worktrees: [openByWorktree('A')] } },
		specs: { [SPEC_FILE]: 'DRAFT' },
		expected: { start: [], specWork: [{ ids: ['B'], file: SPEC_FILE, status: 'DRAFT' }] },
	},
	{
		name: 'an entry waiting on a waiting entry has no spec work',
		lots: [
			lotOf('A'),
			lotOf('B', { dependsOn: ['A'], spec: SPEC_FILE }),
			lotOf('C', { dependsOn: ['B'], spec: OTHER_SPEC }),
		],
		repositories: { cli: { worktrees: [openByWorktree('A')] } },
		specs: { [SPEC_FILE]: 'DRAFT', [OTHER_SPEC]: 'DRAFT' },
		expected: { specWork: [{ ids: ['B'], file: SPEC_FILE, status: 'DRAFT' }] },
	},
	{
		name: 'an entry waiting on an unknown entry has no spec work',
		lots: [
			lotOf('A'),
			lotOf('B', { dependsOn: ['A'], spec: SPEC_FILE, scope: { core: ['src/b/'] } }),
		],
		repositories: { cli: 'moved away', core: {} },
		specs: { [SPEC_FILE]: 'DRAFT' },
		expected: { specWork: [] },
	},
	{
		name: 'a ready kind: spec entry is spec work, one line per file listing its ids',
		lots: [
			specEntryOf('S1', SPEC_FILE),
			specEntryOf('S2', SPEC_FILE),
			specEntryOf('S3', OTHER_SPEC),
		],
		specs: { [SPEC_FILE]: 'DRAFT', [OTHER_SPEC]: 'missing' },
		expected: {
			start: [],
			specWork: [
				{ ids: ['S1', 'S2'], file: SPEC_FILE, status: 'DRAFT' },
				{ ids: ['S3'], file: OTHER_SPEC, status: 'missing' },
			],
		},
	},
	{
		name: 'a kind: person entry never proposes spec work',
		lots: [personOf('K0', { spec: SPEC_FILE })],
		specs: { [SPEC_FILE]: 'DRAFT' },
		expected: { start: [], specWork: [] },
	},
	{
		name: 'an entry without a spec field proposes no spec work',
		lots: [lotOf('A'), lotOf('B', { dependsOn: ['A'] })],
		repositories: { cli: { worktrees: [openByWorktree('A')] } },
		expected: { specWork: [] },
	},
	{
		name: 'a parked entry proposes no spec work',
		lots: [lotOf('A', { spec: SPEC_FILE, parked: 'later' })],
		specs: { [SPEC_FILE]: 'DRAFT' },
		expected: { specWork: [] },
	},
	{
		name: 'a spec of a lot that is open is not listed',
		lots: [lotOf('A', { spec: SPEC_FILE })],
		repositories: { cli: { worktrees: [openByWorktree('A')] } },
		specs: { [SPEC_FILE]: 'DRAFT' },
		expected: { specWork: [] },
	},
]

const ORDER_ROWS: ProposeRow[] = [
	{
		name: 'order: more unblocked entries first, then the longest chain, then block order',
		lots: [
			lotOf('Alone'),
			lotOf('Wide', {}),
			lotOf('Deep', {}),
			lotOf('W1', { dependsOn: ['Wide'] }),
			lotOf('W2', { dependsOn: ['Wide'] }),
			lotOf('D1', { dependsOn: ['Deep'] }),
			lotOf('D2', { dependsOn: ['D1'] }),
			lotOf('Single'),
			lotOf('S1', { dependsOn: ['Single'] }),
		],
		expected: {
			start: ['Deep', 'Wide', 'Single', 'Alone'],
			proposals: [
				{ id: 'Deep', unblocks: 2, chain: 2 },
				{ id: 'Wide', unblocks: 2, chain: 1 },
				{ id: 'Single', unblocks: 1, chain: 1 },
				{ id: 'Alone', unblocks: 0, chain: 0 },
			],
		},
	},
	{
		name: 'order: ties keep the block order',
		lots: [lotOf('T3'), lotOf('T1'), lotOf('T2')],
		expected: { start: ['T3', 'T1', 'T2'] },
	},
	{
		name: 'unblocks counts transitive dependents not done, groups expanded',
		lots: [
			lotOf('Root'),
			lotOf('G1', { group: 'G', dependsOn: ['Root'] }),
			lotOf('G2', { group: 'G' }),
			lotOf('After', { dependsOn: ['G'] }),
			lotOf('Done', { dependsOn: ['Root'] }),
		],
		repositories: {
			cli: { registry: [registryOf({ name: 'r1', branch: branchOf('Done'), state: 'committed' })] },
		},
		expected: {
			proposals: [
				{ id: 'Root', unblocks: 2, chain: 2 },
				{ id: 'G2', unblocks: 1, chain: 1 },
			],
		},
	},
]

const FIELD_ROWS: ProposeRow[] = [
	{
		name: 'a proposal is unverified by the unattributed worktree of its repository only (case 25)',
		lots: [lotOf('A'), lotOf('B', { scope: { core: ['src/b/'] } })],
		repositories: {
			cli: { worktrees: [worktreeOf('0030-cli-adhoc', 'feat/adhoc')] },
			core: {},
		},
		expected: {
			proposals: [
				{ id: 'A', unverified: ['0030-cli-adhoc'] },
				{ id: 'B', unverified: [] },
			],
		},
	},
	{
		name: 'an unattributed pending registry entry marks every proposal of its repository unverified',
		lots: [lotOf('A'), lotOf('B')],
		repositories: {
			cli: {
				registry: [
					registryOf({ name: '2026-11-04-feat-handover-show', branch: 'feat/handover-show' }),
				],
			},
		},
		expected: {
			proposals: [
				{ id: 'A', unverified: ['2026-11-04-feat-handover-show'] },
				{ id: 'B', unverified: ['2026-11-04-feat-handover-show'] },
			],
		},
	},
	{
		name: 'attributed work leaves proposals verified',
		lots: [lotOf('A'), lotOf('X')],
		repositories: { cli: { worktrees: [openByWorktree('X')] } },
		expected: { proposals: [{ id: 'A', unverified: [] }] },
	},
	{
		name: 'an open store lot outside the plan has a scope: it holds, it does not unverify',
		lots: [lotOf('A')],
		repositories: {
			cli: {
				storeLots: [
					storeLotOf({ name: '0007-cli-adhoc', branch: 'feat/adhoc', scope: ['src/adhoc/'] }),
				],
			},
		},
		expected: { proposals: [{ id: 'A', unverified: [] }] },
	},
	{
		name: 'next is lot start <brief> when the entry names its brief',
		lots: [lotOf('A', { brief: planFile('briefs/a.md'), spec: SPEC_FILE })],
		specs: { [SPEC_FILE]: 'written' },
		briefs: { [planFile('briefs/a.md')]: true },
		expected: { proposals: [{ id: 'A', next: `dialecte lot start ${planFile('briefs/a.md')}` }] },
	},
	{
		name: 'next is write the brief when the entry names a brief that does not exist',
		lots: [lotOf('A', { brief: planFile('briefs/a.md'), spec: SPEC_FILE })],
		specs: { [SPEC_FILE]: 'written' },
		briefs: { [planFile('briefs/a.md')]: false },
		expected: { proposals: [{ id: 'A', next: `write the brief for A (spec ${SPEC_FILE})` }] },
	},
	{
		name: 'next is write the brief when the entry names none',
		lots: [lotOf('A', { spec: SPEC_FILE })],
		specs: { [SPEC_FILE]: 'written' },
		expected: { proposals: [{ id: 'A', next: `write the brief for A (spec ${SPEC_FILE})` }] },
	},
	{
		name: 'a proposal carries its kind and the heavy steps it declares; stacks is empty without markers',
		lots: [fixOf('A', { heavy: ['mutation'] }), lotOf('B', { heavy: ['browser', 'release'] })],
		expected: {
			proposals: [
				{ id: 'A', kind: 'fix', heavy: ['mutation'], stacks: [] },
				{ id: 'B', kind: 'lot', heavy: ['browser', 'release'], stacks: [] },
			],
		},
	},
]

function proposeRow(row: ProposeRow): void {
	const block = blockOf({
		lots: row.lots,
		shared: row.shared,
		repositories: Object.keys(row.repositories ?? { cli: 0 }),
	})
	const facts = factsOf({ repositories: row.repositories, specs: row.specs, briefs: row.briefs })
	expect(
		summaryOf(
			proposePlan({ block, facts, states: entryStates({ block, facts }), heavy: NO_HEAVY }),
		),
	).toMatchObject(expectedOf(row.expected))
}

describe('proposePlan: held by overlap, readiness', () => {
	it.each(HELD_ROWS)('$name', proposeRow)
})

/** Open work on the branch of an entry that is not open through it still holds (section 2 invariant). */
const HELD_BY_RECORDS_OF_ENTRIES_NOT_OPEN_ROWS: ProposeRow[] = [
	{
		name: 'an open store lot on the branch of a done entry holds its brief scope, the lot named',
		lots: [lotOf('D'), lotOf('V', { scope: { cli: ['src/d-area/x.ts'] } })],
		repositories: {
			cli: {
				registry: [registryOf({ name: 'r1', branch: branchOf('D'), state: 'committed' })],
				storeLots: [
					storeLotOf({
						name: '0003-cli-d',
						branch: branchOf('D'),
						state: 'working',
						scope: ['src/d-area/'],
					}),
				],
			},
		},
		expected: {
			start: [],
			held: [
				{
					id: 'V',
					open: ['0003-cli-d'],
					met: ['src/d-area/x.ts meets src/d-area/ (0003-cli-d, open)'],
				},
			],
		},
	},
	{
		name: 'an open store lot of an unknown entry holds its brief scope in its readable repository',
		lots: [
			lotOf('U', { scope: { cli: ['src/u/'], core: ['src/u/'] } }),
			lotOf('V', { scope: { cli: ['src/u/x.ts'] } }),
		],
		repositories: {
			cli: {
				storeLots: [storeLotOf({ name: '0004-cli-u', branch: branchOf('U'), scope: ['src/u/'] })],
			},
			core: 'core cannot be read',
		},
		expected: {
			start: [],
			held: [
				{ id: 'V', open: ['0004-cli-u'], met: ['src/u/x.ts meets src/u/ (0004-cli-u, open)'] },
			],
		},
	},
	{
		name: 'a manual worktree of an unknown entry holds its scope in its readable repository',
		lots: [
			lotOf('U', { scope: { cli: ['src/u/'], core: ['src/u/'] } }),
			lotOf('V', { scope: { cli: ['src/u/x.ts'] } }),
		],
		repositories: {
			cli: { worktrees: [worktreeOf('0005-cli-u', branchOf('U'))] },
			core: 'core cannot be read',
		},
		expected: {
			start: [],
			held: [
				{ id: 'V', open: ['0005-cli-u'], met: ['src/u/x.ts meets src/u/ (0005-cli-u, open)'] },
			],
		},
	},
	{
		name: 'a pending hand-over of an unknown entry holds its scope in its readable repository',
		lots: [
			lotOf('U', { scope: { cli: ['src/u/'], core: ['src/u/'] } }),
			lotOf('V', { scope: { cli: ['src/u/x.ts'] } }),
		],
		repositories: {
			cli: { registry: [registryOf({ name: '2026-11-10-feat-u', branch: branchOf('U') })] },
			core: 'core cannot be read',
		},
		expected: {
			start: [],
			held: [
				{
					id: 'V',
					open: ['2026-11-10-feat-u'],
					met: ['src/u/x.ts meets src/u/ (2026-11-10-feat-u, open)'],
				},
			],
		},
	},
]

HELD_BY_RECORDS_OF_ENTRIES_NOT_OPEN_ROWS.push({
	name: 'the leftover worktree of an entry done by a committed record holds nothing (section 5 row 5)',
	lots: [lotOf('D'), lotOf('V', { scope: { cli: ['src/D/x.ts'] } })],
	repositories: {
		cli: {
			registry: [registryOf({ name: 'r1', branch: branchOf('D'), state: 'committed' })],
			worktrees: [worktreeOf('0008-cli-d', branchOf('D'))],
		},
	},
	expected: { start: ['V'], held: [] },
})

describe('proposePlan: open work on the branch of an entry not open through it holds', () => {
	it.each(HELD_BY_RECORDS_OF_ENTRIES_NOT_OPEN_ROWS)('$name', proposeRow)
})

describe('proposePlan: shared files never hold, they mark a merge', () => {
	it.each(SHARED_ROWS)('$name', proposeRow)
})

describe('proposePlan: candidates overlapping each other', () => {
	it.each(OVERLAP_BETWEEN_ROWS)('$name', proposeRow)
})

describe('proposePlan: spec work', () => {
	it.each(SPEC_WORK_ROWS)('$name', proposeRow)
})

describe('proposePlan: order', () => {
	it.each(ORDER_ROWS)('$name', proposeRow)
})

describe('proposePlan: unverified, next, heavy, stacks', () => {
	it.each(FIELD_ROWS)('$name', proposeRow)
})

/** The ids each waiting entry waits for, with their states. */
function waitingOf(states: ReturnType<typeof entryStates>): Record<string, unknown> {
	return Object.fromEntries(
		Object.values(byId(states))
			.filter((status) => status.state === 'waiting')
			.map((status) => [status.id, status.waitsFor]),
	)
}

describe('the 2026-11-08 morning proposals', () => {
	const block = MORNING_NOV_08_BLOCK
	const facts = MORNING_NOV_08_FACTS

	it('proposes S1a and T; F is spec work only; nothing held', () => {
		expect(
			summaryOf(
				proposePlan({ block, facts, states: entryStates({ block, facts }), heavy: NO_HEAVY }),
			),
		).toMatchObject({
			start: ['S1a', 'T'],
			held: [],
			specWork: [{ ids: ['F'], file: planFile('33F-FIXTURE-BREAK.md'), status: 'DRAFT' }],
			proposals: [
				{ id: 'S1a', kind: 'lot', after: null, merge: [], unverified: [], stacks: [] },
				{ id: 'T', kind: 'fix', after: null, heavy: ['mutation'], stacks: [] },
			],
		})
	})

	it('K1 is open, A1..WP are done, K2 waits for K1 and S1a', () => {
		expect(waitingOf(entryStates({ block, facts }))).toEqual({
			K2: [
				{ id: 'K1', state: 'open' },
				{ id: 'S1a', state: 'ready' },
			],
		})
	})

	it('K1 is open by its worktree and the finished lots are done', () => {
		expect(byId(entryStates({ block, facts }))).toMatchObject({
			A1: { state: 'done' },
			A1b: { state: 'done' },
			W: { state: 'done' },
			WP: { state: 'done' },
			K1: { state: 'open', note: 'manual, no hand-over yet' },
		})
	})
})

describe('the 2026-11-10 morning proposals', () => {
	const block = MORNING_NOV_10_BLOCK
	const facts = MORNING_NOV_10_FACTS

	it('proposes the fix entry only, merging L0a1 and P0 (the shared files)', () => {
		expect(
			summaryOf(
				proposePlan({ block, facts, states: entryStates({ block, facts }), heavy: NO_HEAVY }),
			),
		).toMatchObject({
			start: ['FIX-lookups-docs'],
			proposals: [
				{
					id: 'FIX-lookups-docs',
					kind: 'fix',
					after: null,
					merge: ['L0a1', 'P0'],
					unverified: [],
					stacks: [],
				},
			],
		})
	})

	it('holds V1, which meets P0 and L0a1, naming the pairs', () => {
		expect(
			summaryOf(
				proposePlan({ block, facts, states: entryStates({ block, facts }), heavy: NO_HEAVY }),
			),
		).toMatchObject({
			held: [
				{
					id: 'V1',
					open: ['L0a1', 'P0'],
					met: [
						'src/lib/handover/ meets src/lib/handover/ (P0, open, manual)',
						'src/lib/handover/ meets src/lib/handover/run-handover-folder.ts (L0a1, open, manual)',
						'src/lib/progress/ meets src/lib/progress/ (P0, open, manual)',
					],
				},
			],
		})
	})

	it('lists spec work for 33K, 33N and 33L1 only (33K0 is DRAFT too: K0 never), in any order', () => {
		expect(
			summaryOf(
				proposePlan({ block, facts, states: entryStates({ block, facts }), heavy: NO_HEAVY }),
			),
		).toMatchObject(
			expectedOf({
				specWork: [
					{ ids: ['K2a'], file: planFile('33K-ANSWER-LADDER.md'), status: 'DRAFT' },
					{ ids: ['N1'], file: planFile('33N-PLAN-NEXT.md'), status: 'DRAFT' },
					{ ids: ['L1a', 'L1c'], file: planFile('33L1-STATUS-RISK.md'), status: 'DRAFT' },
				],
			}),
		)
	})

	it('counts: done 12, open 2, ready 3 (1 held: FIX, V1, K0), waiting 15, parked 1, unknown 0', () => {
		expect(
			proposePlan({ block, facts, states: entryStates({ block, facts }), heavy: NO_HEAVY }).counts,
		).toEqual({ done: 12, open: 2, ready: 3, held: 1, waiting: 15, parked: 1, unknown: 0 })
	})

	it('has L0a1 and P0 open, the rest of the chain waiting for what it waits for', () => {
		expect(waitingOf(entryStates({ block, facts }))).toMatchObject({
			Q1: [
				{ id: 'P0', state: 'open' },
				{ id: 'RG', state: 'waiting' },
			],
			N1: [{ id: 'L0a1', state: 'open' }],
			L1a: [
				{ id: 'L0a1', state: 'open' },
				{ id: 'P0', state: 'open' },
			],
			K2a: [
				{ id: 'P0', state: 'open' },
				{ id: 'FIX-lookups-docs', state: 'ready' },
			],
		})
	})

	it('reads L0a1 and P0 as open (manual), L0-0 as done, F as parked, K0 as ready', () => {
		expect(byId(entryStates({ block, facts }))).toMatchObject({
			'L0-0': { state: 'done' },
			L0a1: { state: 'open', note: 'manual, no hand-over yet' },
			L0a2: { state: 'waiting' },
			P0: { state: 'open', note: 'manual, no hand-over yet' },
			F: { state: 'parked' },
			K0: { state: 'ready' },
			V1: { state: 'ready' },
		})
	})
})

describe('the 2026-11-10 morning proposals without the fix entry', () => {
	const block = MORNING_NOV_10_BLOCK_WITHOUT_FIX
	const facts = MORNING_NOV_10_FACTS

	it('proposes no lot: V1 is held, the spec work stays', () => {
		expect(
			summaryOf(
				proposePlan({ block, facts, states: entryStates({ block, facts }), heavy: NO_HEAVY }),
			),
		).toMatchObject({
			start: [],
			proposals: [],
			held: [{ id: 'V1', open: ['L0a1', 'P0'] }],
			specWork: sortedSpecWork([
				{ ids: ['K2a'], file: planFile('33K-ANSWER-LADDER.md'), status: 'DRAFT' },
				{ ids: ['N1'], file: planFile('33N-PLAN-NEXT.md'), status: 'DRAFT' },
				{ ids: ['L1a', 'L1c'], file: planFile('33L1-STATUS-RISK.md'), status: 'DRAFT' },
			]),
		})
	})

	it('counts: the fix is gone, ready 2 (1 held: V1, K0)', () => {
		expect(
			proposePlan({ block, facts, states: entryStates({ block, facts }), heavy: NO_HEAVY }).counts,
		).toEqual({ done: 12, open: 2, ready: 2, held: 1, waiting: 15, parked: 1, unknown: 0 })
	})

	it('K2a waits for P0 alone', () => {
		expect(waitingOf(entryStates({ block, facts }))).toMatchObject({
			K2a: [{ id: 'P0', state: 'open' }],
		})
	})
})
