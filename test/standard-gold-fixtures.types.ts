import type { ReportVerdict, RoundOutcome } from '../src/lib/knowledge/ask/ask.types.ts'
import type { StandardGoldItem } from '../src/lib/knowledge/standard/standard-search.types.ts'

/** One closed round of a recorded ask: its number, what it came to, and whether the adjudicator's report closed it. */
export type RecordedRound = { round: number; outcome: RoundOutcome; adjudicator?: boolean }

/** An ask folder to write below an asks folder: its id, the question it was asked, its closed rounds. */
export type RecordedAsk = { ask: string; question: string; rounds: RecordedRound[] }

/** What the readers agreed on in an `answered` round: the verdict and, for a `value` verdict, the value. */
export type AgreedOutcomeParams = { verdict: ReportVerdict; value?: string }

/** One row of the agreed-wrong rules: the gold item, what the readers agreed on and how the ask is counted. */
export type JudgedRow = {
	item: StandardGoldItem
	agreed: AgreedOutcomeParams
	counts: { agreed: number; wrong: number; unjudged: number }
}
