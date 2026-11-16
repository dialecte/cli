import { GIVEN_DIRECT, REPORT_FILE, REPORT_MANIFEST } from './ask-report-fixtures.constants.ts'

import type { CiteContext, RangeLine, ReportCite } from '../src/lib/knowledge/ask/ask.types.ts'
import type {
	CiteContextOfParams,
	CiteOfParams,
	VerifiedCite,
	VerifiedCiteOfParams,
} from './ask-report-fixtures.types.ts'

/** One cite of the baseline file; lines 12 to 13 unless said. */
export function citeOf(params: CiteOfParams): ReportCite {
	return {
		file: params.file ?? REPORT_FILE,
		from: params.from ?? 12,
		to: params.to ?? 13,
		quote: params.quote,
	}
}

/** One prose line holding `text`, at line 12 unless said. */
export function proseLineOf(params: { text: string; from?: number }): RangeLine {
	const from = params.from ?? 12
	return { from, to: from, kind: 'prose', text: params.text }
}

/** A cite context whose ranges are `lines` (their count of non-noise lines `counted`, else their number). */
export function citeContextOf(params: CiteContextOfParams): CiteContext {
	const range = { lines: params.lines, counted: params.counted ?? params.lines.length }
	return {
		manifest: REPORT_MANIFEST,
		current: params.current ?? REPORT_MANIFEST,
		given: params.given ?? [GIVEN_DIRECT],
		rangeOf: () => range,
	}
}

/** A cite already verified against `GIVEN_DIRECT` (or the slice given), as `checkClaim` receives it. */
export function verifiedCiteOf(params: VerifiedCiteOfParams): VerifiedCite {
	return { cite: params.cite, verified: true, slice: params.slice ?? GIVEN_DIRECT }
}
