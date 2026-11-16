/**
 * Accepted reports as whole values, for the agreement and the round cases: a document report with its one verified
 * cite (or none for `not-in-text`), and an outside report. Built over the baseline reports of the report fixtures.
 */
import { CLAUSE_ONE, LINES_FIRST, ANSWER_SHORT } from './ask-agreement-fixtures.constants.ts'
import {
	DOCUMENT_REPORT,
	GIVEN_DIRECT,
	OUTSIDE_REPORT,
	QUOTE_D_POSITIVE,
} from './ask-report-fixtures.constants.ts'
import { citeOf, verifiedCiteOf } from './ask-report-fixtures.ts'

import type {
	AcceptedReport,
	CheckedCite,
	CheckedClaim,
	ReportCite,
	ReportClaim,
} from '../src/lib/knowledge/ask/ask.types.ts'
import type {
	DocumentAcceptedOfParams,
	OutsideAcceptedOfParams,
} from './ask-agreement-fixtures.types.ts'

/** An accepted document report: one verified claim backing its verdict, none for `not-in-text`. */
export function documentAcceptedOf(params: DocumentAcceptedOfParams): AcceptedReport {
	const verdict = params.verdict ?? 'yes'
	const lines = params.lines ?? LINES_FIRST
	const cite = citeOf({
		quote: QUOTE_D_POSITIVE,
		from: lines.from,
		to: lines.to,
		file: params.file,
	})
	const slice = {
		...(params.given ?? GIVEN_DIRECT),
		file: params.file ?? params.given?.file ?? GIVEN_DIRECT.file,
		clause: params.clause === undefined ? CLAUSE_ONE : params.clause,
	}
	const refusedReportCites: ReportCite[] =
		params.refusedCiteLines === undefined
			? []
			: [
					citeOf({
						quote: QUOTE_D_POSITIVE,
						from: params.refusedCiteLines.from,
						to: params.refusedCiteLines.to,
					}),
				]
	const refusedCites: CheckedCite[] = refusedReportCites.map((refusedCite) => ({
		cite: refusedCite,
		verified: false,
		refused: 'quote-not-found',
	}))
	const claims: CheckedClaim[] =
		verdict === 'not-in-text'
			? []
			: [
					{
						claim: {
							text: 'D shall hold DD_1',
							supports: verdict,
							cites: [cite, ...refusedReportCites],
						},
						cites: [verifiedCiteOf({ cite, slice }), ...refusedCites],
						verified: true,
						refused: null,
						polarityConflict: params.polarityConflict ?? false,
					},
				]
	return {
		accepted: true,
		letter: params.letter,
		notKnown: false,
		claims,
		report: {
			...DOCUMENT_REPORT,
			reader: params.letter,
			nonce: `nonce-${params.letter}`,
			session: `session-${params.letter}`,
			verdict,
			value: params.value ?? null,
			answer: params.answer ?? ANSWER_SHORT,
			claims: claims.map((claim) => claim.claim as ReportClaim),
		},
	}
}

/** An accepted outside report: no file cite, the web cites given, `notKnown` when it was counted not known. */
export function outsideAcceptedOf(params: OutsideAcceptedOfParams): AcceptedReport {
	const verdict = params.verdict ?? 'yes'
	const cites = params.cites ?? []
	return {
		accepted: true,
		letter: params.letter,
		notKnown: params.notKnown ?? false,
		claims: [
			{
				claim: { text: 'D holds DD_1', supports: verdict, cites },
				cites: [],
				verified: true,
				refused: null,
				polarityConflict: params.polarityConflict ?? false,
			},
		],
		report: {
			...OUTSIDE_REPORT,
			reader: params.letter,
			nonce: `nonce-${params.letter}`,
			session: `session-${params.letter}`,
			source: params.source ?? 'model',
			verdict,
			value: params.value ?? null,
			answer: params.answer ?? ANSWER_SHORT,
			claims: [{ text: 'D holds DD_1', supports: verdict, cites }],
		},
	}
}
