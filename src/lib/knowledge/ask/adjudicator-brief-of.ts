import { fillMessage } from '../standard/fill-message.ts'
import { normaliseText } from '../standard/normalise-text.ts'
import {
	ADJUDICATOR_BRIEF_RULES,
	ADJUDICATOR_BRIEF_TEXT,
	ADJUDICATOR_READER,
	BRIEF_JSON_INDENT,
	BRIEF_MARGIN_WIDTH,
	BRIEF_REPORT_PLACEHOLDERS,
	BRIEF_TEXT,
	DOCUMENT_BRIEF_RULES,
	READER_BRIEF_SCHEMA,
	REPORT_VERDICTS,
} from './ask.constants.ts'
import { verifiedCitesOf } from './verified-cites-of.ts'

import type {
	AdjudicatorBriefJson,
	AdjudicatorBriefOfParams,
	AdjudicatorBriefRange,
	AdjudicatorBriefReport,
	OutsideCite,
	ReaderBrief,
	ReportCite,
} from './ask.types.ts'

/**
 * The adjudicator's brief as two files (section 8): the question and subject, the accepted reports with their check
 * results, the union of the ranges they cited (overlapping ranges of one file merged), the report schema and its
 * nonce. The adjudicator's report goes through the same checks as a reader's.
 */
export function adjudicatorBriefOf(params: AdjudicatorBriefOfParams): ReaderBrief {
	const reports = params.reports.map(function briefReportOf(report): AdjudicatorBriefReport {
		return {
			letter: report.letter,
			verdict: report.report.verdict,
			value: report.report.value,
			answer: report.report.answer,
			claims: report.claims.map((claim) => ({
				text: claim.claim.text,
				supports: claim.claim.supports,
				cites: claim.claim.cites,
				verified: claim.verified,
				refused: claim.refused,
				polarityConflict: claim.polarityConflict,
			})),
		}
	})
	const ranges = mergedRangesOf({ params }).map((range) => ({
		...range,
		lines: params
			.rangeText(range)
			.lines.map((line) => ({ ...line, text: normaliseText(line.text) })),
	}))
	const json: AdjudicatorBriefJson = {
		schema: READER_BRIEF_SCHEMA,
		ask: params.ask,
		round: params.round,
		reader: ADJUDICATOR_READER,
		nonce: params.nonce,
		question: params.question,
		subject: params.subject,
		reports,
		ranges,
		report: reportSchemaOf({ params }),
	}
	return { markdown: markdownOf({ json }), json }
}

/** The ranges of the reports' verified cites, by file then line, the overlapping ranges of one file merged. */
function mergedRangesOf(params: {
	params: AdjudicatorBriefOfParams
}): { file: string; from: number; to: number }[] {
	const cited = params.params.reports
		.flatMap((report) => verifiedCitesOf({ report }))
		.map(({ cite }) => ({ file: cite.file, from: cite.from, to: cite.to }))
		.sort((left, right) => left.file.localeCompare(right.file) || left.from - right.from)
	const merged: { file: string; from: number; to: number }[] = []
	for (const range of cited) {
		const last = merged[merged.length - 1]
		if (last !== undefined && last.file === range.file && range.from <= last.to)
			last.to = Math.max(last.to, range.to)
		else merged.push({ ...range })
	}
	return merged
}

/** The report the adjudicator writes, its ask, round, reader and nonce filled in: a documents report. */
function reportSchemaOf(params: { params: AdjudicatorBriefOfParams }): Record<string, unknown> {
	const brief = params.params
	const placeholders = BRIEF_REPORT_PLACEHOLDERS
	return {
		ask: brief.ask,
		round: brief.round,
		reader: ADJUDICATOR_READER,
		nonce: brief.nonce,
		verdict: REPORT_VERDICTS[0],
		value: null,
		answer: placeholders.answer,
		claims: [
			{
				text: placeholders.claim,
				supports: placeholders.supports,
				cites: [{ file: placeholders.file, from: 1, to: 1, quote: placeholders.quote }],
			},
		],
		notFound: [placeholders.notFound],
		familiesRead: [placeholders.familiesRead],
		session: placeholders.session,
	}
}

