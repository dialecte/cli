import { GENERIC_NOUNS } from '../host/host.constants.ts'
/**
 * `planLotPrune`: pure (design 3.2, tests 7-19). Hand-written facts, one case at a time: every item of every lot
 * decided before anything moves, the first keep reason winning, an item two lots reach decided once.
 */
import { planLotPrune } from './plan-lot-prune.ts'

import { describe, expect, it } from 'vitest'

import type { LandedFact } from '../landing/landed-record.types.ts'
import type { SettledLot } from '../landing/lot-landing.types.ts'
import type {
	BranchFacts,
	BranchHolders,
	LotFacts,
	LotPruneFacts,
	RepositoryFacts,
} from './lot-prune-facts.types.ts'
import type { ItemDecision, LotPlan, LotPrunePlan } from './plan-lot-prune.types.ts'

const MAIN = '/ws/repo'
const LOT = '0001-repo-x'
const WORKTREE = '/ws/.worktrees/0001-repo-x'
const THROWAWAY = '/ws/.worktrees/0001-repo-x-round-1'
const BRANCH = 'feat/x'
/** An open lot holding the branch, as its keep reason reads: `lot <name> <state>`. */
const OPEN_LOT_REASON = ['lot', '0002-repo-y', 'working'].join(' ')
const ROUND_BRANCH = 'feat/x-round-1'
const TIP = 'a'.repeat(40)
const DROPPED = 'b'.repeat(40)

const FACT: LandedFact = {
	schema: 1,
	how: 'ancestor',
	tip: TIP,
	base: 'main',
	at: '2026-11-18T10:00:00.000Z',
}

const LANDED: SettledLot = { landed: FACT }

/** No branch held by anything else, no worktree checking out a branch. */
function holdersOf(overrides: Partial<BranchHolders> = {}): BranchHolders {
	return {
		openLots: new Map(),
		stackParents: new Map(),
		damagedStacks: [],
		stashes: new Set(),
		pendingHandovers: new Map(),
		checkedOut: new Map([[BRANCH, WORKTREE]]),
		...overrides,
	}
}

/** The lot's own branch, nothing lost, nothing since its landing. */
function branchOf(overrides: Partial<BranchFacts> = {}): BranchFacts {
	return { branch: BRANCH, tip: TIP, own: true, lost: [], sinceLanding: [], ...overrides }
}

/** A committed, landed lot with a clean worktree its close lets go, and its own branch. */
function lotOf(overrides: Partial<LotFacts> = {}): LotFacts {
	return {
		lot: LOT,
		lotFolder: `/ws/repo/.git/dialecte-lots/${LOT}`,
		state: 'committed',
		simulated: false,
		settled: LANDED,
		worktree: { path: WORKTREE, closes: true },
		worktreeGone: false,
		throwaways: [],
		branches: [branchOf()],
		...overrides,
	}
}

function factsOf(params: {
	lots: LotFacts[]
	holders?: BranchHolders
	repository?: Partial<RepositoryFacts>
}): LotPruneFacts {
	return {
		repositories: [
			{
				main: MAIN,
				baseBranch: 'main',
				mainBranch: 'main',
				nouns: GENERIC_NOUNS,
				processes: 'known',
				holders: params.holders ?? holdersOf(),
				lots: params.lots,
				...params.repository,
			},
		],
	}
}

/** The decisions of the plan's only repository, by lot then `<item> <name>`. */
function decisionsOf(plan: LotPrunePlan): Record<string, Record<string, ItemDecision>> {
	const [repository] = plan.repositories
	return Object.fromEntries(
		repository.lots.map((lot: LotPlan) => [
			lot.lot,
			Object.fromEntries(lot.items.map((item) => [`${item.item} ${item.name}`, item.decision])),
		]),
	)
}

/** The lots of the plan's only repository. */
function lotsOf(plan: LotPrunePlan): LotPlan[] {
	return plan.repositories[0]?.lots ?? []
}

const GO = { go: true } as const

