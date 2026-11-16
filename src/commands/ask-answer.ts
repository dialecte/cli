/**
 * `dialecte ask answer <ask-id> <text> --by <who> [--cite <file>:<from>-<to> --quote "<q>"] [--lot <id|folder>]
 * [--json]`: the person's answer (rung 6), recorded as a person fact and an `answer.json`.
 */
import { claimAsk } from '../lib/knowledge/ask/ask-claim.ts'
import { askFolderOf } from '../lib/knowledge/ask/ask-folder-of.ts'
import { askPoolOf } from '../lib/knowledge/ask/ask-pool-of.ts'
import { askRoundsOf } from '../lib/knowledge/ask/ask-rounds-of.ts'
import { askStateEventOf } from '../lib/knowledge/ask/ask-state-event-of.ts'
import { askAnswerEventOf } from '../lib/knowledge/ask/ask-step-events-of.ts'
import {
	ANSWERED_STATE,
	NAME_SEPARATOR,
	PERSON_ANSWER_VERDICTS,
	PERSON_RUNG,
} from '../lib/knowledge/ask/ask.constants.ts'
import { checkCite } from '../lib/knowledge/ask/check-cite.ts'
import { releaseClaim } from '../lib/knowledge/ask/claim-file.ts'
import { lotHomeOf } from '../lib/knowledge/ask/lot-home-of.ts'
import {
	personAnswerTargetOf,
	publishPersonAnswer,
	recordPersonFact,
} from '../lib/knowledge/ask/person-answer.ts'
import { rangeTextOf } from '../lib/knowledge/ask/range-text-of.ts'
import { readerMissOf } from '../lib/knowledge/ask/reader-miss-of.ts'
import { writeAskEvent } from '../lib/knowledge/ask/write-ask-event.ts'
import { rewriteLotNote } from '../lib/knowledge/ask/write-standard-note.ts'
import { fillMessage } from '../lib/knowledge/standard/fill-message.ts'
import { endedOf, jsonOf, printLines, textOf } from '../lib/print/print.ts'
import { readArguments } from '../lib/review-rounds/round-arguments.ts'
import { askVerbRefused } from './ask-refused.ts'
import {
	ANSWER_CITE_PATTERN,
	ANSWER_FLAGS,
	ANSWER_JSON_SCHEMA,
	ANSWER_MESSAGES,
	ANSWER_USAGE_START,
	ANSWER_VALUE_OPTIONS,
	FILE_CHANGED_REFUSAL,
} from './ask.constants.ts'

import type { CommandOutput } from '../lib/command-output.types.ts'
import type {
	AskFolder,
	AskPool,
	CiteContext,
	PackRecord,
	PersonAnswerTarget,
	RangeText,
	PersonAnswerVerdict,
	ReaderMiss,
	RecordedPersonAnswer,
	ReportCite,
} from '../lib/knowledge/ask/ask.types.ts'
import type {
	AnswerCiteCheck,
	AnswerOptions,
	AskAnswerJson,
	RunAskAnswerParams,
} from './ask.types.ts'

/** Records the person's answer to an ask; exit 0 recorded, 2 usage or a refusal (nothing recorded). */
export async function runAskAnswer(params: RunAskAnswerParams): Promise<CommandOutput> {
	const environment = params.environment ?? process.env
	const options = answerOptionsOf({ argv: params.argv })
	if ('usage' in options) return refused({ message: options.usage, usage: true })
	const place = askFolderOf({ cwd: params.cwd, lot: options.lot, environment })
	if ('refused' in place) return refused({ message: place.refused })
	const target = personAnswerTargetOf({ asksFolder: place.folder, ask: options.ask })
	if ('refused' in target) return refused({ message: target.refused })
	const checked = await citeCheckOf({ cwd: params.cwd, environment, target, cite: options.cite })
	if ('refused' in checked) return refused({ message: checked.refused, exitCode: checked.exitCode })
	// one claim on the ask (R1-6): a verdict and an answer never both record
	const claim = claimAsk({ ask: target.ask, askFolder: target.askFolder })
	if ('refused' in claim) return refused({ message: claim.refused })
	let recorded: RecordedPersonAnswer
	try {
		recorded = await answeredUnderClaim({ run: params, options, place, checked, environment })
	} finally {
		releaseClaim({ path: claim.claim })
	}
	if ('refused' in recorded) return refused({ message: recorded.refused })
	writeAnswerEvent({ place, ask: target.ask, checked, now: params.now })
	await rewriteLotNote({
		lotHome: lotHomeOf({ place, lotGiven: options.lot !== undefined }),
		asksFolder: place.folder,
		now: params.now,
	})
	const json: AskAnswerJson = {
		schema: ANSWER_JSON_SCHEMA,
		ask: target.ask,
		fact: recorded.fact,
		miss: checked.miss,
		citeRefused: checked.citeRefused,
	}
	if (options.json) return { output: endedOf(jsonOf(json, '\t')), exitCode: 0 }
	return { output: textOf([...answerLinesOf({ json, by: options.by }), '']), exitCode: 0 }
}

