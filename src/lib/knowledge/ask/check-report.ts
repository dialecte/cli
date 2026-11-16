import { acceptanceRefusalOf } from './acceptance-refusal-of.ts'
import {
	HEDGE_PATTERN,
	NOT_KNOWN_VERDICT,
	QUOTE_MAX_WORDS,
	QUOTE_MIN_WORDS,
	REPORT_REFUSAL_FAULTS,
	WORD_SEPARATOR,
} from './ask.constants.ts'
import { checkCite } from './check-cite.ts'
import { checkClaim } from './check-claim.ts'
import { claimContradictsQuestion } from './claim-contradicts-question.ts'
import { foldedTextOf } from './folded-text-of.ts'
import { keyTermsOf } from './key-terms-of.ts'
import { readDocumentReport } from './read-document-report.ts'
import { readOutsideReport } from './read-outside-report.ts'
import { isRecord } from './read-report-fields.ts'
import { reportRefusal } from './report-refusal.ts'

import type {
	CheckedClaim,
	CheckedReport,
	CheckReportParams,
	DocumentReport,
	OutsideReport,
	RefusedReport,
} from './ask.types.ts'

/**
 * Accepts or refuses one reader's report: schema, ask and round, nonce, session, identical body, then cites and
 * claims; accepted only with a verified claim backing its verdict, or `not-in-text` with no claims. An outside
 * report goes through the outside acceptance table instead.
 */
export function checkReport(params: CheckReportParams): CheckedReport {
	return params.outside ? checkOutsideReport(params) : checkDocumentReport(params)
}

/** A document reader's report: cites checked against the slices given, claims against their cites. */
function checkDocumentReport(params: CheckReportParams): CheckedReport {
	const read = readDocumentReport({ value: params.value })
	if ('refused' in read)
		return reportRefusal({ refused: 'schema', templates: read.faults, values: {} })
	const { report } = read
	const refused = acceptanceRefusalOf({ report, acceptance: params.acceptance })
	if (refused !== null) return refused
	const claims = report.claims.map((claim) =>
		checkClaim({
			claim,
			cites: claim.cites.map((cite) => checkCite({ cite, context: params.cites })),
			verdict: report.verdict,
			value: report.value,
			question: params.question,
			subject: params.subject,
			vocabulary: params.vocabulary,
		}),
	)
	return backedRefusalOf({ report, claims }) ?? { accepted: true, report, claims, notKnown: false }
}

/** The refusal of a document report none of whose claims backs its verdict, or null. */
function backedRefusalOf(params: {
	report: DocumentReport
	claims: CheckedClaim[]
}): RefusedReport | null {
	const { report, claims } = params
	if (report.verdict === 'not-in-text') {
		if (claims.length === 0) return null
		return reportRefusal({
			refused: 'no-verified-claim',
			templates: [REPORT_REFUSAL_FAULTS.notInTextWithClaims],
			values: {},
		})
	}
	if (claims.some((claim) => claim.verified)) return null
	return reportRefusal({
		refused: 'no-verified-claim',
		templates: [REPORT_REFUSAL_FAULTS.noVerifiedClaim, ...claimFaultsOf({ claims })],
		values: { verdict: report.verdict },
	})
}

/** The faults naming each refused claim and each refused cite of the claims, with their reasons. */
function claimFaultsOf(params: { claims: CheckedClaim[] }): string[] {
	return params.claims.flatMap((claim, index) => [
		...(claim.refused === null
			? []
			: [
					reasonedFault({
						template: REPORT_REFUSAL_FAULTS.claimRefused,
						index,
						reason: claim.refused,
					}),
				]),
		...claim.cites.flatMap((cite, citeIndex) =>
			cite.verified
				? []
				: [
						reasonedFault({
							template: REPORT_REFUSAL_FAULTS.citeRefused,
							index,
							cite: citeIndex,
							reason: cite.refused,
						}),
					],
		),
	])
}

