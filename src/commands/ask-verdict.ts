/**
 * `dialecte ask verdict <ask-id> <report.json>...`: checks the readers' reports of the open round, claims their
 * nonces, writes the round's `verdict.json`, and on an agreed answer records the fact (section 8, D6, D7, D14).
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { writeAcceptedReports } from '../lib/knowledge/ask/accepted-reports-file.ts'
import { claimAsk } from '../lib/knowledge/ask/ask-claim.ts'
import { askFolderOf } from '../lib/knowledge/ask/ask-folder-of.ts'
import { askRoundsOf } from '../lib/knowledge/ask/ask-rounds-of.ts'
import {
	ACCEPTED_REPORTS_FILE,
	ANSWER_RECORD_FILE,
	ASK_ID_PATTERN,
	ROUND_CLAIM_FILE,
	ROUND_CLAIM_STALE_MS,
	VERDICT_RECORD_FILE,
} from '../lib/knowledge/ask/ask.constants.ts'
import { claimFile, claimHolderOf, releaseClaim } from '../lib/knowledge/ask/claim-file.ts'
import { lotHomeOf } from '../lib/knowledge/ask/lot-home-of.ts'
import { personRouteNextOf } from '../lib/knowledge/ask/raise-ask-question.ts'
import { readAskRequest } from '../lib/knowledge/ask/read-ask-request.ts'
import {
	removeAnsweringMarker,
	writeAnsweringMarker,
} from '../lib/knowledge/ask/recorded-fact-of-ask.ts'
import { rewriteLotNote } from '../lib/knowledge/ask/write-standard-note.ts'
import { fillMessage } from '../lib/knowledge/standard/fill-message.ts'
import { endedOf, jsonOf, textOf } from '../lib/print/print.ts'
import { publishOnce, recordText, replaceWhole } from '../lib/store/publish.ts'
import { askVerbRefused } from './ask-refused.ts'
import { reaskOutcomeOf, recordedAnswerOf } from './ask-verdict-answer.ts'
import {
	acceptedOf,
	checkedReportsOf,
	claimedReportsOf,
	declaredMissingOf,
	missingLettersOf,
	ownNoncesOf,
	verdictOutcomeOf,
	verdictSetupOf,
} from './ask-verdict-check.ts'
import {
	handoffLinesOf,
	printedReportOf,
	reportLineOf,
	verdictReportOf,
	writeVerdictEvents,
} from './ask-verdict-record.ts'
import { verdictOptionsOf, verdictRoundOf } from './ask-verdict-round.ts'
import {
	FOREIGN_REFUSALS,
	VERDICT_EXIT_CODES,
	VERDICT_JSON_SCHEMA,
	VERDICT_MESSAGES,
	VERDICT_NEXT_COMMANDS,
	VERDICT_STATES,
	VERDICT_USAGE_START,
} from './ask.constants.ts'

import type { CommandOutput } from '../lib/command-output.types.ts'
import type {
	AcceptedReport,
	AskFolder,
	AskState,
	RoundOutcome,
	VerdictRecord,
} from '../lib/knowledge/ask/ask.types.ts'
import type {
	AskVerdictJson,
	CheckedReportFile,
	RecordedAnswer,
	RunAskVerdictParams,
	VerdictOptions,
	VerdictRound,
	VerdictSetup,
} from './ask.types.ts'

/**
 * `dialecte ask verdict <ask-id> <report.json>... [--adjudicator] [--lot <id|folder>] [--json]` (the command line is
 * what follows `verdict`). Exit 0 answered, 1 the person next, 2 usage or a refusal (nothing recorded), 3 another
 * round or the adjudicator next.
 */
