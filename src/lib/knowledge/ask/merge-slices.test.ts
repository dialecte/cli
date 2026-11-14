import { mergeSlices } from './merge-slices.ts'

import { describe, expect, it } from 'vitest'

import type { StandardSlice } from '../standard/standard-search.types.ts'
import type { AngleFamily, AngleSlices, AskSlice } from './ask.types.ts'

const FILE = 'example/file-1'

function sliceOf(params: {
	from: number
	score: number
	to?: number
	file?: string
	linked?: boolean
	clause?: string | null
}): StandardSlice {
	return {
		file: params.file ?? FILE,
		from: params.from,
		to: params.to ?? params.from + 1,
		clause: params.clause === undefined ? '1' : params.clause,
		title: 'Example',
		score: params.score,
		terms: ['example'],
		linked: params.linked ?? false,
	}
}

function angleOf(params: {
	id: string
	family: AngleFamily
	slices: StandardSlice[]
}): AngleSlices {
	return {
		angle: { id: params.id, family: params.family, terms: ['example'] },
		slices: params.slices,
	}
}

function mergedOf(params: {
	id: string
	from: number
	score: number
	angles: string[]
	to?: number
	file?: string
	linked?: boolean
	clause?: string | null
}): AskSlice {
	return {
		id: params.id,
		file: params.file ?? FILE,
		from: params.from,
		to: params.to ?? params.from + 1,
		clause: params.clause === undefined ? '1' : params.clause,
		angles: params.angles,
		score: params.score,
		linked: params.linked ?? false,
	}
}

type MergeRow = {
	perAngle: AngleSlices[]
	limit: number
	expected: AskSlice[]
}

