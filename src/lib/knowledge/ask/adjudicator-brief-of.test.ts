import {
	ANSWER_LONG,
	LINES_APART,
	LINES_FIRST,
	LINES_SHARING,
} from '../../../../test/ask-agreement-fixtures.constants.ts'
import { documentAcceptedOf } from '../../../../test/ask-agreement-fixtures.ts'
import {
	QUOTE_D_POSITIVE,
	RANGE_LINE_D_POSITIVE,
	REPORT_FILE,
	REPORT_OTHER_FILE,
	REPORT_QUESTION,
	SUBJECT_TAG_D,
} from '../../../../test/ask-report-fixtures.constants.ts'
import { citeOf, proseLineOf } from '../../../../test/ask-report-fixtures.ts'
import { adjudicatorBriefOf } from './adjudicator-brief-of.ts'

import { describe, expect, it } from 'vitest'

import type { AdjudicatorBriefOfParams, RangeText } from './ask.types.ts'

/** The lines of any cited range of the case: one prose line holding the baseline words, at the range's first line. */
function rangeTextOfCase(params: { file: string; from: number; to: number }): RangeText {
	return { lines: [proseLineOf({ text: RANGE_LINE_D_POSITIVE, from: params.from })], counted: 1 }
}

/** The adjudicator's brief of a case: ask A-0007, round 2, two readers that did not agree, its own nonce. */
function briefParamsOf(changes: Partial<AdjudicatorBriefOfParams> = {}): AdjudicatorBriefOfParams {
	return {
		ask: 'A-0007',
		question: REPORT_QUESTION,
		subject: SUBJECT_TAG_D,
		round: 2,
		nonce: 'nonce-adjudicator',
		reports: [
			documentAcceptedOf({ letter: 'A', verdict: 'yes', answer: ANSWER_LONG, lines: LINES_FIRST }),
			documentAcceptedOf({ letter: 'B', verdict: 'no', lines: LINES_SHARING }),
		],
		rangeText: rangeTextOfCase,
		...changes,
	}
}

/** The files and lines of the ranges a brief holds, in file then line order. */
function rangesOf(brief: { json: unknown }): { file: string; from: number; to: number }[] {
	const { ranges } = brief.json as { ranges: { file: string; from: number; to: number }[] }
	return ranges
		.map(({ file, from, to }) => ({ file, from, to }))
		.sort((left, right) => left.file.localeCompare(right.file) || left.from - right.from)
}

describe('adjudicatorBriefOf: what the adjudicator is given (section 8)', () => {
	it('the json holds the ask, the round, its nonce and the question', () => {
		expect(adjudicatorBriefOf(briefParamsOf()).json).toMatchObject({
			schema: 1,
			ask: 'A-0007',
			round: 2,
			reader: 'adjudicator',
			nonce: 'nonce-adjudicator',
			question: REPORT_QUESTION,
		})
	})

	it('one entry per accepted report: its letter, verdict and answer, and each claim with its text, verdict, cites and check results', () => {
		const cite = citeOf({ quote: QUOTE_D_POSITIVE, from: LINES_FIRST.from, to: LINES_FIRST.to })

		expect(adjudicatorBriefOf(briefParamsOf()).json).toMatchObject({
			reports: [
				{
					letter: 'A',
					verdict: 'yes',
					answer: ANSWER_LONG,
					claims: [
						{
							text: 'D shall hold DD_1',
							supports: 'yes',
							cites: [cite],
							verified: true,
							refused: null,
							polarityConflict: false,
						},
					],
				},
				{ letter: 'B', verdict: 'no', claims: [{ verified: true, refused: null }] },
			],
		})
	})

	it('the union of the cited ranges: overlapping ranges of one file merged into one', () => {
		expect(rangesOf(adjudicatorBriefOf(briefParamsOf()))).toEqual([
			{ file: REPORT_FILE, from: LINES_FIRST.from, to: LINES_SHARING.to },
		])
	})

	it('only overlapping ranges merge: a far range of the same file and a range of another file stay apart', () => {
		const reports = [
			...briefParamsOf().reports,
			documentAcceptedOf({ letter: 'C', lines: LINES_APART }),
			documentAcceptedOf({ letter: 'D', file: REPORT_OTHER_FILE, lines: LINES_FIRST }),
		]

		expect(rangesOf(adjudicatorBriefOf(briefParamsOf({ reports })))).toEqual([
			{ file: REPORT_FILE, from: LINES_FIRST.from, to: LINES_SHARING.to },
			{ file: REPORT_FILE, from: LINES_APART.from, to: LINES_APART.to },
			{ file: REPORT_OTHER_FILE, from: LINES_FIRST.from, to: LINES_FIRST.to },
		])
	})

	it('each range holds its lines as the reader function gives them', () => {
		expect(adjudicatorBriefOf(briefParamsOf()).json).toMatchObject({
			ranges: [{ lines: [{ from: LINES_FIRST.from, text: RANGE_LINE_D_POSITIVE }] }],
		})
	})

	it('the markdown holds the text of a cited line, so the adjudicator reads what was cited', () => {
		expect(adjudicatorBriefOf(briefParamsOf()).markdown).toEqual(
			expect.stringContaining(RANGE_LINE_D_POSITIVE),
		)
	})

	it('the markdown holds its nonce', () => {
		expect(adjudicatorBriefOf(briefParamsOf()).markdown).toEqual(
			expect.stringContaining('nonce-adjudicator'),
		)
	})

	it('the markdown holds the answer of the first report', () => {
		expect(adjudicatorBriefOf(briefParamsOf()).markdown).toEqual(
			expect.stringContaining(ANSWER_LONG),
		)
	})
})
