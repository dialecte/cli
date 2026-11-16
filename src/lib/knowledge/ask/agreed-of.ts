import { NOT_IN_TEXT_VERDICT, NOT_KNOWN_VERDICT } from './ask.constants.ts'
import { verifiedCitesOf } from './verified-cites-of.ts'

import type { AcceptedReport, Agreed, ReportCite, ReportVerdict } from './ask.types.ts'

/**
 * What agreeing reports agreed on (section 9): the first one's verdict and value, the shortest of their answers,
 * the union of their verified cites (one cite of the same file, lines and words once) and their letters.
 */
export function agreedOf(params: { reports: AcceptedReport[] }): Agreed {
	const { reports } = params
	const [first] = reports
	const cites: ReportCite[] = []
	for (const report of reports)
		for (const { cite } of verifiedCitesOf({ report }))
			if (!cites.some((kept) => sameCite({ left: kept, right: cite }))) cites.push(cite)
	const answers = reports.map((report) => report.report.answer)
	return {
		verdict: reportVerdictOf({ verdict: first?.report.verdict }),
		value: first?.report.value ?? null,
		answer: answers.reduce(
			(shortest, answer) => (answer.length < shortest.length ? answer : shortest),
			answers[0] ?? '',
		),
		cites,
		letters: reports.map((report) => report.letter),
	}
}

/** A report's verdict as an agreed one: an outside `not-known` (which never agrees) or none reads as not-in-text. */
function reportVerdictOf(params: {
	verdict: ReportVerdict | typeof NOT_KNOWN_VERDICT | undefined
}): ReportVerdict {
	const { verdict } = params
	return verdict === undefined || verdict === NOT_KNOWN_VERDICT ? NOT_IN_TEXT_VERDICT : verdict
}

/** Two cites of the same file, lines and words. */
function sameCite(params: { left: ReportCite; right: ReportCite }): boolean {
	const { left, right } = params
	return (
		left.file === right.file &&
		left.from === right.from &&
		left.to === right.to &&
		left.quote === right.quote
	)
}