describe('mergeSlices: family round-robin in the family order, never sorted by score within a round (D12b, case 10)', () => {
	const rows: Record<string, MergeRow> = {
		'no angle: no slice': { perAngle: [], limit: 10, expected: [] },
		'one family: its slices by score': {
			perAngle: [
				angleOf({
					id: 'a1',
					family: 'subject',
					slices: [sliceOf({ from: 20, score: 4 }), sliceOf({ from: 10, score: 5 })],
				}),
			],
			limit: 10,
			expected: [
				mergedOf({ id: 's1', from: 10, score: 5, angles: ['a1'] }),
				mergedOf({ id: 's2', from: 20, score: 4, angles: ['a1'] }),
			],
		},
		'a strong family does not run ahead of a weak one: a plain score sort would give 10, 20, 30': {
			perAngle: [
				angleOf({
					id: 'a1',
					family: 'subject',
					slices: [sliceOf({ from: 10, score: 9 }), sliceOf({ from: 20, score: 8 })],
				}),
				angleOf({ id: 'a2', family: 'question', slices: [sliceOf({ from: 30, score: 1 })] }),
			],
			limit: 10,
			expected: [
				mergedOf({ id: 's1', from: 10, score: 9, angles: ['a1'] }),
				mergedOf({ id: 's2', from: 30, score: 1, angles: ['a2'] }),
				mergedOf({ id: 's3', from: 20, score: 8, angles: ['a1'] }),
			],
		},
		'a round takes the families in the family order, whatever the order they are given in': {
			perAngle: [
				angleOf({
					id: 'a2',
					family: 'question',
					slices: [sliceOf({ from: 30, score: 6 }), sliceOf({ from: 40, score: 3 })],
				}),
				angleOf({
					id: 'a1',
					family: 'subject',
					slices: [sliceOf({ from: 10, score: 5 }), sliceOf({ from: 20, score: 4 })],
				}),
			],
			limit: 10,
			expected: [
				mergedOf({ id: 's1', from: 10, score: 5, angles: ['a1'] }),
				mergedOf({ id: 's2', from: 30, score: 6, angles: ['a2'] }),
				mergedOf({ id: 's3', from: 20, score: 4, angles: ['a1'] }),
			],
		},
		'two angles of one family (two subjects): one family list ranked by score, not a round per angle':
			{
				perAngle: [
					angleOf({ id: 'a1', family: 'subject', slices: [sliceOf({ from: 10, score: 5 })] }),
					angleOf({
						id: 'a2',
						family: 'subject',
						slices: [sliceOf({ from: 20, score: 7 }), sliceOf({ from: 10, score: 5 })],
					}),
					angleOf({ id: 'a3', family: 'question', slices: [sliceOf({ from: 30, score: 6 })] }),
				],
				limit: 10,
				expected: [
					mergedOf({ id: 's1', from: 20, score: 7, angles: ['a2'] }),
					mergedOf({ id: 's2', from: 30, score: 6, angles: ['a3'] }),
					mergedOf({ id: 's3', from: 10, score: 5, angles: ['a1', 'a2'] }),
				],
			},
		'a slice found by two families: one entry, at its first place, both angle ids': {
			perAngle: [
				angleOf({
					id: 'a1',
					family: 'subject',
					slices: [sliceOf({ from: 10, score: 5 }), sliceOf({ from: 20, score: 4 })],
				}),
				angleOf({
					id: 'a2',
					family: 'question',
					slices: [sliceOf({ from: 10, score: 5 }), sliceOf({ from: 30, score: 3 })],
				}),
			],
			limit: 10,
			expected: [
				mergedOf({ id: 's1', from: 10, score: 5, angles: ['a1', 'a2'] }),
				mergedOf({ id: 's2', from: 20, score: 4, angles: ['a1'] }),
				mergedOf({ id: 's3', from: 30, score: 3, angles: ['a2'] }),
			],
		},
		'the identity of a slice is its file, from and to: the same from with another to is another slice':
			{
				perAngle: [
					angleOf({
						id: 'a1',
						family: 'subject',
						slices: [
							sliceOf({ from: 10, to: 11, score: 5 }),
							sliceOf({ from: 10, to: 12, score: 4 }),
						],
					}),
				],
				limit: 10,
				expected: [
					mergedOf({ id: 's1', from: 10, to: 11, score: 5, angles: ['a1'] }),
					mergedOf({ id: 's2', from: 10, to: 12, score: 4, angles: ['a1'] }),
				],
			},
		'no more than 3 direct slices are added whatever the limit (D27, which replaces the cut at the limit); every linked slice follows, angle by angle, not cut':
			{
				perAngle: [
					angleOf({
						id: 'a1',
						family: 'subject',
						slices: [
							sliceOf({ from: 10, score: 5 }),
							sliceOf({ from: 20, score: 4 }),
							sliceOf({ from: 80, score: 1, linked: true }),
							sliceOf({ from: 81, score: 1, linked: true }),
						],
					}),
					angleOf({
						id: 'a2',
						family: 'question',
						slices: [
							sliceOf({ from: 30, score: 6 }),
							sliceOf({ from: 90, score: 1, linked: true }),
						],
					}),
				],
				limit: 2,
				expected: [
					mergedOf({ id: 's1', from: 10, score: 5, angles: ['a1'] }),
					mergedOf({ id: 's2', from: 30, score: 6, angles: ['a2'] }),
					mergedOf({ id: 's3', from: 20, score: 4, angles: ['a1'] }),
					mergedOf({ id: 's4', from: 80, score: 1, angles: ['a1'], linked: true }),
					mergedOf({ id: 's5', from: 81, score: 1, angles: ['a1'], linked: true }),
					mergedOf({ id: 's6', from: 90, score: 1, angles: ['a2'], linked: true }),
				],
			},
	}

	for (const [name, row] of Object.entries(rows))
		it(`${name}`, () => {
			expect(mergeSlices({ whole: [], perAngle: row.perAngle, limit: row.limit })).toEqual(
				row.expected,
			)
		})
})

/** The slice find returns for the whole question: its own clause, as find gives it. */
function wholeOf(params: {
	from: number
	score: number
	clause: string | null
	to?: number
	file?: string
}): StandardSlice {
	return sliceOf({ ...params, clause: params.clause })
}

/** What a find slice becomes in the merged list: its place, its clause, never linked. */
function keptOf(params: {
	id: string
	from: number
	clause: string | null
	to?: number
	file?: string
}): Partial<AskSlice> {
	return {
		id: params.id,
		file: params.file ?? FILE,
		from: params.from,
		to: params.to ?? params.from + 1,
		clause: params.clause,
		linked: false,
	}
}

