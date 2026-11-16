import type { AcceptedReport, VerifiedCite } from './ask.types.ts'

/**
 * The verified cites an accepted report rests on: those of its verified claims, each with the slice it was checked
 * against. A refused cite, or a cite of a refused claim, counts for nothing.
 */
export function verifiedCitesOf(params: { report: AcceptedReport }): VerifiedCite[] {
	return params.report.claims
		.filter((claim) => claim.verified)
		.flatMap((claim) => claim.cites.filter((cite): cite is VerifiedCite => cite.verified))
}