/**
 * The person's answer recorded while this run holds the ask's claim: the ask read again (another run may have answered
 * it), the fact recorded (or found, an earlier run's), the `afterFact` seam awaited, then `answer.json` published.
 */
async function answeredUnderClaim(params: {
	run: RunAskAnswerParams
	options: AnswerOptions
	place: AskFolder
	checked: { citeRefused: string | null; miss: ReaderMiss | null }
	environment: NodeJS.ProcessEnv
}): Promise<RecordedPersonAnswer> {
	const { run, options, checked } = params
	const target = personAnswerTargetOf({ asksFolder: params.place.folder, ask: options.ask })
	if ('refused' in target) return target
	const answer = {
		target,
		text: options.text,
		by: options.by,
		cite: options.cite,
		citeRefused: checked.citeRefused,
		miss: checked.miss,
		environment: params.environment,
		lot: params.place.lotName,
		now: run.now,
		verdict: options.verdict,
	}
	const fact = recordPersonFact(answer)
	if ('refused' in fact) return fact
	await run.afterFact?.()
	return publishPersonAnswer({ ...answer, fact: fact.fact })
}

/**
 * Writes the answer's `ask.answer` event (R1-16): rung 6, the reader miss and the cite's refusal (never the text);
 * a write that fails prints its line on standard error (the exit is kept).
 */
function writeAnswerEvent(params: {
	place: AskFolder
	ask: string
	checked: { citeRefused: string | null; miss: ReaderMiss | null }
	now: (() => Date) | undefined
}): void {
	const lot = params.place.lotName
	const now = params.now === undefined ? {} : { now: params.now }
	const events = [
		askAnswerEventOf({
			ask: params.ask,
			lot,
			miss: params.checked.miss,
			citeRefused: params.checked.citeRefused,
			...now,
		}),
		// the ask's state after the answer (I-9): answered at rung 6
		askStateEventOf({
			ask: params.ask,
			lot,
			state: ANSWERED_STATE,
			rung: PERSON_RUNG,
			conflict: false,
			...now,
		}),
	]
	for (const event of events) {
		const failure = writeAskEvent({ file: params.place.eventsFile, event })
		if (failure !== undefined) printLines({ stream: 'stderr', lines: [failure] })
	}
}

/** The answer's command line read: the ask id, the text, who answers, the cite and the options; or the usage refusal. */
function answerOptionsOf(params: { argv: string[] }): AnswerOptions | { usage: string } {
	const read = readArguments({
		argv: params.argv,
		valueOptions: ANSWER_VALUE_OPTIONS,
		flags: ANSWER_FLAGS,
	})
	if (typeof read === 'string') return { usage: read }
	const [ask, ...words] = read.words
	if (ask === undefined) return { usage: ANSWER_MESSAGES.needsAsk }
	const text = words.join(' ').trim()
	if (text === '')
		return { usage: fillMessage({ template: ANSWER_MESSAGES.needsText, values: { ask } }) }
	const by = read.values.get('by')?.trim()
	if (by === undefined || by === '')
		return { usage: fillMessage({ template: ANSWER_MESSAGES.needsBy, values: { ask } }) }
	const cite = citeOf({ cite: read.values.get('cite'), quote: read.values.get('quote') })
	if (cite !== null && 'usage' in cite) return cite
	const verdict = verdictOf({ verdict: read.values.get('verdict') })
	if (verdict !== null && typeof verdict === 'object') return verdict
	return {
		ask,
		text,
		by,
		cite,
		verdict,
		lot: read.values.get('lot'),
		json: read.flags.has('json'),
	}
}

/** The `--verdict` the person's fact keeps (U19): one of the four, null when not given, or the usage refusal. */
function verdictOf(params: {
	verdict: string | undefined
}): PersonAnswerVerdict | null | { usage: string } {
	const { verdict } = params
	if (verdict === undefined) return null
	const known = PERSON_ANSWER_VERDICTS.find((candidate) => candidate === verdict)
	if (known !== undefined) return known
	return {
		usage: fillMessage({
			template: ANSWER_MESSAGES.badVerdict,
			values: { verdict, verdicts: PERSON_ANSWER_VERDICTS.join(NAME_SEPARATOR) },
		}),
	}
}