type RuleRow = {
	whole: StandardSlice[]
	perAngle: AngleSlices[]
	limit: number
	expected: Partial<AskSlice>[]
}

const WHOLE_LIST = [
	wholeOf({ from: 10, score: 3, clause: 'w1' }),
	wholeOf({ from: 20, score: 5, clause: 'w2' }),
	wholeOf({ from: 30, score: 1, clause: 'w3' }),
]

const FIND_FIRST_ROWS: Record<string, RuleRow> = {
	'find lists three slices, an angle holds a higher-scoring one -> find first in its own order (not by score), then the angle slice':
		{
			whole: WHOLE_LIST,
			perAngle: [
				angleOf({
					id: 'a1',
					family: 'subject',
					slices: [sliceOf({ from: 40, score: 99, clause: 'x1' })],
				}),
			],
			limit: 3,
			expected: [
				keptOf({ id: 's1', from: 10, clause: 'w1' }),
				keptOf({ id: 's2', from: 20, clause: 'w2' }),
				keptOf({ id: 's3', from: 30, clause: 'w3' }),
				{ id: 's4', from: 40, clause: 'x1', angles: ['a1'], linked: false },
			],
		},
	'find lists nothing -> the angle slices alone, at most 3': {
		whole: [],
		perAngle: [
			angleOf({
				id: 'a1',
				family: 'subject',
				slices: [
					sliceOf({ from: 10, score: 5, clause: 'x1' }),
					sliceOf({ from: 20, score: 4, clause: 'x2' }),
				],
			}),
			angleOf({
				id: 'a2',
				family: 'type',
				slices: [
					sliceOf({ from: 30, score: 6, clause: 'x3' }),
					sliceOf({ from: 40, score: 3, clause: 'x4' }),
				],
			}),
			angleOf({
				id: 'a3',
				family: 'documentation',
				slices: [sliceOf({ from: 50, score: 2, clause: 'x5' })],
			}),
			angleOf({
				id: 'a4',
				family: 'question',
				slices: [sliceOf({ from: 60, score: 1, clause: 'x6' })],
			}),
		],
		limit: 10,
		expected: [
			{ id: 's1', from: 10 },
			{ id: 's2', from: 30 },
			{ id: 's3', from: 50 },
		],
	},
	'find lists two slices, four angles hold six more -> find, then 3 additions, 5 in all': {
		whole: WHOLE_LIST.slice(0, 2),
		perAngle: [
			angleOf({
				id: 'a1',
				family: 'subject',
				slices: [
					sliceOf({ from: 40, score: 5, clause: 'x1' }),
					sliceOf({ from: 41, score: 4, clause: 'x2' }),
				],
			}),
			angleOf({
				id: 'a2',
				family: 'type',
				slices: [
					sliceOf({ from: 50, score: 6, clause: 'x3' }),
					sliceOf({ from: 51, score: 3, clause: 'x4' }),
				],
			}),
			angleOf({
				id: 'a3',
				family: 'parents',
				slices: [sliceOf({ from: 60, score: 2, clause: 'x5' })],
			}),
			angleOf({
				id: 'a4',
				family: 'question',
				slices: [sliceOf({ from: 70, score: 1, clause: 'x6' })],
			}),
		],
		limit: 2,
		expected: [
			{ id: 's1', from: 10 },
			{ id: 's2', from: 20 },
			{ id: 's3', from: 40 },
			{ id: 's4', from: 50 },
			{ id: 's5', from: 60 },
		],
	},
}

describe('mergeSlices: find first, then at most 3 angle additions (D27, cases 1 and 2)', () => {
	for (const [name, row] of Object.entries(FIND_FIRST_ROWS))
		it(`${name}`, () => {
			expect(
				mergeSlices({ whole: row.whole, perAngle: row.perAngle, limit: row.limit }),
			).toMatchObject(row.expected)
		})
})

const COVERING_WHOLE = [wholeOf({ from: 10, to: 12, score: 5, clause: '1' })]
const OTHER_FILE = 'example/file-2'

