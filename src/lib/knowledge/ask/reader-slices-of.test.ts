import {
	ALL_SLICES_BUDGET,
	FOUR_SLICES_BUDGET,
	SLICE_COUNTED,
} from '../../../../test/ask-pack-fixtures.constants.ts'
import { poolSliceOf, readersOf } from '../../../../test/ask-pack-fixtures.ts'
import { readerSlicesOf } from './reader-slices-of.ts'

import { describe, expect, it } from 'vitest'

import type {
	PoolSlice,
	PreviousRound,
	ReaderLetter,
	ReaderPack,
	ReaderSlicesOfParams,
} from './ask.types.ts'

/** Six slices in rank order, two of each of three families (parents, children, tables), forty counted lines each. */
const SIX: PoolSlice[] = [
	poolSliceOf({ id: 's1', family: 'parents' }),
	poolSliceOf({ id: 's2', family: 'parents' }),
	poolSliceOf({ id: 's3', family: 'children' }),
	poolSliceOf({ id: 's4', family: 'children' }),
	poolSliceOf({ id: 's5', family: 'tables' }),
	poolSliceOf({ id: 's6', family: 'tables' }),
]

/** The parameters of the next round of the pool: medium, the four-slice budget, nothing closed, unless said. */
function paramsOf(params: Partial<ReaderSlicesOfParams>): ReaderSlicesOfParams {
	return { pool: SIX, effort: 'medium', budget: FOUR_SLICES_BUDGET, previous: [], ...params }
}

/** The round of a pack and its readers as the cases compare them. */
function summaryOf(pack: ReaderPack): { round: number | null; readers: unknown } {
	return { round: 'round' in pack ? pack.round : null, readers: readersOf(pack) }
}

/** The ids of the slices of one reader of a pack (none when the pack was skipped or the reader is absent). */
function readerIdsOf(params: { pack: ReaderPack; letter: ReaderLetter }): string[] {
	const { pack } = params
	if ('skipped' in pack) return []
	const reader = pack.readers.find((candidate) => candidate.letter === params.letter)
	return reader === undefined ? [] : reader.slices.map((slice) => slice.id)
}

describe('readerSlicesOf: who reads what in the first round (section 8)', () => {
	it('medium -> A by rank and B by family round-robin, each to the budget (the orders differ)', () => {
		expect(readersOf(readerSlicesOf(paramsOf({})))).toEqual([
			{ letter: 'A', ids: ['s1', 's2', 's3', 's4'], counted: FOUR_SLICES_BUDGET },
			{ letter: 'B', ids: ['s1', 's3', 's5', 's2'], counted: FOUR_SLICES_BUDGET },
		])
	})

	it('low -> A and B as at medium', () => {
		expect(readersOf(readerSlicesOf(paramsOf({ effort: 'low' })))).toMatchObject([
			{ letter: 'A' },
			{ letter: 'B' },
		])
	})

	it('high -> C as B without the top-ranked slice', () => {
		expect(readersOf(readerSlicesOf(paramsOf({ effort: 'high' })))).toEqual([
			{ letter: 'A', ids: ['s1', 's2', 's3', 's4'], counted: FOUR_SLICES_BUDGET },
			{ letter: 'B', ids: ['s1', 's3', 's5', 's2'], counted: FOUR_SLICES_BUDGET },
			{ letter: 'C', ids: ['s2', 's3', 's5', 's4'], counted: FOUR_SLICES_BUDGET },
		])
	})

	it('a pool within the budget -> every reader gets it whole, B in the family order', () => {
		expect(readersOf(readerSlicesOf(paramsOf({ budget: ALL_SLICES_BUDGET })))).toEqual([
			{ letter: 'A', ids: ['s1', 's2', 's3', 's4', 's5', 's6'], counted: 6 * SLICE_COUNTED },
			{ letter: 'B', ids: ['s1', 's3', 's5', 's2', 's4', 's6'], counted: 6 * SLICE_COUNTED },
		])
	})

	it('a tables slice ranked first -> A has it first, B takes the families in their listed order', () => {
		const pool = [
			poolSliceOf({ id: 't1', family: 'tables' }),
			poolSliceOf({ id: 'p1', family: 'parents' }),
			poolSliceOf({ id: 'c1', family: 'children' }),
		]

		expect(readersOf(readerSlicesOf(paramsOf({ pool, budget: ALL_SLICES_BUDGET })))).toEqual([
			{ letter: 'A', ids: ['t1', 'p1', 'c1'], counted: 3 * SLICE_COUNTED },
			{ letter: 'B', ids: ['p1', 'c1', 't1'], counted: 3 * SLICE_COUNTED },
		])
	})

	it('the question family comes last in the round-robin, after the families of the angles', () => {
		const pool = [
			poolSliceOf({ id: 'q1', family: 'question' }),
			poolSliceOf({ id: 'p1', family: 'parents' }),
		]

		expect(readersOf(readerSlicesOf(paramsOf({ pool, budget: ALL_SLICES_BUDGET })))).toMatchObject([
			{ letter: 'A', ids: ['q1', 'p1'] },
			{ letter: 'B', ids: ['p1', 'q1'] },
		])
	})

	it('the counted lines of a reader are the sum of those of its slices', () => {
		const pool = [
			poolSliceOf({ id: 's1', family: 'parents', counted: 10 }),
			poolSliceOf({ id: 's2', family: 'children', counted: 25 }),
		]

		expect(readersOf(readerSlicesOf(paramsOf({ pool, budget: ALL_SLICES_BUDGET })))).toMatchObject([
			{ letter: 'A', counted: 35 },
			{ letter: 'B', counted: 35 },
		])
	})

	it('the round is 1', () => {
		expect(readerSlicesOf(paramsOf({ budget: ALL_SLICES_BUDGET }))).toMatchObject({ round: 1 })
	})
})