describe('planLotPrune: the lot’s state', () => {
	it('a committed landed lot, its worktree let go, no throwaway → the worktree goes, the branch after it', () => {
		expect(decisionsOf(planLotPrune(factsOf({ lots: [lotOf()] })))).toEqual({
			[LOT]: { [`worktree ${WORKTREE}`]: GO, [`branch ${BRANCH}`]: { after: WORKTREE } },
		})
	})

	for (const state of ['working', 'input-required', 'ready', 'failed'] as const)
		it(`a lot ${state} → every item kept, naming the lot and its state`, () => {
			const why = 'not landed: its work is not in main'
			const facts = factsOf({
				lots: [
					lotOf({
						state,
						settled: state === 'failed' ? { open: 'failed', why } : { open: state, why },
						throwaways: [
							{ path: THROWAWAY, branch: ROUND_BRANCH, handMade: false, decision: { goes: true } },
						],
						branches: [branchOf(), branchOf({ branch: ROUND_BRANCH, own: false })],
					}),
				],
			})

			expect(decisionsOf(planLotPrune(facts))).toEqual({
				[LOT]: {
					[`worktree ${WORKTREE}`]: { kept: `lot ${LOT} ${state}` },
					[`throwaway ${THROWAWAY}`]: { kept: `lot ${LOT} ${state}` },
					[`branch ${BRANCH}`]: { kept: `lot ${LOT} ${state}` },
					[`branch ${ROUND_BRANCH}`]: { kept: `lot ${LOT} ${state}` },
				},
			})
		})

	it('a simulated lot → listed, never decided: no item', () => {
		expect(
			lotsOf(planLotPrune(factsOf({ lots: [lotOf({ simulated: true })] }))).map((lot) => ({
				lot: lot.lot,
				simulated: lot.simulated,
				items: lot.items,
			})),
		).toEqual([{ lot: LOT, simulated: true, items: [] }])
	})

	it('a canceled lot whose branch loses nothing → the worktree goes, the branch after it', () => {
		expect(
			decisionsOf(
				planLotPrune(
					factsOf({ lots: [lotOf({ state: 'canceled', settled: { canceled: true } })] }),
				),
			),
		).toEqual({
			[LOT]: { [`worktree ${WORKTREE}`]: GO, [`branch ${BRANCH}`]: { after: WORKTREE } },
		})
	})

	it('a canceled lot whose branch deletion would lose a dropped commit → the branch kept, the commit named with the person’s command', () => {
		const facts = factsOf({
			lots: [
				lotOf({
					state: 'canceled',
					settled: { canceled: true },
					branches: [branchOf({ lost: [{ commit: DROPPED, why: 'dropped' }] })],
				}),
			],
		})

		expect(decisionsOf(planLotPrune(facts))[LOT][`branch ${BRANCH}`]).toEqual({
			kept: `1 commit(s) its removal would lose: ${DROPPED.slice(0, 12)}; to delete it anyway: cd ${MAIN} && git branch -D ${BRANCH}`,
		})
	})

	it('a committed lot not landed → its branch kept with why; its worktree still decided by its close', () => {
		const facts = factsOf({
			lots: [lotOf({ settled: { notLanded: 'not landed: its work is not in main' } })],
		})

		expect(decisionsOf(planLotPrune(facts))).toEqual({
			[LOT]: {
				[`worktree ${WORKTREE}`]: GO,
				[`branch ${BRANCH}`]: { kept: 'not landed: its work is not in main' },
			},
		})
	})

	it('a landed lot whose branch holds work since its landing → the branch kept, the commits named', () => {
		const facts = factsOf({ lots: [lotOf({ branches: [branchOf({ sinceLanding: [DROPPED] })] })] })

		expect(decisionsOf(planLotPrune(facts))[LOT][`branch ${BRANCH}`]).toEqual({
			kept: `1 commit(s) made since its landing: ${DROPPED.slice(0, 12)}`,
		})
	})
})

const HELD: {
	title: string
	holders: Partial<BranchHolders>
	repository?: Partial<RepositoryFacts>
	kept: string
}[] = [
	{
		title: 'an open lot stacked on this lot',
		holders: { stackParents: new Map([[BRANCH, '0002-repo-y (working)']]) },
		kept: 'the stack parent of 0002-repo-y (working)',
	},
	{
		title: 'an open lot whose stack.json is damaged',
		holders: { damagedStacks: ['0002-repo-y'] },
		kept: 'a damaged stack.json in 0002-repo-y: its parent is not known',
	},
	{
		title: 'the base branch',
		repository: { baseBranch: BRANCH },
		holders: {},
		kept: 'the base branch',
	},
	{
		title: 'the main checkout’s branch',
		repository: { mainBranch: BRANCH },
		holders: {},
		kept: 'the branch the main checkout is on',
	},
	{
		title: 'an open lot’s own branch',
		holders: { openLots: new Map([[BRANCH, OPEN_LOT_REASON]]) },
		kept: OPEN_LOT_REASON,
	},
	{
		title: 'a stash made on it',
		holders: { stashes: new Set([BRANCH]) },
		kept: 'a stash was made on it',
	},
	{
		title: 'a pending hand-over on it',
		holders: { pendingHandovers: new Map([[BRANCH, '2026-11-18-feat-x']]) },
		kept: 'a hand-over is pending on it: 2026-11-18-feat-x',
	},
]

