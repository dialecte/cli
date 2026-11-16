import { POOL_ANGLES } from '../../../../test/ask-pack-fixtures.constants.ts'
import { askSliceOf, countedByIdOf, qualityByIdOf } from '../../../../test/ask-pack-fixtures.ts'
import { packPoolOf } from './pack-pool-of.ts'

import { describe, expect, it } from 'vitest'

import type { PackPoolOfParams } from './ask.types.ts'

const LISTED = [
	askSliceOf({ id: 's1', angles: ['a2'] }),
	askSliceOf({ id: 's2', angles: ['a1', 'a3'] }),
]
const WIDER = [
	askSliceOf({ id: 's2', angles: ['a1', 'a3'] }),
	askSliceOf({ id: 's3', angles: ['a3'] }),
	askSliceOf({ id: 's4', angles: [] }),
	askSliceOf({ id: 's5', angles: ['a1'] }),
]

/** The parameters of the cases above, with the readings given and nothing else changed. */
function paramsOf(params: Partial<PackPoolOfParams>): PackPoolOfParams {
	return {
		listed: LISTED,
		wider: WIDER,
		angles: POOL_ANGLES,
		countedOf: countedByIdOf({}),
		qualityOf: qualityByIdOf({}),
		...params,
	}
}

describe('packPoolOf: the ask list first, then the wider search (D3)', () => {
	it('a wider slice the list already holds is kept once, in the list place; the others follow in angle-family order (parents, tables, question)', () => {
		expect(packPoolOf(paramsOf({})).map((slice) => slice.id)).toEqual([
			's1',
			's2',
			's5',
			's3',
			's4',
		])
	})

	it('inside one family the wider slices follow by score, the higher first', () => {
		expect(
			packPoolOf(
				paramsOf({
					listed: [],
					wider: [
						askSliceOf({ id: 's6', angles: ['a1'], score: 5 }),
						askSliceOf({ id: 's7', angles: ['a1'], score: 9 }),
					],
				}),
			).map((slice) => slice.id),
		).toEqual(['s7', 's6'])
	})

	it('inside one family and one score the wider slices follow by file id, then first line', () => {
		expect(
			packPoolOf(
				paramsOf({
					listed: [],
					wider: [
						askSliceOf({ id: 's8', angles: ['a1'], file: 'example-0000/zeta', from: 1, to: 5 }),
						askSliceOf({ id: 's9', angles: ['a1'], file: 'example-0000/alpha', from: 30, to: 35 }),
						askSliceOf({ id: 's10', angles: ['a1'], file: 'example-0000/alpha', from: 2, to: 6 }),
					],
				}),
			).map((slice) => slice.id),
		).toEqual(['s10', 's9', 's8'])
	})

	it('no wider slice -> the ask list as it was', () => {
		expect(packPoolOf(paramsOf({ wider: [] })).map((slice) => slice.id)).toEqual(['s1', 's2'])
	})
})

describe('packPoolOf: the family of a slice is that of its first angle, none: question (D4)', () => {
	it('slices found by angles of three families and by none', () => {
		expect(packPoolOf(paramsOf({})).map((slice) => [slice.id, slice.family])).toEqual([
			['s1', 'children'],
			['s2', 'parents'],
			['s5', 'parents'],
			['s3', 'tables'],
			['s4', 'question'],
		])
	})
})

describe('packPoolOf: the readings (D5)', () => {
	it('each slice holds the counted lines the reading gives', () => {
		expect(
			packPoolOf(paramsOf({ countedOf: countedByIdOf({ s1: 12, s3: 7 }) })).map(
				(slice) => slice.counted,
			),
		).toEqual([12, 40, 40, 7, 40])
	})

	it('a slice of a poor block is kept and flagged poor', () => {
		expect(
			packPoolOf(paramsOf({ qualityOf: qualityByIdOf({ s3: 'poor' }) })).map(
				(slice) => slice.quality,
			),
		).toEqual(['good', 'good', 'good', 'poor', 'good'])
	})

	it('a slice of an unreadable block is in the pool no more', () => {
		expect(
			packPoolOf(
				paramsOf({ qualityOf: qualityByIdOf({ s1: 'unreadable', s4: 'unreadable' }) }),
			).map((slice) => slice.id),
		).toEqual(['s2', 's5', 's3'])
	})

	it('the slice keeps its own members: file, lines, angles, score', () => {
		expect(packPoolOf(paramsOf({ wider: [] }))[1]).toMatchObject({
			id: 's2',
			file: 'example-0000/tag',
			from: 1,
			to: 10,
			angles: ['a1', 'a3'],
			score: 1,
		})
	})
})