/** Round 1 as the next round reads it: A and B both had `given`; the verified cites came from `verifiedAngles`. */
function roundOneOf(params: { given: string[]; verifiedAngles: string[] }): PreviousRound {
	return {
		round: 1,
		given: [
			{ letter: 'A', slices: params.given },
			{ letter: 'B', slices: params.given },
		],
		verifiedAngles: params.verifiedAngles,
	}
}

const ANGLED: PoolSlice[] = [
	poolSliceOf({ id: 's1', family: 'parents', angles: ['a1'] }),
	poolSliceOf({ id: 's2', family: 'children', angles: ['a2'] }),
	poolSliceOf({ id: 's3', family: 'tables', angles: ['a3'] }),
	poolSliceOf({ id: 's4', family: 'tables', angles: ['a4'] }),
]

describe('readerSlicesOf: the second round gives what no reader of the letter had, from angles not yet verified (case 30)', () => {
	it('slices the letter had are not given again; the round is 2', () => {
		expect(
			summaryOf(
				readerSlicesOf(
					paramsOf({
						pool: ANGLED,
						budget: ALL_SLICES_BUDGET,
						previous: [roundOneOf({ given: ['s1'], verifiedAngles: [] })],
					}),
				),
			),
		).toEqual({
			round: 2,
			readers: [
				{ letter: 'A', ids: ['s2', 's3', 's4'], counted: 3 * SLICE_COUNTED },
				{ letter: 'B', ids: ['s2', 's3', 's4'], counted: 3 * SLICE_COUNTED },
			],
		})
	})

	it('a slice found only by an angle a verified cite came from is not given', () => {
		expect(
			readersOf(
				readerSlicesOf(
					paramsOf({
						pool: ANGLED,
						budget: ALL_SLICES_BUDGET,
						previous: [roundOneOf({ given: ['s1'], verifiedAngles: ['a3'] })],
					}),
				),
			),
		).toMatchObject([
			{ letter: 'A', ids: ['s2', 's4'] },
			{ letter: 'B', ids: ['s2', 's4'] },
		])
	})

	it('a slice the other letter had may be given: the rule is per letter', () => {
		expect(
			readersOf(
				readerSlicesOf(
					paramsOf({
						pool: ANGLED.slice(0, 2),
						budget: ALL_SLICES_BUDGET,
						previous: [
							{
								round: 1,
								given: [
									{ letter: 'A', slices: ['s1'] },
									{ letter: 'B', slices: ['s2'] },
								],
								verifiedAngles: [],
							},
						],
					}),
				),
			),
		).toMatchObject([
			{ letter: 'A', ids: ['s2'] },
			{ letter: 'B', ids: ['s1'] },
		])
	})

	it('a tighter budget in the second round: each letter takes first what it has not had, A by rank and B by family', () => {
		expect(
			readersOf(
				readerSlicesOf(
					paramsOf({
						pool: SIX,
						budget: 2 * SLICE_COUNTED,
						previous: [roundOneOf({ given: ['s1', 's2'], verifiedAngles: [] })],
					}),
				),
			),
		).toMatchObject([
			{ letter: 'A', ids: ['s3', 's4'] },
			{ letter: 'B', ids: ['s3', 's5'] },
		])
	})

	it('two closed rounds -> the round is 3 and no slice of either is given again', () => {
		expect(
			summaryOf(
				readerSlicesOf(
					paramsOf({
						pool: ANGLED,
						budget: ALL_SLICES_BUDGET,
						previous: [
							roundOneOf({ given: ['s1'], verifiedAngles: [] }),
							{
								round: 2,
								given: [
									{ letter: 'A', slices: ['s2'] },
									{ letter: 'B', slices: ['s2'] },
								],
								verifiedAngles: [],
							},
						],
					}),
				),
			),
		).toMatchObject({
			round: 3,
			readers: [
				{ letter: 'A', ids: ['s3', 's4'] },
				{ letter: 'B', ids: ['s3', 's4'] },
			],
		})
	})

	it('a slice found by two angles with only one verified is still given', () => {
		const pool = [
			poolSliceOf({ id: 's0', family: 'parents', angles: ['a0'] }),
			poolSliceOf({ id: 'p1', family: 'parents', angles: ['a1', 'a3'] }),
		]

		expect(
			readersOf(
				readerSlicesOf(
					paramsOf({
						pool,
						budget: ALL_SLICES_BUDGET,
						previous: [roundOneOf({ given: ['s0'], verifiedAngles: ['a3'] })],
					}),
				),
			),
		).toMatchObject([
			{ letter: 'A', ids: ['p1'] },
			{ letter: 'B', ids: ['p1'] },
		])
	})

	it('a question-family slice the letter has not had is still given', () => {
		const pool = [
			poolSliceOf({ id: 's0', family: 'parents', angles: ['a0'] }),
			poolSliceOf({ id: 'q1', family: 'question' }),
		]

		expect(
			readersOf(
				readerSlicesOf(
					paramsOf({
						pool,
						budget: ALL_SLICES_BUDGET,
						previous: [roundOneOf({ given: ['s0'], verifiedAngles: ['a0'] })],
					}),
				),
			),
		).toMatchObject([
			{ letter: 'A', ids: ['q1'] },
			{ letter: 'B', ids: ['q1'] },
		])
	})

	it('a slice larger than the budget left is skipped and the filling goes on with the next', () => {
		const pool = [
			poolSliceOf({ id: 's1', family: 'parents', counted: 40 }),
			poolSliceOf({ id: 's2', family: 'children', counted: 100 }),
			poolSliceOf({ id: 's3', family: 'tables', counted: 40 }),
		]

		expect(readersOf(readerSlicesOf(paramsOf({ pool, budget: 100 })))).toEqual([
			{ letter: 'A', ids: ['s1', 's3'], counted: 80 },
			{ letter: 'B', ids: ['s1', 's3'], counted: 80 },
		])
	})

	it('high: reader C is given again no slice it had, nor the top-ranked slice', () => {
		expect(
			readerIdsOf({
				pack: readerSlicesOf(
					paramsOf({
						pool: ANGLED,
						effort: 'high',
						budget: ALL_SLICES_BUDGET,
						previous: [
							{
								round: 1,
								given: [
									{ letter: 'A', slices: ['s1'] },
									{ letter: 'B', slices: ['s1'] },
									{ letter: 'C', slices: ['s2'] },
								],
								verifiedAngles: [],
							},
						],
					}),
				),
				letter: 'C',
			}),
		).toEqual(['s3', 's4'])
	})

	it('nothing new for any letter -> skipped, with the reason named', () => {
		expect(
			readerSlicesOf(
				paramsOf({
					pool: ANGLED.slice(0, 2),
					budget: ALL_SLICES_BUDGET,
					previous: [roundOneOf({ given: ['s1', 's2'], verifiedAngles: [] })],
				}),
			),
		).toEqual({ skipped: true, reason: expect.stringMatching(/\S/u) })
	})

	it('every slice left comes from a verified angle -> skipped', () => {
		expect(
			readerSlicesOf(
				paramsOf({
					pool: ANGLED.slice(0, 2),
					budget: ALL_SLICES_BUDGET,
					previous: [roundOneOf({ given: ['s1'], verifiedAngles: ['a2'] })],
				}),
			),
		).toMatchObject({ skipped: true })
	})
})