export async function runAskVerdict(params: RunAskVerdictParams): Promise<CommandOutput> {
	const environment = params.environment ?? process.env
	const options = verdictOptionsOf({ argv: params.argv })
	if ('usage' in options) return refused({ message: options.usage, usage: true })
	const place = askFolderOf({ cwd: params.cwd, lot: options.lot, environment })
	if ('refused' in place) return refused({ message: place.refused })
	const first = openRoundOf({ place, options })
	if ('refused' in first)
		// a round closed at the person whose question was never raised gets it now (D55), then is refused
		return (
			closedPersonRound({ place, options, now: params.now }) ?? refused({ message: first.refused })
		)
	// one run at a time on a round (K3-c): claimed before any nonce is claimed or fact recorded
	const claim = join(first.round.folder, ROUND_CLAIM_FILE)
	if (!claimFile({ path: claim, staleMs: ROUND_CLAIM_STALE_MS }))
		return roundInProgress({ ask: first.ask, round: first.round.round, claim })
	try {
		// one claim on the ask (R1-6): a verdict and a person's answer never both record
		const askClaim = claimAsk({ ask: first.ask, askFolder: first.askFolder })
		if ('refused' in askClaim) return refused({ message: askClaim.refused })
		try {
			return await verdictUnderClaims({ run: params, environment, options, place })
		} finally {
			releaseClaim({ path: askClaim.claim })
		}
	} finally {
		releaseClaim({ path: claim })
	}
}

/** The verdict once this run holds the round's claim and the ask's: the round read again, then checked and closed. */
async function verdictUnderClaims(params: {
	run: RunAskVerdictParams
	environment: NodeJS.ProcessEnv
	options: VerdictOptions
	place: AskFolder
}): Promise<CommandOutput> {
	const { run, options, place } = params
	await run.afterClaim?.()
	// read again under the claims: a run that ended meanwhile may have closed the round
	const opened = openRoundOf({ place, options })
	if ('refused' in opened) return refused({ message: opened.refused })
	return claimedVerdict({ run, environment: params.environment, options, place, opened })
}

/**
 * A re-run on a round closed at needs-person in a store lot (D55: a crash between verdict.json and the raise): the
 * person's question raised when none is open for the ask (`raiseAskQuestion` reuses an open one), and the round's
 * `next` written back as its lot answer. Records nothing else; false when the ask is not such a round.
 */
function closedPersonRound(params: {
	place: AskFolder
	options: VerdictOptions
	now: (() => Date) | undefined
}): CommandOutput | undefined {
	const { place, options } = params
	const { lotFolder, lotName } = place
	if (lotFolder === null || lotName === null) return undefined
	const askFolder = join(place.folder, options.ask)
	if (!ASK_ID_PATTERN.test(options.ask) || existsSync(join(askFolder, ANSWER_RECORD_FILE)))
		return undefined
	const rounds = askRoundsOf({ askFolder })
	const latest = 'refused' in rounds ? undefined : rounds.rounds.at(-1)
	const request = readAskRequest({ askFolder })
	const verdict = latest?.verdict
	if (latest === undefined || verdict?.state !== 'needs-person' || !('request' in request))
		return undefined
	// under the round's claim (J-14): a run that holds it is in progress, nothing raised
	const claim = join(latest.folder, ROUND_CLAIM_FILE)
	if (!claimFile({ path: claim, staleMs: ROUND_CLAIM_STALE_MS }))
		return roundInProgress({ ask: options.ask, round: latest.round, claim })
	try {
		const path = join(latest.folder, VERDICT_RECORD_FILE)
		const next = personRouteNextOf({
			lotFolder,
			lotName,
			ask: options.ask,
			question: request.request.question,
			verdictPath: path,
			now: params.now,
		})
		if (next !== null && verdict.next !== next)
			replaceWhole({ path, text: recordText({ ...verdict, next }) })
	} finally {
		releaseClaim({ path: claim })
	}
	const again = openRoundOf({ place, options })
	return 'refused' in again ? refused({ message: again.refused }) : undefined
}

/** The ask's round open for reports, as the command line asks it. */
function openRoundOf(params: {
	place: AskFolder
	options: VerdictOptions
}): VerdictRound | { refused: string } {
	return verdictRoundOf({
		asksFolder: params.place.folder,
		ask: params.options.ask,
		adjudicator: params.options.adjudicator,
	})
}

