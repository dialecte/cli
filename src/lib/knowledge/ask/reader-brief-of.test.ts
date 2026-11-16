import {
	BRIEF_FILE,
	BRIEF_GOOD_LINES,
	BRIEF_NONCE_A,
	BRIEF_POOR_LINES,
	BRIEF_QUESTION,
	OUTSIDE_NAME,
	POOL_ANGLES,
} from '../../../../test/ask-pack-fixtures.constants.ts'
import { poolSliceOf } from '../../../../test/ask-pack-fixtures.ts'
import { readerBriefOf } from './reader-brief-of.ts'

import { describe, expect, it } from 'vitest'

import type { OutsideBrief, PoolSlice, RangeText, ReaderBriefOfParams } from './ask.types.ts'

const GOOD = poolSliceOf({ id: 's1', family: 'parents', from: 12, to: 13, angles: ['a1'] })
const POOR = poolSliceOf({
	id: 's2',
	family: 'tables',
	from: 40,
	to: 41,
	angles: ['a3'],
	quality: 'poor',
})

/** The lines each slice of the cases holds. */
function rangeTextOf(params: { slice: PoolSlice }): RangeText {
	const lines = params.slice.id === GOOD.id ? BRIEF_GOOD_LINES : BRIEF_POOR_LINES
	return { lines, counted: lines.length }
}

/** The parameters of the brief of reader A of the cases: both slices, round 1, the documents route unless said. */
function paramsOf(params: {
	outside?: OutsideBrief | null
	slices?: PoolSlice[]
}): ReaderBriefOfParams {
	const slices = params.slices ?? [GOOD, POOR]
	return {
		ask: 'A-0007',
		question: BRIEF_QUESTION,
		subject: { tags: ['AA_1'], attributes: [], terms: [] },
		angles: POOL_ANGLES,
		reader: { letter: 'A', slices, counted: slices.length * 40 },
		nonce: BRIEF_NONCE_A,
		round: 1,
		rangeText: rangeTextOf,
		outside: params.outside ?? null,
	}
}

/** The lines of a markdown holding every one of `parts`. */
function linesHolding(params: { markdown: string; parts: string[] }): string[] {
	return params.markdown
		.split('\n')
		.filter((line) => params.parts.every((part) => line.includes(part)))
}

/** Whether the markdown holds each word, in the order given. */
function holdsEach(params: { markdown: string; words: string[] }): boolean[] {
	return params.words.map((word) => params.markdown.includes(word))
}

describe('readerBriefOf: a documents brief holds what the reader needs', () => {
	it('the markdown holds the question, the nonce and the id and family of every angle', () => {
		expect(
			holdsEach({
				markdown: readerBriefOf(paramsOf({})).markdown,
				words: [
					BRIEF_QUESTION,
					BRIEF_NONCE_A,
					...POOL_ANGLES.flatMap((angle) => [angle.id, angle.family]),
				],
			}),
		).toEqual(Array.from({ length: 2 + 2 * POOL_ANGLES.length }, () => true))
	})

	it('each line of a slice is in the markdown with its original line number on the same line', () => {
		const lines = [...BRIEF_GOOD_LINES, ...BRIEF_POOR_LINES]

		expect(
			lines.map(
				(line) =>
					linesHolding({
						markdown: readerBriefOf(paramsOf({})).markdown,
						parts: [String(line.from), line.text],
					}).length,
			),
		).toEqual([1, 1, 1, 1])
	})

	it('each slice is headed by its file and its lines', () => {
		expect([
			linesHolding({
				markdown: readerBriefOf(paramsOf({})).markdown,
				parts: [BRIEF_FILE, '12', '13'],
			}).length,
			linesHolding({
				markdown: readerBriefOf(paramsOf({})).markdown,
				parts: [BRIEF_FILE, '40', '41'],
			}).length,
		]).toEqual([1, 1])
	})

	it('the markdown carries the rules and the report schema: not-in-text, notFound, familiesRead, nonce, verdict', () => {
		expect(
			holdsEach({
				markdown: readerBriefOf(paramsOf({})).markdown,
				words: ['not-in-text', 'notFound', 'familiesRead', 'nonce', '"verdict"'],
			}),
		).toEqual([true, true, true, true, true])
	})

	it('a documents brief never offers not-known (a document reader answers not-in-text)', () => {
		expect(readerBriefOf(paramsOf({})).markdown).not.toContain('not-known')
	})

	it('the json holds the ask, the round, the letter, the nonce, the question and no outside route', () => {
		expect(readerBriefOf(paramsOf({})).json).toMatchObject({
			ask: 'A-0007',
			round: 1,
			reader: 'A',
			nonce: BRIEF_NONCE_A,
			question: BRIEF_QUESTION,
			outside: null,
		})
	})
})