describe('planLotPrune: a branch something else holds', () => {
	for (const held of HELD)
		it(`${held.title} → the branch kept, the holder named; the worktree still goes`, () => {
			const facts = factsOf({
				lots: [lotOf()],
				holders: holdersOf(held.holders),
				repository: held.repository,
			})

			expect(decisionsOf(planLotPrune(facts))).toEqual({
				[LOT]: { [`worktree ${WORKTREE}`]: GO, [`branch ${BRANCH}`]: { kept: held.kept } },
			})
		})

	it('a branch checked out in a worktree that is not going in this run → kept, the worktree named', () => {
		const facts = factsOf({
			lots: [lotOf({ worktree: { path: WORKTREE, kept: 'dirty: 1 path(s)' } })],
		})

		expect(decisionsOf(planLotPrune(facts))).toEqual({
			[LOT]: {
				[`worktree ${WORKTREE}`]: { kept: 'dirty: 1 path(s)' },
				[`branch ${BRANCH}`]: { kept: `checked out in ${WORKTREE}` },
			},
		})
	})
})

describe('planLotPrune: the run', () => {
	it('the processes not known → every worktree and throwaway kept with why', () => {
		const facts = factsOf({
			repository: { processes: 'the processes cannot be listed: lsof failed' },
			lots: [
				lotOf({
					throwaways: [
						{ path: THROWAWAY, branch: ROUND_BRANCH, handMade: false, decision: { goes: true } },
					],
				}),
			],
		})

		expect(decisionsOf(planLotPrune(facts))).toEqual({
			[LOT]: {
				[`worktree ${WORKTREE}`]: { kept: 'the processes cannot be listed: lsof failed' },
				[`throwaway ${THROWAWAY}`]: { kept: 'the processes cannot be listed: lsof failed' },
				[`branch ${BRANCH}`]: { kept: `checked out in ${WORKTREE}` },
			},
		})
	})

	it('two ids naming the same lot → the lot listed once, each item decided once', () => {
		expect(
			lotsOf(planLotPrune(factsOf({ lots: [lotOf(), lotOf()] }))).map((lot) => lot.items.length),
		).toEqual([2])
	})

	it('a recorded throwaway no longer registered → not matched, listed kept with why', () => {
		const facts = factsOf({
			lots: [
				lotOf({
					throwaways: [
						{
							path: THROWAWAY,
							branch: undefined,
							handMade: false,
							decision: { notMatched: 'not a registered worktree' },
						},
					],
				}),
			],
		})

		expect(decisionsOf(planLotPrune(facts))[LOT][`throwaway ${THROWAWAY}`]).toEqual({
			kept: 'not matched: not a registered worktree',
		})
	})

	it('a throwaway whose proof keeps it → kept with the proof’s reason; its branch kept checked out in it', () => {
		const facts = factsOf({
			holders: holdersOf({
				checkedOut: new Map([
					[BRANCH, WORKTREE],
					[ROUND_BRANCH, THROWAWAY],
				]),
			}),
			lots: [
				lotOf({
					throwaways: [
						{
							path: THROWAWAY,
							branch: ROUND_BRANCH,
							handMade: false,
							decision: { goes: false, kept: 'round-1 differs: 1 path(s), first: src/x.ts' },
						},
					],
					branches: [branchOf(), branchOf({ branch: ROUND_BRANCH, own: false })],
				}),
			],
		})

		expect(decisionsOf(planLotPrune(facts))[LOT]).toEqual({
			[`worktree ${WORKTREE}`]: GO,
			[`throwaway ${THROWAWAY}`]: { kept: 'round-1 differs: 1 path(s), first: src/x.ts' },
			[`branch ${BRANCH}`]: { after: WORKTREE },
			[`branch ${ROUND_BRANCH}`]: { kept: `checked out in ${THROWAWAY}` },
		})
	})

	it('a worktree deleted by hand (gone), its throwaway branch holding nothing → no worktree item, the branch goes', () => {
		const facts = factsOf({
			holders: holdersOf({ checkedOut: new Map() }),
			lots: [
				lotOf({
					worktree: undefined,
					worktreeGone: true,
					branches: [branchOf({ branch: ROUND_BRANCH, own: false })],
				}),
			],
		})

		expect(decisionsOf(planLotPrune(facts))).toEqual({ [LOT]: { [`branch ${ROUND_BRANCH}`]: GO } })
	})

	it('a lot whose worktree is gone, its landing not provable → listed stale with the lot stop command, its branch kept', () => {
		const facts = factsOf({
			holders: holdersOf({ checkedOut: new Map() }),
			lots: [
				lotOf({
					state: 'working',
					settled: { open: 'working', why: 'its landing cannot be read: no branch feat/x' },
					worktree: undefined,
					worktreeGone: true,
					branches: [],
				}),
			],
		})
		expect(lotsOf(planLotPrune(facts)).map((lot) => lot.stale)).toEqual([
			`stale: worktree gone, still working: its landing cannot be read: no branch feat/x; if its work is abandoned: dialecte lot stop ${LOT}`,
		])
	})
})