/** The verdict of a round this run holds the claim of: the reports checked, the round closed, the lot told. */
async function claimedVerdict(params: {
	run: RunAskVerdictParams
	environment: NodeJS.ProcessEnv
	options: VerdictOptions
	place: AskFolder
	opened: VerdictRound
}): Promise<CommandOutput> {
	const { run, environment, options, place, opened } = params
	const { cwd, reindexPool } = run
	const setup = await verdictSetupOf({ cwd, environment, opened, reindexPool })
	if ('refused' in setup) return refused({ message: setup.refused, exitCode: setup.exitCode })

	// the nonces an earlier run of the round claimed under its marker are this run's own (R1-4)
	const own = ownNoncesOf({ opened })
	const reports = reportsOfRun({ opened, setup, options, own })
	if ('output' in reports) return reports.output
	const { checked } = reports
	// the round's marker before any nonce is claimed, whatever the outcome: a retry finishes the same round (R1-4)
	writeAnsweringMarker({
		roundFolder: opened.round.folder,
		ask: opened.ask,
		round: opened.round.round,
		nonces: acceptedOf({ checked }).map((accepted) => accepted.report.nonce),
	})
	const claimed = claimedReportsOf({ opened, checked, own })
	await run.afterNonces?.()
	const outcomes = verdictOutcomeOf({ opened, setup, checked: claimed })
	const { verifiedAngles } = outcomes
	const outcome = reaskOutcomeOf({ opened, setup, outcome: outcomes.outcome })
	const recorded = recordedOf({ outcome, opened, setup, claimed, place, now: run.now })
	if (recorded.fact !== null) await run.afterFact?.()
	const closed = verdictRecordOf({
		opened,
		claimed,
		outcome,
		verifiedAngles,
		fact: recorded.fact,
		now: run.now ?? setup.setup.now ?? currentTime,
	})
	if (!closedRound({ opened, verdict: closed, claimed }))
		return closedByAnother({ opened, recorded })
	removeAnsweringMarker({ folder: opened.round.folder })
	// the person's question only once the round is closed, never twice for the ask (J-2)
	const verdict = await withPersonQuestion({
		place,
		opened,
		verdict: closed,
		run,
	})
	writeVerdictEvents({
		verdict,
		lot: place.lotName,
		eventsFile: place.eventsFile,
		conflict: recorded.conflict !== null,
		now: run.now,
	})
	await rewriteLotNote({
		lotHome: lotHomeOf({ place, lotGiven: options.lot !== undefined }),
		asksFolder: place.folder,
		now: run.now,
	})
	return verdictOutput({ verdict, conflict: recorded.conflict, json: options.json, opened })
}

/** The fact an answered round records (or finds, recorded by an earlier run); nothing for any other outcome. */
function recordedOf(params: {
	outcome: RoundOutcome
	opened: VerdictRound
	setup: VerdictSetup
	claimed: CheckedReportFile[]
	place: AskFolder
	now: (() => Date) | undefined
}): RecordedAnswer {
	const { outcome } = params
	if (outcome.state !== 'answered') return { fact: null, conflict: null, recordedNow: false }
	return recordedAnswerOf({
		opened: params.opened,
		setup: params.setup,
		agreed: outcome.agreed,
		checked: params.claimed,
		place: params.place,
		now: params.now,
	})
}

/**
 * The reports of the run, each checked, with the readers declared `--missing` (I-12); or the refusal that records
 * nothing: no report of the round, a usage error of `--missing`, a letter with no report file (R1-8).
 */
function reportsOfRun(params: {
	opened: VerdictRound
	setup: VerdictSetup
	options: VerdictOptions
	own: string[]
}): { checked: CheckedReportFile[] } | { output: CommandOutput } {
	const { opened, setup, options, own } = params
	const files = checkedReportsOf({ files: options.files, opened, setup, own })
	// no report of this round (each refused by its schema, its ask or its round): nothing recorded, no nonce claimed
	if (files.length > 0 && files.every(isForeign))
		return { output: noneCounted({ opened, checked: files }) }
	const declared = declaredMissingOf({ opened, checked: files, missing: options.missing })
	if ('usage' in declared) return { output: refused({ message: declared.usage, usage: true }) }
	const checked = [...files, ...declared]
	// one report file per letter the round issued, accepted or refused (R1-8): else nothing recorded
	const missing = missingLettersOf({ opened, checked })
	if (missing !== undefined) return { output: refused({ message: missing }) }
	return { checked }
}