describe('readerBriefOf: a poor slice is given and flagged (case 28)', () => {
	it('the json names the file, the lines and the quality of each slice', () => {
		expect(readerBriefOf(paramsOf({})).json).toMatchObject({
			slices: [
				{ id: 's1', file: BRIEF_FILE, from: 12, to: 13, quality: 'good' },
				{ id: 's2', file: BRIEF_FILE, from: 40, to: 41, quality: 'poor' },
			],
		})
	})

	it('the markdown flags the heading of the poor slice and not that of the good one', () => {
		expect([
			linesHolding({
				markdown: readerBriefOf(paramsOf({})).markdown,
				parts: [BRIEF_FILE, '40'],
			}).map((line) => /poor/iu.test(line)),
			linesHolding({
				markdown: readerBriefOf(paramsOf({})).markdown,
				parts: [BRIEF_FILE, '12'],
			}).map((line) => /poor/iu.test(line)),
		]).toEqual([[true], [false]])
	})
})

describe('readerBriefOf: an outside brief gives no slice (Q16)', () => {
	const outside = { name: OUTSIDE_NAME, web: false }

	it('the markdown names the standard, allows not-known and asks for the source', () => {
		expect(
			holdsEach({
				markdown: readerBriefOf(paramsOf({ outside, slices: [] })).markdown,
				words: [OUTSIDE_NAME, 'not-known', 'source'],
			}),
		).toEqual([true, true, true])
	})

	it('built from a reader that holds slices, the brief still shows none of their text and the json lists none', () => {
		expect({
			text: holdsEach({
				markdown: readerBriefOf(paramsOf({ outside })).markdown,
				words: [...BRIEF_GOOD_LINES, ...BRIEF_POOR_LINES].map((line) => line.text),
			}),
			json: readerBriefOf(paramsOf({ outside })).json,
		}).toMatchObject({ text: [false, false, false, false], json: { slices: [] } })
	})

	it('the json holds the public name and the web flag', () => {
		expect(readerBriefOf(paramsOf({ outside, slices: [] })).json).toMatchObject({
			reader: 'A',
			outside: { name: OUTSIDE_NAME, web: false },
			slices: [],
		})
	})

	it('--web in the pack -> the json says so and the markdown offers the web source', () => {
		const webOutside = { name: OUTSIDE_NAME, web: true }

		expect({
			json: readerBriefOf(paramsOf({ outside: webOutside, slices: [] })).json,
			offers: readerBriefOf(paramsOf({ outside: webOutside, slices: [] })).markdown.includes(
				'"web"',
			),
		}).toMatchObject({
			json: { outside: { name: OUTSIDE_NAME, web: true } },
			offers: true,
		})
	})

	it('without --web the markdown offers no web source', () => {
		expect(readerBriefOf(paramsOf({ outside, slices: [] })).markdown).not.toContain('"web"')
	})

	it('the nonce and the question are in an outside brief too', () => {
		expect(
			holdsEach({
				markdown: readerBriefOf(paramsOf({ outside, slices: [] })).markdown,
				words: [BRIEF_NONCE_A, BRIEF_QUESTION],
			}),
		).toEqual([true, true])
	})
})
