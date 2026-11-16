import { LIST_ITEM_PATTERN } from './ask.constants.ts'
import { verifiedCitesOf } from './verified-cites-of.ts'

import type { AcceptedReport, AskKind, ReportsAgreeParams, VerifiedCite } from './ask.types.ts'

/**
 * Whether two accepted reports agree (section 8): equal verdicts, equal values (as sets for a `values` question),
 * no polarity conflict on either, and verified cites sharing a line or a clause leaf.
 */
export function reportsAgree(params: ReportsAgreeParams): boolean {
	const { first, second, kind } = params
	if (first.report.verdict !== second.report.verdict) return false
	if (!valuesAgree({ first: first.report.value, second: second.report.value, kind })) return false
	if (hasPolarityConflict({ report: first }) || hasPolarityConflict({ report: second }))
		return false
	const secondCites = verifiedCitesOf({ report: second })
	return verifiedCitesOf({ report: first }).some((left) =>
		secondCites.some((right) => citesMeet({ left, right })),
	)
}

/** Whether a report holds a claim whose polarity contradicts the question (it never counts toward agreement). */
export function hasPolarityConflict(params: { report: AcceptedReport }): boolean {
	return params.report.claims.some((claim) => claim.polarityConflict)
}

/** Two values as one: a `values` question's as sets of names (trimmed, case-folded), any other's as written. */
export function valuesAgree(params: {
	first: string | null
	second: string | null
	kind: AskKind
}): boolean {
	const { first, second } = params
	if (first === null || second === null) return first === second
	if (params.kind !== 'values') return first.trim() === second.trim()
	const left = namesOf({ value: first })
	const right = namesOf({ value: second })
	return left.size === right.size && [...left].every((name) => right.has(name))
}

/** The names of a list value, trimmed and case-folded, each once. */
function namesOf(params: { value: string }): Set<string> {
	return new Set(
		params.value
			.trim()
			.split(LIST_ITEM_PATTERN)
			.map((name) => name.trim().toLowerCase())
			.filter((name) => name !== ''),
	)
}

/** Two verified cites of one file sharing a line, or checked against slices of one clause leaf of that file. */
function citesMeet(params: { left: VerifiedCite; right: VerifiedCite }): boolean {
	const { left, right } = params
	if (left.cite.file !== right.cite.file) return false
	if (left.cite.from <= right.cite.to && right.cite.from <= left.cite.to) return true
	return left.slice.clause !== null && left.slice.clause === right.slice.clause
}