/**
 * A closed round that leaves the ask to the person in a store lot raises its question there (rung 6, once for the
 * ask, J-2), its details pointing to the round's verdict.json (J-3: no reader text), then names the lot answer of
 * that question as `next` (I-7), verdict.json written again with it; elsewhere the verdict is as closed.
 */
async function withPersonQuestion(params: {
	place: AskFolder
	opened: VerdictRound
	verdict: VerdictRecord
	run: RunAskVerdictParams
}): Promise<VerdictRecord> {
	const { place, opened, verdict } = params
	const { lotFolder, lotName } = place
	if (verdict.state !== 'needs-person' || lotFolder === null || lotName === null) return verdict
	const path = join(opened.round.folder, VERDICT_RECORD_FILE)
	const next = personRouteNextOf({
		lotFolder,
		lotName,
		ask: opened.ask,
		question: opened.request.question,
		verdictPath: path,
		now: params.run.now,
	})
	await params.run.afterRaise?.()
	if (next === null) return verdict
	const answered: VerdictRecord = { ...verdict, next }
	// the closed round names the lot answer of its question (I-7): written whole over the verdict just published
	replaceWhole({ path, text: recordText(answered) })
	return answered
}

/**
 * The refusal of a round another run closed first (exit 2): nothing more recorded, or (this run recorded the agreed
 * fact before it found the round closed) the fact named, kept in the ledger.
 */
function closedByAnother(params: {
	opened: VerdictRound
	recorded: RecordedAnswer
}): CommandOutput {
	const { opened, recorded } = params
	const values = { ask: opened.ask, round: String(opened.round.round) }
	if (!recorded.recordedNow || recorded.fact === null)
		return refused({
			message: fillMessage({ template: VERDICT_MESSAGES.closedByAnother, values }),
		})
	return refused({
		message: fillMessage({
			template: VERDICT_MESSAGES.closedByAnotherAfterFact,
			values: { ...values, fact: recorded.fact },
		}),
	})
}

/** The refusal of a round another verdict run holds (exit 2, nothing recorded): the round, the claim, its process. */
function roundInProgress(params: { ask: string; round: number; claim: string }): CommandOutput {
	return refused({
		message: fillMessage({
			template: VERDICT_MESSAGES.roundInProgress,
			values: {
				round: String(params.round),
				ask: params.ask,
				path: params.claim,
				pid: String(claimHolderOf({ path: params.claim })?.pid ?? ''),
				seconds: String(ROUND_CLAIM_STALE_MS / 1000),
			},
		}),
	})
}

/** The round's `verdict.json` (D30): each report, the outcome, the angles verified, the state, what is next. */
function verdictRecordOf(params: {
	opened: VerdictRound
	claimed: CheckedReportFile[]
	outcome: RoundOutcome
	verifiedAngles: string[]
	fact: string | null
	now: () => Date
}): VerdictRecord {
	const { opened, outcome } = params
	const state: AskState = VERDICT_STATES[outcome.state]
	return {
		schema: 1,
		ask: opened.ask,
		round: opened.round.round,
		adjudicator: opened.adjudicator !== null,
		reports: params.claimed.map(verdictReportOf),
		outcome,
		verifiedAngles: params.verifiedAngles,
		state,
		next: nextOf({ ask: opened.ask, state }),
		fact: params.fact,
		at: params.now().toISOString(),
	}
}

/**
 * Closes the round: a round closed for the adjudicator keeps its accepted reports (D38), then `verdict.json` is
 * published once (never over another run's); false when another run closed the round first.
 */
function closedRound(params: {
	opened: VerdictRound
	verdict: VerdictRecord
	claimed: CheckedReportFile[]
}): boolean {
	const { opened, verdict } = params
	if (verdict.outcome.state === 'needs-adjudicator')
		keepAcceptedReports({ opened, reports: acceptedOf({ checked: params.claimed }) })
	return publishOnce({
		path: join(opened.round.folder, VERDICT_RECORD_FILE),
		text: recordText(verdict),
		readOnly: false,
	})
}

/**
 * Keeps the accepted reports of a round closed for the adjudicator (D38); an `accepted.json` an earlier run wrote is
 * never replaced by an empty list (R1-4: a retry keeps what was kept).
 */
