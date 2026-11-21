/**
 * The hand-over card's quality row and section, from where the last base-aware record stands: the counts to read, a
 * public export left without docs (failed), a record of another tree, or never run. Never stale: a record of another
 * tree is a warning that blocks nothing and counts nothing.
 */
import { counted } from '../counted.ts'
import { DETAIL_SEPARATOR, NEVER_RUN_DETAIL } from '../gate-records/gate-records.constants.ts'
import { TO_READ_MARK } from '../handover/handover.constants.ts'
import {
	docsMessageOf,
	duplicateMessageOf,
	isDocsFinding,
	sharedExportMessageOf,
} from './quality-wording.ts'
import {
	QUALITY_CARD_MAX_LINES,
	QUALITY_CARD_NAME,
	QUALITY_CARD_TEXTS,
} from './quality.constants.ts'

import type { CardLine } from '../card/card.types.ts'
import type { CardGateLine } from '../gate-records/gate-records.types.ts'
import type {
	QualityDocs,
	QualityLists,
	QualityStanding,
	RecordedFinding,
} from './quality.types.ts'

/**
 * The card's `quality` row for `standing`, the record's base shown as `short`.
 *
 * @intent show on the card what the base-aware rules found on this tree
 * @internal
 */
export function buildQualityLine(params: {
	standing: QualityStanding
	short: string
}): CardGateLine {
	const { lists, docs } = params.standing
	if (lists.kind !== 'current' && docs.kind !== 'current')
		return {
			name: QUALITY_CARD_NAME,
			status: 'warning',
			detail:
				lists.kind === 'none' && docs.kind === 'none'
					? NEVER_RUN_DETAIL
					: QUALITY_CARD_TEXTS.otherTree,
		}
	const shown = shownOf(params.standing)
	const toRead = [
		...(shown.duplicates.length
			? [counted({ count: shown.duplicates.length, noun: QUALITY_CARD_TEXTS.duplicates })]
			: []),
		...(shown.sharedExports.length
			? [
					QUALITY_CARD_TEXTS.changed.replace('{counted}', () =>
						counted({ count: shown.sharedExports.length, noun: QUALITY_CARD_TEXTS.sharedExports }),
					),
				]
			: []),
	]
	const allowed = allowedCountOf(params.standing)
	const parts = [
		...(shown.docs.length
			? [
					QUALITY_CARD_TEXTS.withoutDocs
						.replace('{counted}', () =>
							counted({ count: shown.docs.length, noun: QUALITY_CARD_TEXTS.docs }),
						)
						.replace('{routes}', () => shown.docs.map((finding) => finding.route).join(', ')),
				]
			: []),
		...listsPartOf({ standing: params.standing, toRead, short: params.short }),
		...(allowed ? [QUALITY_CARD_TEXTS.allowed.replace('{count}', String(allowed))] : []),
		...(docs.kind === 'none' ? [QUALITY_CARD_TEXTS.docsNever] : []),
		...(docs.kind === 'other-tree' ? [QUALITY_CARD_TEXTS.docsOtherTree] : []),
		...(docs.kind === 'current' && docs.notJudged !== undefined
			? [QUALITY_CARD_TEXTS.docsNotJudged.replace('{why}', () => docs.notJudged ?? '')]
			: []),
	]
	const detail = parts.length ? parts.join(DETAIL_SEPARATOR) : QUALITY_CARD_TEXTS.nothing
	const status = shown.docs.length
		? 'failed'
		: toRead.length ||
			  lists.kind !== 'current' ||
			  docs.kind !== 'current' ||
			  docs.notJudged !== undefined
			? 'warning'
			: 'passed'
	return { name: QUALITY_CARD_NAME, status, detail }
}

/**
 * The row's part of the lists: the counts to read, a `--base` record's base after them (`nothing found` before it
 * when there is nothing to read); the lists of another tree said so; none for current lists with nothing to read.
 */
function listsPartOf(params: {
	standing: QualityStanding
	toRead: readonly string[]
	short: string
}): string[] {
	const { lists } = params.standing
	if (lists.kind !== 'current') return [QUALITY_CARD_TEXTS.listsOtherTree]
	const counts = params.toRead.length
		? `${params.toRead.join(DETAIL_SEPARATOR)} (${TO_READ_MARK})`
		: undefined
	if (lists.base.source !== 'flag') return counts === undefined ? [] : [counts]
	const since = QUALITY_CARD_TEXTS.flag.replace('{short}', () => params.short)
	return [`${counts ?? QUALITY_CARD_TEXTS.nothing} ${since}`]
}