/** The brief as markdown: header, the readers' reports with their checks, the cited ranges, rules, the schema. */
function markdownOf(params: { json: AdjudicatorBriefJson }): string {
	const { json } = params
	return [
		fillMessage({
			template: ADJUDICATOR_BRIEF_TEXT.title,
			values: { ask: json.ask, round: String(json.round) },
		}),
		'',
		fillMessage({ template: BRIEF_TEXT.question, values: { question: json.question } }),
		fillMessage({
			template: BRIEF_TEXT.subject,
			values: {
				tags: listOf(json.subject.tags),
				attributes: listOf(json.subject.attributes),
				terms: listOf(json.subject.terms),
			},
		}),
		fillMessage({ template: BRIEF_TEXT.nonce, values: { nonce: json.nonce } }),
		'',
		ADJUDICATOR_BRIEF_TEXT.reportsHeading,
		'',
		...json.reports.flatMap(reportLinesOf),
		ADJUDICATOR_BRIEF_TEXT.rangesHeading,
		'',
		...json.ranges.flatMap(rangeLinesOf),
		BRIEF_TEXT.rulesHeading,
		...ADJUDICATOR_BRIEF_RULES,
		...DOCUMENT_BRIEF_RULES,
		'',
		BRIEF_TEXT.reportHeading,
		fillMessage({
			template: BRIEF_TEXT.verdictsLine,
			values: { verdicts: REPORT_VERDICTS.join(BRIEF_TEXT.listSeparator) },
		}),
		BRIEF_TEXT.jsonFenceStart,
		JSON.stringify(json.report, null, BRIEF_JSON_INDENT),
		BRIEF_TEXT.fenceEnd,
		'',
	].join('\n')
}

/** One reader's report as the adjudicator reads it: verdict, answer, each claim with its check and its cites. */
function reportLinesOf(report: AdjudicatorBriefReport): string[] {
	const text = ADJUDICATOR_BRIEF_TEXT
	return [
		fillMessage({
			template: text.report,
			values: {
				letter: report.letter,
				verdict: report.verdict,
				value:
					report.value === null
						? ''
						: fillMessage({ template: text.reportValue, values: { value: report.value } }),
			},
		}),
		fillMessage({ template: text.answer, values: { answer: report.answer } }),
		...report.claims.flatMap((claim) => [
			fillMessage({
				template: text.claim,
				values: { text: claim.text, supports: claim.supports, check: claimCheckOf({ claim }) },
			}),
			...claim.cites.filter(isDocumentCite).map((cite) =>
				fillMessage({
					template: text.cite,
					values: {
						file: cite.file,
						from: String(cite.from),
						to: String(cite.to),
						quote: cite.quote,
					},
				}),
			),
		]),
		'',
	]
}

/** What a claim's check came to, as its line says it: verified or refused, a polarity conflict flagged. */
function claimCheckOf(params: { claim: AdjudicatorBriefReport['claims'][number] }): string {
	const { claim } = params
	const text = ADJUDICATOR_BRIEF_TEXT
	const check = claim.verified
		? text.claimVerified
		: fillMessage({ template: text.claimRefused, values: { refused: claim.refused ?? '' } })
	return claim.polarityConflict ? `${check}${text.claimConflict}` : check
}

/** Whether a cite is of a document (a file and its lines), not of a web page. */
function isDocumentCite(cite: ReportCite | OutsideCite): cite is ReportCite {
	return 'file' in cite
}

/** One cited range: its file and lines, then each line with its original line number in the margin. */
function rangeLinesOf(range: AdjudicatorBriefRange): string[] {
	return [
		fillMessage({
			template: ADJUDICATOR_BRIEF_TEXT.range,
			values: { file: range.file, from: String(range.from), to: String(range.to) },
		}),
		...range.lines.map((line) =>
			fillMessage({
				template: BRIEF_TEXT.sliceLine,
				values: {
					margin: (line.from === line.to
						? String(line.from)
						: fillMessage({
								template: BRIEF_TEXT.sliceLineRange,
								values: { from: String(line.from), to: String(line.to) },
							})
					).padStart(BRIEF_MARGIN_WIDTH),
					text: line.text,
				},
			}),
		),
		'',
	]
}

/** Names joined for a line, or a dash when there are none. */
function listOf(names: readonly string[]): string {
	return names.length === 0 ? BRIEF_TEXT.none : names.join(BRIEF_TEXT.listSeparator)
}
