import { fillMessage } from '../standard/fill-message.ts'
import { normaliseText } from '../standard/normalise-text.ts'
import {
	BRIEF_JSON_INDENT,
	BRIEF_MARGIN_WIDTH,
	BRIEF_REPORT_PLACEHOLDERS,
	BRIEF_TEXT,
	DOCUMENT_BRIEF_RULES,
	OUTSIDE_BRIEF_RULES,
	OUTSIDE_SOURCE_RULES,
	OUTSIDE_VERDICTS,
	READER_BRIEF_SCHEMA,
	REPORT_VERDICTS,
} from './ask.constants.ts'

import type {
	BriefSlice,
	OutsideBrief,
	RangeLine,
	ReaderBrief,
	ReaderBriefJson,
	ReaderBriefOfParams,
} from './ask.types.ts'

/**
 * One reader's brief: the question, the subject, all angles, the slices' normalised text with original line
 * numbers in the margin (poor ones flagged), the report schema, the nonce and the rules; outside: no slice, the
 * public name, `not-known` allowed, `source` required (`web` offered only when the pack allows it).
 */
export function readerBriefOf(params: ReaderBriefOfParams): ReaderBrief {
	const { outside } = params
	const slices: BriefSlice[] =
		outside === null
			? params.reader.slices.map((slice) => ({
					id: slice.id,
					file: slice.file,
					from: slice.from,
					to: slice.to,
					clause: slice.clause,
					linked: slice.linked,
					quality: slice.quality,
					lines: params.rangeText({ slice }).lines.map(normalisedLineOf),
				}))
			: []
	const report = reportSchemaOf({ params })
	const json: ReaderBriefJson = {
		schema: READER_BRIEF_SCHEMA,
		ask: params.ask,
		round: params.round,
		reader: params.reader.letter,
		nonce: params.nonce,
		question: params.question,
		subject: params.subject,
		angles: params.angles,
		outside,
		slices,
		report,
	}
	return { markdown: markdownOf({ params, slices, report }), json }
}

/** A line of a slice as the reader reads it: its text normalised, its original line numbers kept. */
function normalisedLineOf(line: RangeLine): RangeLine {
	return { ...line, text: normaliseText(line.text) }
}

/** The brief as markdown: header, angles, slices (or the outside standard), rules and the report schema. */
function markdownOf(params: {
	params: ReaderBriefOfParams
	slices: BriefSlice[]
	report: Record<string, unknown>
}): string {
	const brief = params.params
	const { outside } = brief
	const lines = [
		fillMessage({
			template: BRIEF_TEXT.title,
			values: { letter: brief.reader.letter, ask: brief.ask, round: String(brief.round) },
		}),
		'',
		fillMessage({ template: BRIEF_TEXT.question, values: { question: brief.question } }),
		fillMessage({
			template: BRIEF_TEXT.subject,
			values: {
				tags: listOf(brief.subject.tags),
				attributes: listOf(brief.subject.attributes),
				terms: listOf(brief.subject.terms),
			},
		}),
		fillMessage({ template: BRIEF_TEXT.nonce, values: { nonce: brief.nonce } }),
		...(outside === null
			? []
			: [fillMessage({ template: BRIEF_TEXT.outsideName, values: { name: nameOf({ outside }) } })]),
		'',
		BRIEF_TEXT.anglesHeading,
		...brief.angles.map((angle) =>
			fillMessage({
				template: BRIEF_TEXT.angle,
				values: { id: angle.id, family: angle.family, terms: listOf(angle.terms) },
			}),
		),
		'',
		...(outside === null ? sliceLinesOf({ slices: params.slices }) : []),
		BRIEF_TEXT.rulesHeading,
		...rulesOf({ outside }),
		'',
		BRIEF_TEXT.reportHeading,
		fillMessage({
			template: BRIEF_TEXT.verdictsLine,
			values: {
				verdicts: (outside === null ? REPORT_VERDICTS : OUTSIDE_VERDICTS).join(
					BRIEF_TEXT.listSeparator,
				),
			},
		}),
		BRIEF_TEXT.jsonFenceStart,
		JSON.stringify(params.report, null, BRIEF_JSON_INDENT),
		BRIEF_TEXT.fenceEnd,
		'',
	]
	return lines.join('\n')
}