/** One angle slice met against the one find slice: covered, so not added. */
const COVERED_ROWS: Record<string, { angleSlice: StandardSlice }> = {
	'same file, same clause, other lines -> covered, not added': {
		angleSlice: sliceOf({ from: 40, score: 9, clause: '1' }),
	},
	'no clause, its range overlaps a find slice of the same file -> covered, not added': {
		angleSlice: sliceOf({ from: 11, to: 13, score: 9, clause: null }),
	},
	'no clause, its range only touches the find slice (its first line is the find slice last line) -> covered, not added':
		{
			angleSlice: sliceOf({ from: 12, to: 14, score: 9, clause: null }),
		},
}

/** One angle slice met against the one find slice: not covered, so added. */
const UNCOVERED_ROWS: Record<string, { angleSlice: StandardSlice }> = {
	'same file, another clause -> added': {
		angleSlice: sliceOf({ from: 40, score: 9, clause: '2' }),
	},
	'another file, the same clause -> added': {
		angleSlice: sliceOf({ from: 40, score: 9, clause: '1', file: OTHER_FILE }),
	},
	'no clause, no overlap in the same file -> added': {
		angleSlice: sliceOf({ from: 40, to: 41, score: 9, clause: null }),
	},
	'no clause, the same range in another file -> added': {
		angleSlice: sliceOf({ from: 10, to: 12, score: 9, clause: null, file: OTHER_FILE }),
	},
}

describe('mergeSlices: no addition from a clause a find slice covers', () => {
	for (const [name, row] of Object.entries(COVERED_ROWS))
		it(`${name}`, () => {
			const merged = mergeSlices({
				whole: COVERING_WHOLE,
				perAngle: [angleOf({ id: 'a1', family: 'subject', slices: [row.angleSlice] })],
				limit: 10,
			})

			expect(merged.map((slice) => slice.from)).toEqual([COVERING_WHOLE[0].from])
		})

	for (const [name, row] of Object.entries(UNCOVERED_ROWS))
		it(`${name}`, () => {
			const merged = mergeSlices({
				whole: COVERING_WHOLE,
				perAngle: [angleOf({ id: 'a1', family: 'subject', slices: [row.angleSlice] })],
				limit: 10,
			})

			expect(merged.map((slice) => slice.from)).toEqual([
				COVERING_WHOLE[0].from,
				row.angleSlice.from,
			])
		})

	it('a linked slice of find covers its clause too: the angle slice of that clause is not added', () => {
		const merged = mergeSlices({
			whole: [
				sliceOf({ from: 10, score: 5, clause: 'w1' }),
				sliceOf({ from: 80, score: 1, clause: '1', linked: true }),
			],
			perAngle: [
				angleOf({
					id: 'a1',
					family: 'subject',
					slices: [sliceOf({ from: 40, score: 9, clause: '1' })],
				}),
			],
			limit: 10,
		})

		expect(merged.map((slice) => slice.from)).toEqual([10, 80])
	})

	it('a covered slice does not use one of the 3 additions: three others follow it', () => {
		const merged = mergeSlices({
			whole: COVERING_WHOLE,
			perAngle: [
				angleOf({
					id: 'a1',
					family: 'subject',
					slices: [
						sliceOf({ from: 40, score: 9, clause: '1' }),
						sliceOf({ from: 50, score: 8, clause: '2' }),
						sliceOf({ from: 60, score: 7, clause: '3' }),
						sliceOf({ from: 70, score: 6, clause: '4' }),
						sliceOf({ from: 80, score: 5, clause: '5' }),
					],
				}),
			],
			limit: 10,
		})

		expect(merged.map((slice) => slice.from)).toEqual([10, 50, 60, 70])
	})
})

