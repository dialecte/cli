/**
 * Whole ask folders as the readers' rounds leave them (`request.json` and each round's `verdict.json`), and the
 * gold files the agreed-wrong measure reads them against.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { BASE_REQUEST, GOLD_RECORD_AT } from './standard-gold-fixtures.constants.ts'
import { writeTextFile } from './standard-workspace.ts'

import type { RoundOutcome, VerdictRecord } from '../src/lib/knowledge/ask/ask.types.ts'
import type { AgreedOutcomeParams, RecordedAsk } from './standard-gold-fixtures.types.ts'

/** The outcome of a round the readers agreed in: `answered`, on a verdict (and a value for a `value` verdict). */
export function answeredOutcomeOf(params: AgreedOutcomeParams): RoundOutcome {
	return {
		state: 'answered',
		agreed: {
			verdict: params.verdict,
			value: params.value ?? null,
			answer: 'what the readers answered',
			cites: [],
			letters: ['A', 'B'],
		},
	}
}

/** The outcome of a round that went on to the next one, the readers not agreeing. */
export function nextRoundOutcome(): RoundOutcome {
	return { state: 'next-round', reason: 'disagreement' }
}

/** A whole `verdict.json` of a closed round. */
function verdictRecordOf(params: {
	ask: string
	round: number
	outcome: RoundOutcome
	adjudicator?: boolean
}): VerdictRecord {
	return {
		schema: 1,
		ask: params.ask,
		round: params.round,
		adjudicator: params.adjudicator ?? false,
		reports: [],
		outcome: params.outcome,
		verifiedAngles: [],
		state: params.outcome.state === 'answered' ? 'answered' : 'needs-readers',
		next: null,
		fact: null,
		at: GOLD_RECORD_AT,
	}
}

/** Writes the folder of each recorded ask below `asksFolder`: its `request.json` and one `verdict.json` per round. */
export function writeRecordedAsks(params: { asksFolder: string; asks: RecordedAsk[] }): void {
	// an asks folder holding no ask is still a folder
	mkdirSync(params.asksFolder, { recursive: true })
	for (const recorded of params.asks) {
		const folder = join(params.asksFolder, recorded.ask)
		writeTextFile({
			path: join(folder, 'request.json'),
			text: `${JSON.stringify({ ...BASE_REQUEST, question: recorded.question }, null, '\t')}\n`,
		})
		for (const { round, outcome, adjudicator } of recorded.rounds)
			writeTextFile({
				path: join(folder, 'rounds', `round-${round}`, 'verdict.json'),
				text: `${JSON.stringify(verdictRecordOf({ ask: recorded.ask, round, outcome, adjudicator }), null, '\t')}\n`,
			})
	}
}
