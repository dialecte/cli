/**
 * Review round 1, R1-13: the agreed-wrong rate counts the readers' rounds only. The adjudicator settles one ask; its
 * round is never what the readers agreed.
 */
import { join } from 'node:path'

import { NOT_IN_TEXT_QUESTION } from '../../test/standard-gold-fixtures.constants.ts'
import {
	answeredOutcomeOf,
	nextRoundOutcome,
	writeRecordedAsks,
} from '../../test/standard-gold-fixtures.ts'
import { SAMPLE_WORD } from '../../test/standard-workspace.constants.ts'
import {
	answeredWith,
	createStandardWorkspace,
	sampleStandardText,
	sampleValueSentence,
	writeTextFile,
} from '../../test/standard-workspace.ts'
import { STANDARD_DISK_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { runStandard } from './standard.ts'

import { describe, expect, it } from 'vitest'

import type { RecordedAsk } from '../../test/standard-gold-fixtures.types.ts'
import type { StandardEvalJson } from '../../test/standard-workspace.types.ts'
import type { StandardGoldItem } from '../lib/knowledge/standard/standard-search.types.ts'

const FOUND_QUOTE = sampleValueSentence(SAMPLE_WORD).toLowerCase()

const FOUND_ITEM: StandardGoldItem = {
	question: SAMPLE_WORD,
	expected: [{ file: 'alpha/one', quote: FOUND_QUOTE }],
}
const NOT_IN_TEXT_ITEM: StandardGoldItem = {
	question: NOT_IN_TEXT_QUESTION,
	kind: 'not-in-text',
	answer: 'the standard does not say',
	status: 'checked',
	expected: [],
}

/** `standard eval <gold> --reports <asks>` over a gold file of the items and an asks folder of the asks recorded. */
async function reportsOf(params: { asks: RecordedAsk[] }): Promise<StandardEvalJson['reports']> {
	const workspace = createStandardWorkspace({
		standards: { alpha: { 'one.md': sampleStandardText({ word: SAMPLE_WORD }) } },
	})
	const gold = join(workspace.base, 'gold.jsonl')
	writeTextFile({
		path: gold,
		text: `${[FOUND_ITEM, NOT_IN_TEXT_ITEM].map((item) => JSON.stringify(item)).join('\n')}\n`,
	})
	const asksFolder = join(workspace.base, 'asks')
	writeRecordedAsks({ asksFolder, asks: params.asks })
	const answer = await answeredWith({
		run: runStandard({
			argv: ['eval', gold, '--reports', asksFolder, '--json'],
			cwd: workspace.cwd,
			environment: workspace.environment,
		}),
		exitCode: 0,
	})
	return (JSON.parse(answer.output) as StandardEvalJson).reports
}

describe('standard eval --reports: the adjudicator is not what the readers agreed', () => {
	it(
		"an ask whose only answered round is the adjudicator's -> nothing judged: zero agreed, wrong and unjudged, rate null",
		async () => {
			const reports = await reportsOf({
				asks: [
					{
						ask: 'A-0001',
						question: NOT_IN_TEXT_QUESTION,
						rounds: [
							{ round: 1, outcome: nextRoundOutcome() },
							{ round: 2, outcome: answeredOutcomeOf({ verdict: 'yes' }), adjudicator: true },
						],
					},
				],
			})

			expect(reports).toEqual({ agreed: 0, wrong: 0, unjudged: 0, rate: null })
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'an ask the readers answered wrong in the first round and the adjudicator answered right in the second -> judged by the readers: one agreed-wrong',
		async () => {
			const reports = await reportsOf({
				asks: [
					{
						ask: 'A-0001',
						question: NOT_IN_TEXT_QUESTION,
						rounds: [
							{ round: 1, outcome: answeredOutcomeOf({ verdict: 'yes' }) },
							{
								round: 2,
								outcome: answeredOutcomeOf({ verdict: 'not-in-text' }),
								adjudicator: true,
							},
						],
					},
				],
			})

			expect(reports).toEqual({ agreed: 0, wrong: 1, unjudged: 0, rate: 1 })
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)
})
