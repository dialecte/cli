import { createHash } from 'node:crypto'

import {
	SETUP_HASH_ALGORITHM,
	SETUP_HASH_ENCODING,
	WHITESPACE_PATTERN,
	WORD_SEPARATOR,
} from './ask.constants.ts'

import type { OutsideCite, ReportBodyOfParams, ReportCite } from './ask.types.ts'

/** The sha256 (hex) of a report's body as `reportBodyOf` gives it: what a verdict keeps of the body (R2-3). */
export function reportBodyHashOf(params: ReportBodyOfParams): string {
	return createHash(SETUP_HASH_ALGORITHM).update(reportBodyOf(params)).digest(SETUP_HASH_ENCODING)
}

/**
 * The body of a report as acceptance compares it: verdict, value, answer and claims, whitespace folded; never the
 * ask, round, reader, nonce, session or what was searched.
 */
export function reportBodyOf(params: ReportBodyOfParams): string {
	const { report } = params
	return JSON.stringify([
		report.verdict,
		report.value === null ? null : folded({ text: report.value }),
		folded({ text: report.answer }),
		report.claims.map((claim) => [
			folded({ text: claim.text }),
			claim.supports,
			claim.cites.map((cite) => citeBodyOf({ cite })),
		]),
	])
}

/** A cite as the body holds it: where it points and its words. */
function citeBodyOf(params: { cite: ReportCite | OutsideCite }): (string | number)[] {
	const { cite } = params
	if ('url' in cite) return [cite.url, folded({ text: cite.quote }), cite.retrieved]
	return [cite.file, cite.from, cite.to, folded({ text: cite.quote })]
}

/** A text with its whitespace runs folded to one space, trimmed. */
function folded(params: { text: string }): string {
	return params.text.replace(WHITESPACE_PATTERN, WORD_SEPARATOR).trim()
}
