import { join } from 'node:path'

import {
	FREE_TEXT_QUESTION,
	NOT_IN_TEXT_QUESTION,
	POLARITY_QUESTION,
	POLARITY_QUESTION_SPACED,
	UNKNOWN_QUESTION,
} from '../../test/standard-gold-fixtures.constants.ts'
import {
	answeredOutcomeOf,
	nextRoundOutcome,
	writeRecordedAsks,
} from '../../test/standard-gold-fixtures.ts'
import { SAMPLE_WORD } from '../../test/standard-workspace.constants.ts'
import {
	answeredWith,
	createStandardWorkspace,
	filesUnder,
	sampleStandardText,
	sampleValueSentence,
	trimmedLinesOf,
	writeTextFile,
} from '../../test/standard-workspace.ts'
import { STANDARD_DISK_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { runStandard } from './standard.ts'

import { describe, expect, it } from 'vitest'

import type { JudgedRow, RecordedAsk } from '../../test/standard-gold-fixtures.types.ts'
import type { StandardEvalJson } from '../../test/standard-workspace.types.ts'
import type { StandardGoldItem } from '../lib/knowledge/standard/standard-search.types.ts'

const FOUND_QUOTE = sampleValueSentence(SAMPLE_WORD).toLowerCase()
const FOUND_EXPECTED = [{ file: 'alpha/one', quote: FOUND_QUOTE }]

/** An item with quotes the sample standard holds: the gold file always has one, so `eval` has something to score. */
const FOUND_ITEM: StandardGoldItem = { question: SAMPLE_WORD, expected: FOUND_EXPECTED }

const NOT_IN_TEXT_ITEM: StandardGoldItem = {
	question: NOT_IN_TEXT_QUESTION,
	kind: 'not-in-text',
	answer: 'the standard does not say',
	status: 'checked',
	expected: [],
}
const POLARITY_ITEM: StandardGoldItem = {
	question: POLARITY_QUESTION,
	kind: 'polarity',
	answer: 'no, it may not',
	status: 'checked',
	expected: FOUND_EXPECTED,
}
const FREE_TEXT_ITEM: StandardGoldItem = {
	question: FREE_TEXT_QUESTION,
	kind: 'fact',
	answer: 'It depends on the clause that applies',
	status: 'checked',
	expected: FOUND_EXPECTED,
}

/** Whole items: only the `answer` and the `kind` of a row differ from the polarity item. */
const ANSWER_ITEM: StandardGoldItem = {
	question: POLARITY_QUESTION,
	kind: 'fact',
	answer: 'AA_1 holds AAA_1',
	status: 'checked',
	expected: FOUND_EXPECTED,
}
const YES_ITEM: StandardGoldItem = {
	question: POLARITY_QUESTION,
	kind: 'polarity',
	answer: 'yes, it may',
	status: 'checked',
	expected: FOUND_EXPECTED,
}
const CAPITAL_NO_ITEM: StandardGoldItem = {
	question: POLARITY_QUESTION,
	kind: 'polarity',
	answer: 'No. It may not.',
	status: 'checked',
	expected: FOUND_EXPECTED,
}
const NONE_ITEM: StandardGoldItem = {
	question: POLARITY_QUESTION,
	kind: 'exception',
	answer: 'None of the parts may hold it',
	status: 'checked',
	expected: FOUND_EXPECTED,
}
const VALUE_ITEM: StandardGoldItem = {
	question: POLARITY_QUESTION,
	kind: 'fact',
	answer: 'AA_1 holds AAA_1.',
	status: 'checked',
	expected: FOUND_EXPECTED,
}
const SPACED_VALUE_ITEM: StandardGoldItem = {
	question: POLARITY_QUESTION,
	kind: 'fact',
	answer: 'AA_1   holds   AAA_1.',
	status: 'checked',
	expected: FOUND_EXPECTED,
}
/** An older item: no kind, no answer, no quote. */
const OLD_ITEM: StandardGoldItem = { question: POLARITY_QUESTION, expected: [] }

const JUDGED_ROWS: Record<string, JudgedRow> = {
	'a not-in-text item the readers agreed is "yes" → agreed-wrong': {
		item: NOT_IN_TEXT_ITEM,
		agreed: { verdict: 'yes' },
		counts: { agreed: 0, wrong: 1, unjudged: 0 },
	},
	'a not-in-text item the readers agreed is "not-in-text" → agreed, not wrong': {
		item: NOT_IN_TEXT_ITEM,
		agreed: { verdict: 'not-in-text' },
		counts: { agreed: 1, wrong: 0, unjudged: 0 },
	},
	'an item with an answer the readers agreed is "not-in-text" → agreed-wrong': {
		item: ANSWER_ITEM,
		agreed: { verdict: 'not-in-text' },
		counts: { agreed: 0, wrong: 1, unjudged: 0 },
	},
	'a gold answer starting "no" and the readers agreeing "no" → agreed, not wrong': {
		item: POLARITY_ITEM,
		agreed: { verdict: 'no' },
		counts: { agreed: 1, wrong: 0, unjudged: 0 },
	},
	'a gold answer starting "no" and the readers agreeing "yes" → agreed-wrong': {
		item: POLARITY_ITEM,
		agreed: { verdict: 'yes' },
		counts: { agreed: 0, wrong: 1, unjudged: 0 },
	},
	'a gold answer starting "yes" and the readers agreeing "no" → agreed-wrong': {
		item: YES_ITEM,
		agreed: { verdict: 'no' },
		counts: { agreed: 0, wrong: 1, unjudged: 0 },
	},
	'a gold answer starting "No." with a capital and the readers agreeing "yes" → agreed-wrong': {
		item: CAPITAL_NO_ITEM,
		agreed: { verdict: 'yes' },
		counts: { agreed: 0, wrong: 1, unjudged: 0 },
	},
	'a gold answer starting "None of the parts" and the readers agreeing "yes" → unjudged: "none" is not "no"':
		{
			item: NONE_ITEM,
			agreed: { verdict: 'yes' },
			counts: { agreed: 0, wrong: 0, unjudged: 1 },
		},
	'a gold answer starting "no" and the readers agreeing "depends" → unjudged': {
		item: POLARITY_ITEM,
		agreed: { verdict: 'depends' },
		counts: { agreed: 0, wrong: 0, unjudged: 1 },
	},
	'an older item with no kind and no quote, the readers agreeing "yes" → unjudged, never a not-in-text rule':
		{
			item: OLD_ITEM,
			agreed: { verdict: 'yes' },
			counts: { agreed: 0, wrong: 0, unjudged: 1 },
		},
	'a values verdict whose value the gold answer holds → agreed, not wrong': {
		item: VALUE_ITEM,
		agreed: { verdict: 'value', value: 'AAA_1' },
		counts: { agreed: 1, wrong: 0, unjudged: 0 },
	},
	'a values verdict whose value the gold answer holds in other case and spacing → agreed, not wrong':
		{
			item: SPACED_VALUE_ITEM,
			agreed: { verdict: 'value', value: 'aaa_1' },
			counts: { agreed: 1, wrong: 0, unjudged: 0 },
		},
	'a values verdict whose value the gold answer does not hold → agreed-wrong': {
		item: VALUE_ITEM,
		agreed: { verdict: 'value', value: 'AAA_9' },
		counts: { agreed: 0, wrong: 1, unjudged: 0 },
	},
	'a free-text gold answer with no rule that decides it → unjudged, counted apart': {
		item: FREE_TEXT_ITEM,
		agreed: { verdict: 'depends' },
		counts: { agreed: 0, wrong: 0, unjudged: 1 },
	},
}

const THREE_ASKS: RecordedAsk[] = [
	{
		ask: 'A-0001',
		question: NOT_IN_TEXT_QUESTION,
		rounds: [{ round: 1, outcome: answeredOutcomeOf({ verdict: 'yes' }) }],
	},
	{
		// written with a doubled space: it matches its gold item once the question is normalised
		ask: 'A-0002',
		question: POLARITY_QUESTION_SPACED,
		rounds: [{ round: 1, outcome: answeredOutcomeOf({ verdict: 'no' }) }],
	},
	{
		ask: 'A-0003',
		question: FREE_TEXT_QUESTION,
		rounds: [{ round: 1, outcome: answeredOutcomeOf({ verdict: 'depends' }) }],
	},
]

/** A workspace, its gold file of `items` and its asks folder holding `asks`: `standard eval <gold> --reports`. */
async function evaluatedWithReports(params: {
	items: StandardGoldItem[]
	asks: RecordedAsk[]
	extra?: string[]
	/** Run from the folder above the package: no package.json holds the folder the command runs in. */
	outsidePackage?: boolean
}) {
	const workspace = createStandardWorkspace({
		standards: { alpha: { 'one.md': sampleStandardText({ word: SAMPLE_WORD }) } },
	})
	const gold = join(workspace.base, 'gold.jsonl')
	writeTextFile({
		path: gold,
		text: `${params.items.map((item) => JSON.stringify(item)).join('\n')}\n`,
	})
	const asksFolder = join(workspace.base, 'asks')
	writeRecordedAsks({ asksFolder, asks: params.asks })
	const answer = await answeredWith({
		run: runStandard({
			argv: ['eval', gold, '--reports', asksFolder, ...(params.extra ?? ['--json'])],
			cwd: params.outsidePackage === true ? workspace.base : workspace.cwd,
			environment: workspace.environment,
		}),
		exitCode: 0,
	})
	return { answer, asksFolder, workspace }
}

describe('standard eval --reports: the agreed-wrong rate of the recorded asks', () => {
	it(
		'three recorded asks, one agreed-wrong, one agreed, one unjudged → --json reports 1, 1, 1 and the rate 0.5',
		async () => {
			const { answer } = await evaluatedWithReports({
				items: [FOUND_ITEM, NOT_IN_TEXT_ITEM, POLARITY_ITEM, FREE_TEXT_ITEM],
				asks: THREE_ASKS,
			})

			expect((JSON.parse(answer.output) as StandardEvalJson).reports).toEqual({
				agreed: 1,
				wrong: 1,
				unjudged: 1,
				rate: 0.5,
			})
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'the same run as text → one reports line with the counts and the rate',
		async () => {
			const { answer } = await evaluatedWithReports({
				items: [FOUND_ITEM, NOT_IN_TEXT_ITEM, POLARITY_ITEM, FREE_TEXT_ITEM],
				asks: THREE_ASKS,
				extra: [],
			})

			expect(trimmedLinesOf(answer.output).filter((line) => line.startsWith('reports'))).toEqual([
				'reports  agreed 1  wrong 1  unjudged 1  rate 0.50',
			])
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	for (const [title, row] of Object.entries(JUDGED_ROWS))
		it(
			title,
			async () => {
				const { answer } = await evaluatedWithReports({
					items: [FOUND_ITEM, row.item],
					asks: [
						{
							ask: 'A-0001',
							question: row.item.question,
							rounds: [{ round: 1, outcome: answeredOutcomeOf(row.agreed) }],
						},
					],
				})

				expect((JSON.parse(answer.output) as StandardEvalJson).reports).toMatchObject(row.counts)
			},
			STANDARD_DISK_CASE_TIMEOUT,
		)

	it(
		'an ask whose first round went on and whose second answered, an ask of a question no gold item holds, an ask never answered → only the answered gold ask counts, by its last round',
		async () => {
			const { answer } = await evaluatedWithReports({
				items: [FOUND_ITEM, NOT_IN_TEXT_ITEM, FREE_TEXT_ITEM],
				asks: [
					{
						ask: 'A-0001',
						question: NOT_IN_TEXT_QUESTION,
						rounds: [
							{ round: 1, outcome: nextRoundOutcome() },
							{ round: 2, outcome: answeredOutcomeOf({ verdict: 'yes' }) },
						],
					},
					{
						ask: 'A-0002',
						question: UNKNOWN_QUESTION,
						rounds: [{ round: 1, outcome: answeredOutcomeOf({ verdict: 'yes' }) }],
					},
					{
						ask: 'A-0003',
						question: FREE_TEXT_QUESTION,
						rounds: [{ round: 1, outcome: nextRoundOutcome() }],
					},
				],
			})

			expect((JSON.parse(answer.output) as StandardEvalJson).reports).toEqual({
				agreed: 0,
				wrong: 1,
				unjudged: 0,
				rate: 1,
			})
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'nothing judged (the one ask is unjudged) → exit 0, zero agreed and wrong, rate null',
		async () => {
			const { answer } = await evaluatedWithReports({
				items: [FOUND_ITEM, FREE_TEXT_ITEM],
				asks: THREE_ASKS.slice(2),
			})

			expect((JSON.parse(answer.output) as StandardEvalJson).reports).toEqual({
				agreed: 0,
				wrong: 0,
				unjudged: 1,
				rate: null,
			})
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'nothing judged, as text → the reports line ends with a dash for the rate',
		async () => {
			const { answer } = await evaluatedWithReports({
				items: [FOUND_ITEM, FREE_TEXT_ITEM],
				asks: THREE_ASKS.slice(2),
				extra: [],
			})

			expect(trimmedLinesOf(answer.output).filter((line) => line.startsWith('reports'))).toEqual([
				'reports  agreed 0  wrong 0  unjudged 1  rate -',
			])
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'no recorded ask at all → exit 0, every count zero, rate null',
		async () => {
			const { answer } = await evaluatedWithReports({ items: [FOUND_ITEM], asks: [] })

			expect((JSON.parse(answer.output) as StandardEvalJson).reports).toEqual({
				agreed: 0,
				wrong: 0,
				unjudged: 0,
				rate: null,
			})
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'run from a folder with no package.json → it runs: no ladder is needed, the same counts',
		async () => {
			const { answer } = await evaluatedWithReports({
				items: [FOUND_ITEM, NOT_IN_TEXT_ITEM, POLARITY_ITEM, FREE_TEXT_ITEM],
				asks: THREE_ASKS,
				outsidePackage: true,
			})

			expect((JSON.parse(answer.output) as StandardEvalJson).reports).toEqual({
				agreed: 1,
				wrong: 1,
				unjudged: 1,
				rate: 0.5,
			})
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'--json → the keys of the plain run and reports, no packs',
		async () => {
			const { answer } = await evaluatedWithReports({
				items: [FOUND_ITEM, NOT_IN_TEXT_ITEM, POLARITY_ITEM, FREE_TEXT_ITEM],
				asks: THREE_ASKS,
			})

			expect(Object.keys(JSON.parse(answer.output) as StandardEvalJson).sort()).toEqual([
				'items',
				'misses',
				'notInText',
				'recallAt10',
				'recallAt5',
				'reports',
				'schema',
				'vocabulary',
			])
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'the run changes nothing in the asks folder',
		async () => {
			const { asksFolder } = await evaluatedWithReports({
				items: [FOUND_ITEM, NOT_IN_TEXT_ITEM, POLARITY_ITEM, FREE_TEXT_ITEM],
				asks: THREE_ASKS,
			})

			expect(filesUnder(asksFolder)).toEqual(
				THREE_ASKS.flatMap((recorded) => [
					join(recorded.ask, 'request.json'),
					join(recorded.ask, 'rounds', 'round-1', 'verdict.json'),
				]),
			)
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)
})

describe('standard eval --reports: a folder that is not there → exit 2 naming the fix', () => {
	it(
		'an asks folder that does not exist → exit 2, the folder named and the asks folder asked for',
		async () => {
			const workspace = createStandardWorkspace({
				standards: { alpha: { 'one.md': sampleStandardText({ word: SAMPLE_WORD }) } },
			})
			const gold = join(workspace.base, 'gold.jsonl')
			writeTextFile({ path: gold, text: `${JSON.stringify(FOUND_ITEM)}\n` })
			const missing = join(workspace.base, 'no-such-asks')

			const answer = await answeredWith({
				run: runStandard({
					argv: ['eval', gold, '--reports', missing],
					cwd: workspace.cwd,
					environment: workspace.environment,
				}),
				exitCode: 2,
			})

			expect(answer.output).toContain(missing)
			expect(answer.output).toContain('asks folder')
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)
})
