import type { ReaderLetter, ReportVerdict } from '../src/lib/knowledge/ask/ask.types.ts'
import type { AskedForPack } from './ask-pack-fixtures.types.ts'

/** A slice of a reader's `.json` brief with its lines, as the report writers read it. */
export type BriefSliceWithLines = {
	id: string
	file: string
	from: number
	to: number
	clause: string | null
	lines: { from: number; to: number; kind: string; text: string }[]
}

/** What a reader's `.json` brief holds, as far as the report writers read it. */
export type BriefForReport = {
	reader: ReaderLetter
	round: number
	nonce: string
	slices: BriefSliceWithLines[]
}

/** An ask whose first round is open: the ask, and the brief of each reader of the round. */
export type PackedForVerdict = AskedForPack & {
	briefs: Partial<Record<ReaderLetter, BriefForReport>>
}

/** What `ask verdict --json` prints, as far as the tests read it. */
export type VerdictJson = {
	schema: number
	ask: string
	round: number
	state: string
	reports: Record<string, unknown>[]
	fact: string | null
	conflict: { kind: string; fact: string; outside: string[] } | null
	next: string | null
}

/** Which clause a report cites: the first or the second of the documents. */
export type CitedClause = 'first' | 'second'

/** What `reportOf` takes: the packed ask, the reader and whatever else of its report the case pins. */
export type ReportOfParams = {
	packed: PackedForVerdict
	letter: ReaderLetter
	/** The clause cited (the first unless said). */
	clause?: CitedClause
	verdict?: ReportVerdict
	value?: string | null
	answer?: string
	/** The words quoted: the whole line unless said. */
	quote?: string
	/** The claim's text. */
	claimText?: string
	/** The id of the reader's session (one per letter unless said). */
	session?: string
	/** The ask the report names (the packed ask unless said). */
	ask?: string
	/** The round the report names (the brief's unless said). */
	round?: number
}

/** What `outsideReportOf` takes: the packed outside ask, the reader and whatever else of its report the case pins. */
export type OutsideReportOfParams = {
	packed: PackedForVerdict
	letter: ReaderLetter
	source?: 'model' | 'web'
	verdict?: ReportVerdict | 'not-known'
	value?: string | null
	answer?: string
	session?: string
}
