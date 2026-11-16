/**
 * What `ask verdict` keeps of each report and tells about the round: its entry in `verdict.json` (I-5, I-11), its
 * line in the text answer, what `--json` prints of it (R2-3), the hand-off lines a person gets (I-5) and the round's
 * events (I-9).
 */
import { askStateEventOf } from '../lib/knowledge/ask/ask-state-event-of.ts'
import { askFactEventOf, askVerdictEventOf } from '../lib/knowledge/ask/ask-step-events-of.ts'
import { reportBodyHashOf } from '../lib/knowledge/ask/report-body-of.ts'
import { writeAskEvent } from '../lib/knowledge/ask/write-ask-event.ts'
import { fillMessage } from '../lib/knowledge/standard/fill-message.ts'
import { printLines } from '../lib/print/print.ts'
import {
	HANDOFF_LINES,
	HANDOFF_NONE,
	HANDOFF_RANGE,
	HANDOFF_SEPARATOR,
	VERDICT_MESSAGES,
} from './ask.constants.ts'

import type { LotEvent } from '../lib/events/event.types.ts'
import type {
	CheckedClaim,
	VerdictClaim,
	VerdictRecord,
	VerdictReport,
} from '../lib/knowledge/ask/ask.types.ts'
import type { CheckedReportFile, VerdictRound } from './ask.types.ts'

/**
 * One report as the verdict keeps it: accepted (its claims' checks, a claim reading a poor block flagged, its session
 * and body hash, what the reader said, read and did not find) or refused (the reason, the faults; a reader declared
 * `--missing` named by its letter).
 */
export function verdictReportOf(entry: CheckedReportFile): VerdictReport {
	const { checked } = entry
	if (!checked.accepted)
		return {
			file: entry.file,
			accepted: false,
			refused: checked.refused,
			faults: checked.faults,
			...(checked.refused === 'missing' ? { letter: entry.letter } : {}),
		}
	const { report } = checked
	return {
		letter: entry.letter,
		accepted: true,
		claims: checked.claims.map(verdictClaimOf),
		// kept for the uniqueness checks of the ask's later rounds (R1-7)
		session: report.session,
		bodyHash: reportBodyHashOf({ report }),
		answer: report.answer,
		familiesRead: report.familiesRead,
		notFound: report.notFound,
		notKnown: checked.notKnown,
	}
}

/** A claim as the verdict keeps it; `quality: 'poor'` when one of its verified cites reads a poor block (I-11). */
function verdictClaimOf(claim: CheckedClaim): VerdictClaim {
	const poor = claim.cites.some((cite) => cite.verified && cite.slice.quality === 'poor')
	return {
		verified: claim.verified,
		refused: claim.refused,
		polarityConflict: claim.polarityConflict,
		...(claim.verified && poor ? { quality: 'poor' as const } : {}),
	}
}

/** A report as `--json` prints it (R2-3): its claims, never the session, the body hash or what the reader wrote. */
export function printedReportOf(report: VerdictReport): VerdictReport {
	if (!report.accepted) return report
	return { letter: report.letter, accepted: true, claims: report.claims }
}

/** One report's line in the text answer. */
export function reportLineOf(report: VerdictReport): string {
	if (!report.accepted)
		return fillMessage({
			template: VERDICT_MESSAGES.refusedReport,
			values: {
				file: report.letter ?? report.file,
				refused: report.refused,
				faults: report.faults.join(VERDICT_MESSAGES.faultSeparator),
			},
		})
	return fillMessage({
		template: VERDICT_MESSAGES.acceptedReport,
		values: {
			letter: report.letter,
			verified: String(report.claims.filter((claim) => claim.verified).length),
			claims: String(report.claims.length),
		},
	})
}

/**
 * What a person gets of a round that hands the ask over (I-5, 32b, 32h): the angles the ask searched, the slices each
 * reader read, then each accepted reader's verdict, what it said and what it did not find (or that it did not know).
 * Never a quote.
 */
export function handoffLinesOf(params: { opened: VerdictRound; verdict: VerdictRecord }): string[] {
	const { opened, verdict } = params
	// angles by their terms, slices as file:from-to of the ranges the pack recorded (J-8)
	const angles = [...new Set(opened.record.angles.flatMap((angle) => angle.terms))]
	const read = (opened.pack?.readers ?? []).map((reader) =>
		fillMessage({
			template: HANDOFF_LINES.readerSlices,
			values: {
				letter: reader.letter,
				slices: listOf(
					reader.ranges.map((range) =>
						fillMessage({
							template: HANDOFF_RANGE,
							values: { file: range.file, from: String(range.from), to: String(range.to) },
						}),
					),
				),
			},
		}),
	)
	const said = verdict.reports.flatMap(function saidOf(report): string[] {
		if (!report.accepted) return []
		return [
			fillMessage({
				template: report.notKnown === true ? HANDOFF_LINES.notKnown : HANDOFF_LINES.said,
				values: {
					letter: report.letter,
					answer: report.answer ?? '',
					notFound: listOf(report.notFound ?? []),
				},
			}),
		]
	})
	return [
		fillMessage({ template: HANDOFF_LINES.angles, values: { angles: listOf(angles) } }),
		...read,
		...said,
	]
}

/** Names joined, or the word for none. */
function listOf(names: string[]): string {
	return names.length === 0 ? HANDOFF_NONE : names.join(HANDOFF_SEPARATOR)
}

/**
 * Writes the round's events (I-9): `ask.state`, `ask.verdict` (the reports counted, never their text) and, on a fact
 * recorded, `ask.fact`; a write that fails prints its line on standard error (the exit is kept).
 */
export function writeVerdictEvents(params: {
	verdict: VerdictRecord
	lot: string | null
	eventsFile: string
	conflict: boolean
	now: (() => Date) | undefined
}): void {
	const { verdict, lot, now } = params
	const rung = verdict.adjudicator ? 5 : 4
	const outcome = verdict.outcome
	const events: LotEvent[] = [
		askStateEventOf({
			ask: verdict.ask,
			lot,
			state: verdict.state,
			rung,
			conflict: params.conflict,
			now,
		}),
		askVerdictEventOf({
			ask: verdict.ask,
			lot,
			round: verdict.round,
			state: verdict.state,
			reason: outcome.state === 'answered' ? null : outcome.reason,
			accepted: verdict.reports.filter((report) => report.accepted).length,
			refused: refusedCountsOf({ reports: verdict.reports }),
			polarityConflicts: verdict.reports
				.flatMap((report) => (report.accepted ? report.claims : []))
				.filter((claim) => claim.polarityConflict).length,
			adjudicator: verdict.adjudicator,
			now,
		}),
		...(verdict.fact === null
			? []
			: [askFactEventOf({ ask: verdict.ask, lot, fact: verdict.fact, rung, now })]),
	]
	for (const event of events) {
		const failure = writeAskEvent({ file: params.eventsFile, event })
		if (failure !== undefined) printLines({ stream: 'stderr', lines: [failure] })
	}
}

/** The refused reports counted by reason. */
function refusedCountsOf(params: { reports: VerdictReport[] }): Record<string, number> {
	const counts: Record<string, number> = {}
	for (const report of params.reports)
		if (!report.accepted) counts[report.refused] = (counts[report.refused] ?? 0) + 1
	return counts
}