/** The slices section: each slice headed by its file and lines (poor ones flagged), then its numbered lines. */
function sliceLinesOf(params: { slices: BriefSlice[] }): string[] {
	if (params.slices.length === 0) return [BRIEF_TEXT.slicesHeading, BRIEF_TEXT.noSlice, '']
	return [
		BRIEF_TEXT.slicesHeading,
		'',
		...params.slices.flatMap((slice) => [
			fillMessage({
				template: BRIEF_TEXT.slice,
				values: {
					id: slice.id,
					file: slice.file,
					from: String(slice.from),
					to: String(slice.to),
					clause:
						slice.clause === null
							? ''
							: fillMessage({ template: BRIEF_TEXT.sliceClause, values: { clause: slice.clause } }),
					poor: slice.quality === 'poor' ? BRIEF_TEXT.slicePoor : '',
				},
			}),
			...slice.lines.map((line) =>
				fillMessage({
					template: BRIEF_TEXT.sliceLine,
					values: { margin: marginOf({ line }), text: line.text },
				}),
			),
			'',
		]),
	]
}

/** The original line number of a logical line (its first and last when it spans several), right-aligned. */
function marginOf(params: { line: RangeLine }): string {
	const { line } = params
	const numbers =
		line.from === line.to
			? String(line.from)
			: fillMessage({
					template: BRIEF_TEXT.sliceLineRange,
					values: { from: String(line.from), to: String(line.to) },
				})
	return numbers.padStart(BRIEF_MARGIN_WIDTH)
}

/** The rules of the reader: a documents reader's, or an outside reader's with the source the pack allows. */
function rulesOf(params: { outside: OutsideBrief | null }): string[] {
	const { outside } = params
	if (outside === null) return [...DOCUMENT_BRIEF_RULES]
	return [
		...OUTSIDE_BRIEF_RULES.map((rule) =>
			fillMessage({ template: rule, values: { name: nameOf({ outside }) } }),
		),
		outside.web ? OUTSIDE_SOURCE_RULES.web : OUTSIDE_SOURCE_RULES.model,
	]
}

/** The report the reader writes, its ask, round, letter and nonce filled in (section 8; outside: section 18). */
function reportSchemaOf(params: { params: ReaderBriefOfParams }): Record<string, unknown> {
	const brief = params.params
	const { outside } = brief
	const placeholders = BRIEF_REPORT_PLACEHOLDERS
	const cite =
		outside === null
			? { file: placeholders.file, from: 1, to: 1, quote: placeholders.quote }
			: { url: placeholders.url, quote: placeholders.quote, retrieved: placeholders.retrieved }
	return {
		ask: brief.ask,
		round: brief.round,
		reader: brief.reader.letter,
		nonce: brief.nonce,
		...(outside === null ? {} : { source: placeholders.source }),
		verdict: (outside === null ? REPORT_VERDICTS : OUTSIDE_VERDICTS)[0],
		value: null,
		answer: placeholders.answer,
		claims: [
			{
				text: placeholders.claim,
				supports: placeholders.supports,
				cites: outside === null || outside.web ? [cite] : [],
			},
		],
		notFound: [placeholders.notFound],
		familiesRead: [placeholders.familiesRead],
		session: placeholders.session,
	}
}

/** The standard's public name, or a plain wording when the dialecte declares none. */
function nameOf(params: { outside: OutsideBrief }): string {
	return params.outside.name ?? BRIEF_TEXT.unnamedStandard
}

/** Names joined for a line, or a dash when there are none. */
function listOf(names: readonly string[]): string {
	return names.length === 0 ? BRIEF_TEXT.none : names.join(BRIEF_TEXT.listSeparator)
}