/**
 * The lines of the card's `quality` section for `standing`: the findings not opted out, at most ten per kind, then
 * how many more and the run that lists them all.
 *
 * @intent list on the card the findings a reviewer reads
 * @internal
 */
export function buildQualitySection(params: {
	standing: QualityStanding
	short: string
}): CardLine[] {
	const shown = shownOf(params.standing)
	return [
		...kindLines({
			findings: shown.docs,
			short: params.short,
			lineOf: (finding) =>
				placedLine({ place: finding.declaredAt, message: docsMessageOf(finding) }),
		}),
		...kindLines({
			findings: shown.duplicates,
			short: params.short,
			lineOf: (finding) =>
				placedLine({
					place: `${finding.file}:${finding.line}`,
					message: duplicateMessageOf(finding),
				}),
		}),
		...kindLines({
			findings: shown.sharedExports,
			short: params.short,
			lineOf: (finding) =>
				placedLine({
					place: `${finding.file}:${finding.line}`,
					message: sharedExportMessageOf(finding),
				}),
		}),
	]
}

/** The findings of the current parts of `standing` no opt-out silenced; none of a part not current. */
function shownOf(standing: QualityStanding): QualityLists & QualityDocs {
	const { lists, docs } = standing
	return {
		duplicates: lists.kind === 'current' ? lists.duplicates.filter(isShown) : [],
		sharedExports: lists.kind === 'current' ? lists.sharedExports.filter(isShown) : [],
		// a removed entry is a note of the run, never a docs finding: it neither fails the row nor counts
		docs:
			docs.kind === 'current'
				? docs.docs.filter((finding) => isShown(finding) && isDocsFinding(finding))
				: [],
	}
}

/** How many findings of the current parts of `standing` an opt-out silenced. */
function allowedCountOf(standing: QualityStanding): number {
	const { lists, docs } = standing
	const findings: RecordedFinding<unknown>[] = [
		...(lists.kind === 'current' ? [...lists.duplicates, ...lists.sharedExports] : []),
		...(docs.kind === 'current' ? docs.docs : []),
	]
	return findings.filter((finding) => finding.allowed).length
}

function isShown(finding: RecordedFinding<unknown>): boolean {
	return !finding.allowed
}

/**
 * The findings of one kind a list shows: at most ten, then the line saying how many more and the run that lists
 * them all (undefined within the cap). The card and the pull request body cap their lists the same way.
 *
 * @intent keep a list of base-aware findings short wherever it is shown
 * @internal
 */
export function capFindings<Finding>(params: { findings: readonly Finding[]; short: string }): {
	shown: Finding[]
	more: string | undefined
} {
	const more = params.findings.length - QUALITY_CARD_MAX_LINES
	return {
		shown: params.findings.slice(0, QUALITY_CARD_MAX_LINES),
		more:
			more > 0
				? QUALITY_CARD_TEXTS.more
						.replace('{count}', String(more))
						.replace('{short}', () => params.short)
				: undefined,
	}
}

/**
 * How many findings the card's `quality` section lists to read: those of the current parts no opt-out silenced, all
 * of them (the lines past the cap included, never the line saying how many more).
 *
 * @intent count the quality findings among what a reviewer reads on the card
 * @internal
 */
export function qualityToReadCount(standing: QualityStanding): number {
	const shown = shownOf(standing)
	return shown.duplicates.length + shown.sharedExports.length + shown.docs.length
}

/** The lines of one kind: at most ten, then how many more. */
function kindLines<Finding>(params: {
	findings: readonly Finding[]
	short: string
	lineOf: (finding: Finding) => CardLine
}): CardLine[] {
	const { shown, more } = capFindings(params)
	return [...shown.map(params.lineOf), ...(more === undefined ? [] : [{ text: more, hang: 0 }])]
}

/** A finding's line: its place, then its message under which a wrap hangs; the message alone with no place. */
function placedLine(params: { place: string | undefined; message: string }): CardLine {
	const lead =
		params.place === undefined
			? ''
			: QUALITY_CARD_TEXTS.place.replace('{place}', () => params.place ?? '')
	return { text: `${lead}${params.message}`, hang: lead.length }
}