/** The `--cite` and `--quote` read as one cite (null when neither is given), or the usage refusal. */
function citeOf(params: {
	cite: string | undefined
	quote: string | undefined
}): ReportCite | { usage: string } | null {
	const { cite, quote } = params
	if (cite === undefined)
		return quote === undefined ? null : { usage: ANSWER_MESSAGES.quoteNeedsCite }
	if (quote === undefined || quote.trim() === '') return { usage: ANSWER_MESSAGES.citeNeedsQuote }
	const groups = ANSWER_CITE_PATTERN.exec(cite)?.groups
	const from = Number(groups?.from)
	const to = Number(groups?.to)
	if (groups?.file === undefined || from < 1 || from > to)
		return { usage: fillMessage({ template: ANSWER_MESSAGES.badCite, values: { cite } }) }
	return { file: groups.file, from, to, quote }
}

/**
 * The person's cite checked as a reader cite (section 7) against the documents the ask read, any line of them
 * allowed, then (verified) the reader miss: given to a reader or not, and the first round (32c). No cite: nothing
 * checked. The refusal of documents that cannot be read as the ask read them (exit 2, or 1 for an aborted build).
 */
async function citeCheckOf(params: {
	cwd: string
	environment: NodeJS.ProcessEnv
	target: PersonAnswerTarget
	cite: ReportCite | null
}): Promise<AnswerCiteCheck> {
	const { target, cite } = params
	if (cite === null) return { citeRefused: null, miss: null }
	const pool = target.request.documents
		? await askPoolOf({
				cwd: params.cwd,
				environment: params.environment,
				request: target.request,
				record: target.record,
			})
		: null
	// a file changed since the ask: the cite cannot be checked as the ask read it, the answer is kept (R1-18)
	if (pool !== null && 'refused' in pool)
		return pool.fileChanged === true ? { citeRefused: FILE_CHANGED_REFUSAL, miss: null } : pool
	const checked = checkCite({ cite, context: wholeDocumentsOf({ target, pool }) })
	if (!checked.verified) return { citeRefused: checked.refused, miss: null }
	const rounds = askRoundsOf({ askFolder: target.askFolder })
	if ('refused' in rounds) return { refused: rounds.refused, exitCode: 2 }
	const packs = rounds.rounds.flatMap((round): PackRecord[] =>
		round.pack === null ? [] : [round.pack],
	)
	return { citeRefused: null, miss: readerMissOf({ cite, packs }) }
}

/** What a person's cite is checked against: the ask's manifest, the files now, every line of each file given. */
function wholeDocumentsOf(params: {
	target: PersonAnswerTarget
	pool: Extract<AskPool, { pool: unknown }> | null
}): CiteContext {
	const { pool } = params
	const manifest = params.target.request.standard?.files ?? []
	return {
		manifest,
		current: pool?.manifest ?? [],
		given: manifest.map((file) => ({
			file: file.id,
			from: 1,
			to: file.lines,
			clause: null,
			title: null,
			linked: false,
			quality: 'good',
		})),
		rangeOf: function rangeOfCite({ file, from, to }): RangeText {
			const index = pool?.files.get(file)
			return index === undefined
				? { lines: [], counted: 0 }
				: rangeTextOf({ file: index, from, to, original: pool?.originalLines.get(file) ?? [] })
		},
	}
}

/** The text answer: the fact recorded, then the reader miss or the cite refused. */
function answerLinesOf(params: { json: AskAnswerJson; by: string }): string[] {
	const { json } = params
	const { miss } = json
	return [
		fillMessage({
			template: ANSWER_MESSAGES.recorded,
			values: { ask: json.ask, fact: json.fact, by: params.by },
		}),
		...(json.citeRefused === null
			? []
			: [
					fillMessage({
						template: ANSWER_MESSAGES.citeRefused,
						values: { refused: json.citeRefused },
					}),
				]),
		...(miss === null
			? []
			: [
					miss.round === null
						? ANSWER_MESSAGES.notGiven
						: fillMessage({
								template: ANSWER_MESSAGES.miss,
								values: { round: String(miss.round) },
							}),
				]),
	]
}

/** A refusal: `ask: <message>`, the answer's usage line after it for a usage error; exit 2 unless told. */
function refused(params: {
	message: string
	usage?: boolean
	exitCode?: CommandOutput['exitCode']
}): CommandOutput {
	return askVerbRefused({
		message: params.message,
		...(params.usage === true ? { usageStart: ANSWER_USAGE_START } : {}),
		...(params.exitCode === undefined ? {} : { exitCode: params.exitCode }),
	})
}