function keepAcceptedReports(params: { opened: VerdictRound; reports: AcceptedReport[] }): void {
	const { opened, reports } = params
	const folder = opened.round.folder
	if (reports.length === 0 && existsSync(join(folder, ACCEPTED_REPORTS_FILE))) return
	writeAcceptedReports({ folder, ask: opened.ask, round: opened.round.round, reports })
}

/** A report refused as no report of this round: its schema, its ask or its round. */
function isForeign(entry: CheckedReportFile): boolean {
	const { checked } = entry
	return !checked.accepted && FOREIGN_REFUSALS.some((refusal) => refusal === checked.refused)
}

/** The refusal of a run none of whose reports is of the round (exit 2): each named with its reason and faults. */
function noneCounted(params: {
	opened: VerdictRound
	checked: CheckedReportFile[]
}): CommandOutput {
	const { opened } = params
	return refused({
		message: [
			fillMessage({
				template: VERDICT_MESSAGES.noneCounted,
				values: { ask: opened.ask, round: String(opened.round.round) },
			}),
			...params.checked.map(verdictReportOf).map(reportLineOf),
		].join('\n'),
	})
}

/** What the ask runs next in a state: nothing answered, the pack (another round, the adjudicator), else a person. */
function nextOf(params: { ask: string; state: AskState }): string | null {
	const { ask, state } = params
	if (state === 'answered') return null
	const template =
		state === 'needs-person' ? VERDICT_NEXT_COMMANDS.answer : VERDICT_NEXT_COMMANDS.pack
	return fillMessage({ template, values: { ask } })
}

/**
 * The answer of a verdict: its `--json` (schema 1, the reason of the state: null once answered, I-15), or the state,
 * each report, the fact, the hand-off lines of a round handed to the person (I-5) and what is next.
 */
function verdictOutput(params: {
	verdict: VerdictRecord
	conflict: AskVerdictJson['conflict']
	json: boolean
	opened: VerdictRound
}): CommandOutput {
	const { verdict } = params
	const outcome = verdict.outcome
	const exitCode = VERDICT_EXIT_CODES[verdict.state]
	const answer: AskVerdictJson = {
		schema: VERDICT_JSON_SCHEMA,
		ask: verdict.ask,
		round: verdict.round,
		state: verdict.state,
		reason: outcome.state === 'answered' ? null : outcome.reason,
		reports: verdict.reports.map(printedReportOf),
		fact: verdict.fact,
		conflict: params.conflict,
		next: verdict.next,
	}
	if (params.json) return { output: endedOf(jsonOf(answer, '\t')), exitCode }
	const reason =
		outcome.state === 'answered'
			? fillMessage({
					template: VERDICT_MESSAGES.answeredReason,
					values: { text: outcome.agreed.answer },
				})
			: outcome.reason
	return {
		output: textOf([
			fillMessage({
				template: VERDICT_MESSAGES.stateLine,
				values: { state: verdict.state, ask: verdict.ask, round: String(verdict.round), reason },
			}),
			...verdict.reports.map(reportLineOf),
			...(verdict.state === 'needs-person'
				? handoffLinesOf({ opened: params.opened, verdict })
				: []),
			...(verdict.fact === null
				? []
				: [fillMessage({ template: VERDICT_MESSAGES.fact, values: { fact: verdict.fact } })]),
			...(verdict.next === null
				? []
				: [fillMessage({ template: VERDICT_MESSAGES.next, values: { next: verdict.next } })]),
			'',
		]),
		exitCode,
	}
}

/** The clock of a real verdict. */
function currentTime(): Date {
	return new Date()
}

/** A refusal: `ask: <message>`, the verdict's usage line after it for a usage error; exit 2 unless told. */
function refused(params: {
	message: string
	usage?: boolean
	exitCode?: CommandOutput['exitCode']
}): CommandOutput {
	return askVerbRefused({
		message: params.message,
		...(params.usage === true ? { usageStart: VERDICT_USAGE_START } : {}),
		...(params.exitCode === undefined ? {} : { exitCode: params.exitCode }),
	})
}
