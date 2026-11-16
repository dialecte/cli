import type { ReportVerdict, VerdictReport } from '../src/lib/knowledge/ask/ask.types.ts'
import type { FactDraft } from '../src/lib/knowledge/facts/facts.types.ts'
import type { LotAsked } from './ask-answer-fixtures.types.ts'
import type { AskedForPack } from './ask-pack-fixtures.types.ts'
import type { PackedForVerdict } from './ask-verdict-fixtures.types.ts'

/** What `hookInputOf` takes: the ask of a lot the hook is run for, and what the person answered. */
export type HookInputOfParams = { asked: LotAsked; text: string; by: string }

/** What `releaseClaimLater` takes: the claim file and how long it is held before another process releases it. */
export type ReleaseClaimLaterParams = { path: string; afterMs: number }

/** An ask over two clauses whose second round is open after a first round that kept reports. */
export type PackedRoundTwo = {
	packed: PackedForVerdict
	/** The clause the first round gave (the second round gives the other one). */
	roundOneClause: 'first' | 'second'
}

/** What `packedRoundTwoAfter` takes: the accepted reports the first round's verdict kept. */
export type PackedRoundTwoAfterParams = { reports: VerdictReport[] }

/** What `recordFactOfAsk` takes: the ask whose fact an earlier, crashed run left, and the draft it recorded. */
export type RecordFactOfAskParams = { asked: AskedForPack; draft: FactDraft; lot?: string }

/** What `reaskedOverClauses` takes: the unchecked fact the re-ask re-asks, and whether the asks live in a store lot. */
export type ReaskedOverClausesParams = { draft: FactDraft; inLot?: boolean }

/** A re-ask whose first round is open: packed for the verdict, with the fact it re-asks and its lot's folder (or null). */
export type ReaskedPacked = PackedForVerdict & { factId: string; lotFolder: string | null }

/** An ask whose first round gave one slice of two (written by hand): the reports its readers may write. */
export type PartialRoundOne = {
	packed: PackedForVerdict
	/** The clause the round gave. */
	clause: 'first' | 'second'
}

/** What `handReportOf` takes: the open round, the reader and what its report says. */
export type HandReportOfParams = {
	partial: PartialRoundOne
	letter: 'A' | 'B'
	verdict: ReportVerdict
	value: string | null
	answer: string
}

/** What `writeClaimWithStart` takes: the claim's path, the holder's pid and start time (ms), the age of the file. */
export type WriteClaimWithStartParams = {
	path: string
	pid: number
	startedAt: number
	ageMs: number
}

/** What `acceptedEntryOf` takes: the letter, the session and the body hash of an accepted report. */
export type AcceptedEntryOfParams = { letter: string; session: string | null; bodyHash: string }