/** A fault template whose `{index}`, `{cite}` and `{reason}` are filled before the refusal fills the rest. */
function reasonedFault(params: {
	template: string
	index: number
	cite?: number
	reason: string
}): string {
	return params.template
		.replaceAll('{index}', String(params.index))
		.replaceAll('{cite}', String(params.cite ?? 0))
		.replaceAll('{reason}', params.reason)
}

/** An outside reader's report: the acceptance table of outside answers. */
function checkOutsideReport(params: CheckReportParams): CheckedReport {
	const early = outsideEarlyRefusalOf({ value: params.value })
	if (early !== null) return early
	const read = readOutsideReport({ value: params.value })
	if ('refused' in read)
		return reportRefusal({ refused: 'schema', templates: read.faults, values: {} })
	const { report } = read
	const refused =
		acceptanceRefusalOf({ report, acceptance: params.acceptance }) ??
		outsideSourceRefusalOf({ report, web: params.acceptance.web })
	if (refused !== null) return refused
	const claims = report.claims.map((claim) => outsideClaimOf({ claim, params }))
	const notKnown = report.verdict === NOT_KNOWN_VERDICT || HEDGE_PATTERN.test(report.answer)
	return { accepted: true, report, claims, notKnown }
}

/** The refusals decided on the raw value, before the schema: a file cite, then a missing session. */
function outsideEarlyRefusalOf(params: { value: unknown }): RefusedReport | null {
	const { value } = params
	if (!isRecord(value)) return null
	const claims = Array.isArray(value.claims) ? value.claims : []
	for (const [index, claim] of claims.entries()) {
		const cites = isRecord(claim) && Array.isArray(claim.cites) ? claim.cites : []
		const cite = cites.findIndex((entry) => isRecord(entry) && 'file' in entry)
		if (cite >= 0)
			return reportRefusal({
				refused: 'document-cite-outside',
				templates: [REPORT_REFUSAL_FAULTS.documentCiteOutside],
				values: { index: String(index), cite: String(cite) },
			})
	}
	if (typeof value.session !== 'string' || value.session === '')
		return reportRefusal({
			refused: 'session-missing',
			templates: [REPORT_REFUSAL_FAULTS.sessionMissing],
			values: {},
		})
	return null
}

/** The refusals of an outside report's source: web not allowed, a url in a model report, a web quote's length. */
function outsideSourceRefusalOf(params: {
	report: OutsideReport
	web: boolean
}): RefusedReport | null {
	const { report } = params
	if (report.source === 'web' && !params.web)
		return reportRefusal({
			refused: 'web-not-allowed',
			templates: [REPORT_REFUSAL_FAULTS.webNotAllowed],
			values: {},
		})
	for (const [index, claim] of report.claims.entries())
		for (const [cite, entry] of claim.cites.entries()) {
			const values = { index: String(index), cite: String(cite) }
			if (report.source === 'model')
				return reportRefusal({
					refused: 'url-in-model-report',
					templates: [REPORT_REFUSAL_FAULTS.urlInModelReport],
					values,
				})
			const words = foldedTextOf({ text: entry.quote })
				.split(WORD_SEPARATOR)
				.filter((word) => word !== '').length
			if (words < QUOTE_MIN_WORDS || words > QUOTE_MAX_WORDS)
				return reportRefusal({
					refused: 'quote-length',
					templates: [REPORT_REFUSAL_FAULTS.quoteLength],
					values: { ...values, words: String(words) },
				})
		}
	return null
}

/** An outside claim after its check: only the claim against the question's wording is compared (comparison 2). */
function outsideClaimOf(params: {
	claim: OutsideReport['claims'][number]
	params: CheckReportParams
}): CheckedClaim {
	const { claim } = params
	const fallback = keyTermsOf({
		text: claim.text,
		vocabulary: params.params.vocabulary,
		subject: params.params.subject,
	})[0]
	return {
		claim,
		cites: [],
		verified: true,
		refused: null,
		polarityConflict: claimContradictsQuestion({
			claimText: claim.text,
			supports: claim.supports,
			question: params.params.question,
			subject: params.params.subject,
			fallback,
		}),
	}
}