/** The text a kept lot's items are kept with (`keptByDecision`). */
const KEPT = 'kept by decision: performance audit, rerun later (by person, 2026-11-20)'

/** A throwaway its proof lets go, on the round branch. */
const GOING_THROWAWAY = {
	path: THROWAWAY,
	branch: ROUND_BRANCH,
	handMade: false,
	decision: { goes: true },
} as const

describe('planLotPrune: a lot kept on purpose (KEEP 3.5.2)', () => {
	it('a committed landed lot, kept, a throwaway its proof lets go → every item kept with the kept text', () => {
		const facts = factsOf({
			lots: [
				lotOf({
					kept: KEPT,
					throwaways: [GOING_THROWAWAY],
					branches: [branchOf(), branchOf({ branch: ROUND_BRANCH, own: false })],
				}),
			],
		})

		expect(decisionsOf(planLotPrune(facts))).toEqual({
			[LOT]: {
				[`worktree ${WORKTREE}`]: { kept: KEPT },
				[`throwaway ${THROWAWAY}`]: { kept: KEPT },
				[`branch ${BRANCH}`]: { kept: KEPT },
				[`branch ${ROUND_BRANCH}`]: { kept: KEPT },
			},
		})
	})

	it('a canceled lot, kept, whose branch deletion would lose a commit → the branch kept with the kept text, never the delete-anyway line', () => {
		const facts = factsOf({
			lots: [
				lotOf({
					state: 'canceled',
					settled: { canceled: true },
					kept: KEPT,
					branches: [branchOf({ lost: [{ commit: DROPPED, why: 'dropped' }] })],
				}),
			],
		})

		expect(decisionsOf(planLotPrune(facts))).toEqual({
			[LOT]: { [`worktree ${WORKTREE}`]: { kept: KEPT }, [`branch ${BRANCH}`]: { kept: KEPT } },
		})
	})

	it('a damaged lot, kept → every item kept with the kept text, before its damage', () => {
		const facts = factsOf({
			lots: [
				lotOf({
					state: 'damaged',
					damage: 'a transition holds a time the store does not write',
					kept: KEPT,
					throwaways: [GOING_THROWAWAY],
					branches: [branchOf(), branchOf({ branch: ROUND_BRANCH, own: false })],
				}),
			],
		})

		expect(decisionsOf(planLotPrune(facts))).toEqual({
			[LOT]: {
				[`worktree ${WORKTREE}`]: { kept: KEPT },
				[`throwaway ${THROWAWAY}`]: { kept: KEPT },
				[`branch ${BRANCH}`]: { kept: KEPT },
				[`branch ${ROUND_BRANCH}`]: { kept: KEPT },
			},
		})
	})

	it('a working lot, kept → every item kept with the kept text, before its open state', () => {
		const facts = factsOf({
			lots: [
				lotOf({
					state: 'working',
					settled: { open: 'working', why: 'not landed: its work is not in main' },
					kept: KEPT,
				}),
			],
		})

		expect(decisionsOf(planLotPrune(facts))).toEqual({
			[LOT]: { [`worktree ${WORKTREE}`]: { kept: KEPT }, [`branch ${BRANCH}`]: { kept: KEPT } },
		})
	})

	it('a kept lot, the processes not known → kept with the kept text, before the processes', () => {
		const facts = factsOf({
			lots: [lotOf({ kept: KEPT })],
			repository: { processes: 'the processes could not be listed' },
		})

		expect(decisionsOf(planLotPrune(facts))).toEqual({
			[LOT]: { [`worktree ${WORKTREE}`]: { kept: KEPT }, [`branch ${BRANCH}`]: { kept: KEPT } },
		})
	})

	it('a kept committed lot whose worktree is gone, its landing not proven → still listed stale, its branch kept with the kept text', () => {
		const facts = factsOf({
			holders: holdersOf({ checkedOut: new Map() }),
			lots: [
				lotOf({
					settled: { notLanded: 'not landed: its work is not in main' },
					kept: KEPT,
					worktree: undefined,
					worktreeGone: true,
				}),
			],
		})

		expect(
			lotsOf(planLotPrune(facts)).map((lot) => ({
				stale: lot.stale,
				items: lot.items.map((item) => ({ name: item.name, decision: item.decision })),
			})),
		).toEqual([
			{
				stale: expect.stringContaining('stale: worktree gone'),
				items: [{ name: BRANCH, decision: { kept: KEPT } }],
			},
		])
	})
})