describe('mergeSlices: additions in family round-robin order, a slice met twice gathers its angles; linked slices follow (D27, cases 4 and 5)', () => {
	it('two families meeting one slice -> the additions in D12b order, cut at 3, the shared slice with both angles', () => {
		expect(
			mergeSlices({
				whole: [],
				perAngle: [
					angleOf({
						id: 'a1',
						family: 'subject',
						slices: [
							sliceOf({ from: 10, score: 5, clause: 'x1' }),
							sliceOf({ from: 20, score: 4, clause: 'x2' }),
						],
					}),
					angleOf({
						id: 'a2',
						family: 'question',
						slices: [
							sliceOf({ from: 10, score: 5, clause: 'x1' }),
							sliceOf({ from: 30, score: 3, clause: 'x3' }),
							sliceOf({ from: 40, score: 2, clause: 'x4' }),
						],
					}),
				],
				limit: 10,
			}),
		).toEqual([
			mergedOf({ id: 's1', from: 10, score: 5, clause: 'x1', angles: ['a1', 'a2'] }),
			mergedOf({ id: 's2', from: 20, score: 4, clause: 'x2', angles: ['a1'] }),
			mergedOf({ id: 's3', from: 30, score: 3, clause: 'x3', angles: ['a2'] }),
		])
	})

	it('find slice, additions, then linked slices angle by angle -> find, 3 additions, the linked ones', () => {
		expect(
			mergeSlices({
				whole: [WHOLE_LIST[0]],
				perAngle: [
					angleOf({
						id: 'a1',
						family: 'subject',
						slices: [
							sliceOf({ from: 40, score: 5, clause: 'x1' }),
							sliceOf({ from: 60, score: 4, clause: 'x3' }),
							sliceOf({ from: 80, score: 1, clause: 'l1', linked: true }),
						],
					}),
					angleOf({
						id: 'a2',
						family: 'question',
						slices: [
							sliceOf({ from: 50, score: 3, clause: 'x2' }),
							sliceOf({ from: 70, score: 2, clause: 'x4' }),
							sliceOf({ from: 90, score: 1, clause: 'l2', linked: true }),
						],
					}),
				],
				limit: 10,
			}),
		).toMatchObject([
			{ id: 's1', from: 10 },
			{ id: 's2', from: 40, angles: ['a1'], linked: false },
			{ id: 's3', from: 50, angles: ['a2'], linked: false },
			{ id: 's4', from: 60, angles: ['a1'], linked: false },
			{ id: 's5', from: 80, angles: ['a1'], linked: true },
			{ id: 's6', from: 90, angles: ['a2'], linked: true },
		])
	})
})

describe('mergeSlices: find list whole, its linked slices before the additions, angle ids on find slices (D27b)', () => {
	it('a linked slice of find stays with find, before the additions', () => {
		expect(
			mergeSlices({
				whole: [
					sliceOf({ from: 10, score: 5, clause: 'w1' }),
					sliceOf({ from: 80, score: 1, clause: 'l1', linked: true }),
				],
				perAngle: [
					angleOf({
						id: 'a1',
						family: 'subject',
						slices: [sliceOf({ from: 40, score: 9, clause: 'x1' })],
					}),
				],
				limit: 10,
			}),
		).toMatchObject([
			{ id: 's1', from: 10, linked: false },
			{ id: 's2', from: 80, linked: true },
			{ id: 's3', from: 40, angles: ['a1'], linked: false },
		])
	})

	it('a find slice an angle also met carries that angle, one no angle met carries none', () => {
		expect(
			mergeSlices({
				whole: [
					sliceOf({ from: 10, score: 5, clause: 'w1' }),
					sliceOf({ from: 20, score: 4, clause: 'w2' }),
				],
				perAngle: [
					angleOf({
						id: 'a1',
						family: 'subject',
						slices: [sliceOf({ from: 10, score: 9, clause: 'w1' })],
					}),
				],
				limit: 10,
			}),
		).toMatchObject([
			{ id: 's1', from: 10, angles: ['a1'] },
			{ id: 's2', from: 20, angles: [] },
		])
	})

	it('an angle linked slice find already lists is listed once', () => {
		expect(
			mergeSlices({
				whole: [
					sliceOf({ from: 10, score: 5, clause: 'w1' }),
					sliceOf({ from: 80, score: 1, clause: 'l1', linked: true }),
				],
				perAngle: [
					angleOf({
						id: 'a1',
						family: 'subject',
						slices: [sliceOf({ from: 80, score: 1, clause: 'l1', linked: true })],
					}),
				],
				limit: 10,
			}).map((slice) => slice.from),
		).toEqual([10, 80])
	})
})