describe('readerSlicesOf: a round needs at least two readers with new slices, agreement needing two (D34)', () => {
	it('only reader A has a new slice -> skipped, never a round of one reader', () => {
		expect(
			readerSlicesOf(
				paramsOf({
					pool: ANGLED.slice(0, 2),
					budget: ALL_SLICES_BUDGET,
					previous: [
						{
							round: 1,
							given: [
								{ letter: 'A', slices: ['s1'] },
								{ letter: 'B', slices: ['s1', 's2'] },
							],
							verifiedAngles: [],
						},
					],
				}),
			),
		).toEqual({ skipped: true, reason: expect.stringMatching(/\S/u) })
	})

	it('high: only reader C has a new slice -> skipped', () => {
		expect(
			readerSlicesOf(
				paramsOf({
					pool: ANGLED.slice(0, 2),
					effort: 'high',
					budget: ALL_SLICES_BUDGET,
					previous: [
						{
							round: 1,
							given: [
								{ letter: 'A', slices: ['s1', 's2'] },
								{ letter: 'B', slices: ['s1', 's2'] },
								{ letter: 'C', slices: [] },
							],
							verifiedAngles: [],
						},
					],
				}),
			),
		).toMatchObject({ skipped: true })
	})

	it('high: two of the three readers have new slices -> a round of those two', () => {
		expect(
			readersOf(
				readerSlicesOf(
					paramsOf({
						pool: ANGLED.slice(0, 3),
						effort: 'high',
						budget: ALL_SLICES_BUDGET,
						previous: [
							{
								round: 1,
								given: [
									{ letter: 'A', slices: ['s1', 's2', 's3'] },
									{ letter: 'B', slices: ['s1'] },
									{ letter: 'C', slices: ['s2'] },
								],
								verifiedAngles: [],
							},
						],
					}),
				),
			),
		).toMatchObject([
			{ letter: 'B', ids: ['s2', 's3'] },
			{ letter: 'C', ids: ['s3'] },
		])
	})
})
