/**
 * The pull request body's quality, in its risk part: the counts since the body's base, each finding no opt-out
 * silenced worded as `rules` words it (a public export left without docs marked `✗`), then the notes `rules` prints;
 * or why it was not judged. Pure: the findings are judged by the caller.
 */
import { counted } from '../counted.ts'
import { DETAIL_SEPARATOR, SHORT_SHA_LENGTH } from '../gate-records/gate-records.constants.ts'
import { capFindings } from './quality-card.ts'
import {
	declaredPlaceOf,
	docsMessageOf,
	duplicateMessageOf,
	isDocsFinding,
	sharedExportMessageOf,
} from './quality-wording.ts'
import { QUALITY_BODY_TEXTS, QUALITY_CARD_TEXTS, QUALITY_PIECE_NOTES } from './quality.constants.ts'

import type {
	BodyQuality,
	JudgedQuality,
	QualityBodyLine,
	QualityDocs,
	QualityLists,
} from './quality.types.ts'

/**
 * The quality lines of the body's risk part: the head line with the counts and the base, then one line per finding
 * and note; `Quality: not judged (<why>)` alone when it was not.
 *
 * @intent show a reviewer what the base-aware rules find on the change the pull request lands
 * @internal
 */
export function qualityBodyLines(quality: BodyQuality): string[] {
	if (quality.kind === 'not-judged')
		return [QUALITY_BODY_TEXTS.notJudged.replace('{why}', () => quality.why)]
	return [headLineOf(quality), ...listedLinesOf(quality).map((line) => line.text)]
}

/**
 * The quality lines of the body that hold free text (a finding's names and paths, a note), each with where it comes
 * from: what the public-text check reads.
 *
 * @intent check the quality lines of a pull request body as public text
 * @internal
 */
export function qualityBodyPieces(quality: BodyQuality): QualityBodyLine[] {
	return quality.kind === 'judged' ? listedLinesOf(quality) : []
}

/** The head line: how many findings of each kind are listed, how many an opt-out silenced, since the base. */
function headLineOf(quality: JudgedQuality): string {
	const findings = [...quality.duplicates, ...quality.sharedExports, ...quality.docs]
	const allowed = findings.filter((finding) => finding.allowed).length
	const listed = listedOf(quality)
	const counts = [
		...(listed.duplicates.length
			? [counted({ count: listed.duplicates.length, noun: QUALITY_CARD_TEXTS.duplicates })]
			: []),
		...(listed.sharedExports.length
			? [
					QUALITY_CARD_TEXTS.changed.replace('{counted}', () =>
						counted({ count: listed.sharedExports.length, noun: QUALITY_CARD_TEXTS.sharedExports }),
					),
				]
			: []),
		...(listed.docs.length
			? [
					QUALITY_BODY_TEXTS.docsCount.replace('{counted}', () =>
						counted({ count: listed.docs.length, noun: QUALITY_CARD_TEXTS.docs }),
					),
				]
			: []),
		...(allowed ? [QUALITY_CARD_TEXTS.allowed.replace('{count}', String(allowed))] : []),
	]
	return QUALITY_BODY_TEXTS.judged
		.replace('{counts}', () =>
			counts.length ? counts.join(DETAIL_SEPARATOR) : QUALITY_CARD_TEXTS.nothing,
		)
		.replace('{short}', () => shortOf(quality))
}

/**
 * The findings the body lists: those no opt-out silenced, the docs ones only those at a source line (a removed entry
 * is a note, shown once as the note).
 */
function listedOf(quality: JudgedQuality): QualityLists & QualityDocs {
	return {
		duplicates: quality.duplicates.filter((finding) => !finding.allowed),
		sharedExports: quality.sharedExports.filter((finding) => !finding.allowed),
		docs: quality.docs.filter((finding) => !finding.allowed && isDocsFinding(finding)),
	}
}

/**
 * One line per listed finding, at most ten per kind then how many more (the docs ones first, marked failed), then
 * one per note.
 */
function listedLinesOf(quality: JudgedQuality): QualityBodyLine[] {
	const listed = listedOf(quality)
	const short = shortOf(quality)
	return [
		...cappedLines({
			findings: listed.docs,
			short,
			lineOf: (finding) => ({
				record: declaredPlaceOf(finding.declaredAt)?.file ?? QUALITY_PIECE_NOTES,
				text: findingLine({
					failed: true,
					place: finding.declaredAt,
					message: docsMessageOf(finding),
				}),
			}),
		}),
		...cappedLines({
			findings: listed.duplicates,
			short,
			lineOf: (finding) => ({
				record: finding.file,
				text: findingLine({
					place: `${finding.file}:${finding.line}`,
					message: duplicateMessageOf(finding),
				}),
			}),
		}),
		...cappedLines({
			findings: listed.sharedExports,
			short,
			lineOf: (finding) => ({
				record: finding.file,
				text: findingLine({
					place: `${finding.file}:${finding.line}`,
					message: sharedExportMessageOf(finding),
				}),
			}),
		}),
		...quality.notes.map((note) => ({
			record: QUALITY_PIECE_NOTES,
			text: findingLine({ place: undefined, message: note }),
		})),
	]
}

/** The lines of one kind, capped as the card caps them, the line saying how many more last. */
function cappedLines<Finding>(params: {
	findings: readonly Finding[]
	short: string
	lineOf: (finding: Finding) => QualityBodyLine
}): QualityBodyLine[] {
	const { shown, more } = capFindings(params)
	return [
		...shown.map(params.lineOf),
		...(more === undefined
			? []
			: [{ record: QUALITY_PIECE_NOTES, text: findingLine({ place: undefined, message: more }) }]),
	]
}

/** The body's base as a short commit. */
function shortOf(quality: JudgedQuality): string {
	return quality.base.commit.slice(0, SHORT_SHA_LENGTH)
}

/** A list line: `✗` for a failed finding, the finding's place, then its message. */
function findingLine(params: {
	failed?: boolean
	place: string | undefined
	message: string
}): string {
	const place =
		params.place === undefined
			? ''
			: QUALITY_BODY_TEXTS.place.replace('{place}', () => params.place ?? '')
	return QUALITY_BODY_TEXTS.finding
		.replace('{mark}', () => (params.failed ? QUALITY_BODY_TEXTS.failed : ''))
		.replace('{place}', () => place)
		.replace('{message}', () => params.message)
}
