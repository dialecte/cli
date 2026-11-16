/**
 * `dialecte ask pack <ask-id>`: opens the next round of readers of an ask (section 8, D2-D7, D14, D15): the pool
 * rebuilt from what the ask recorded, each reader's slices to the budget, one brief and one nonce each, the round's
 * `pack.json` written last; the same round printed again while it is open, nothing rewritten.
 */
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { readAcceptedReports } from '../lib/knowledge/ask/accepted-reports-file.ts'
import { askFolderOf } from '../lib/knowledge/ask/ask-folder-of.ts'
import { askPoolOf } from '../lib/knowledge/ask/ask-pool-of.ts'
import { askRoundsOf } from '../lib/knowledge/ask/ask-rounds-of.ts'
import { askStateEventOf } from '../lib/knowledge/ask/ask-state-event-of.ts'
import { askPackEventOf } from '../lib/knowledge/ask/ask-step-events-of.ts'
import {
	ADJUDICATOR_BRIEF_FILES,
	ANSWER_RECORD_FILE,
	ANSWERED_STATE,
	ASK_ID_PATTERN,
	NOT_IN_TEXT_VERDICT,
	PACK_RECORD_FILE,
	READER_BRIEF_FILES,
	READER_LINE_BUDGET,
	READERS_AT_EFFORT,
	READERS_RUNG,
	ROUND_FOLDER_PREFIX,
	ROUNDS_FOLDER,
	SKIPPED_RECORD_FILE,
} from '../lib/knowledge/ask/ask.constants.ts'
import { briefSubjectOf } from '../lib/knowledge/ask/brief-subject-of.ts'
import { givenIdsOf, packRangeOf } from '../lib/knowledge/ask/given-ranges-of.ts'
import { lotHomeOf } from '../lib/knowledge/ask/lot-home-of.ts'
import { personRouteNextOf } from '../lib/knowledge/ask/raise-ask-question.ts'
import { rangeTextOf } from '../lib/knowledge/ask/range-text-of.ts'
import { readAskRecord } from '../lib/knowledge/ask/read-ask-record.ts'
import { readAskRequest } from '../lib/knowledge/ask/read-ask-request.ts'
import { readerBriefOf } from '../lib/knowledge/ask/reader-brief-of.ts'
import { readerSlicesOf } from '../lib/knowledge/ask/reader-slices-of.ts'
import { writeAskEvent } from '../lib/knowledge/ask/write-ask-event.ts'
import { rewriteLotNote } from '../lib/knowledge/ask/write-standard-note.ts'
import { fillMessage } from '../lib/knowledge/standard/fill-message.ts'
import { endedOf, jsonOf, printLines, textOf } from '../lib/print/print.ts'
import { readArguments } from '../lib/review-rounds/round-arguments.ts'
import { publishOnce, recordText, replaceWhole } from '../lib/store/publish.ts'
import { packAdjudicator } from './ask-pack-adjudicator.ts'
import { askVerbRefused } from './ask-refused.ts'
import {
	NEXT_COMMANDS,
	OUTSIDE_ONE_ROUND_REASON,
	PACK_EXIT_CODES,
	PACK_FLAGS,
	PACK_JSON_SCHEMA,
	PACK_MESSAGES,
	PACK_NEXT_COMMANDS,
	PACK_SLICE_SEPARATOR,
	PACK_STATES,
	PACK_USAGE_START,
	PACK_VALUE_OPTIONS,
} from './ask.constants.ts'

import type { CommandOutput } from '../lib/command-output.types.ts'
import type {
	AcceptedReport,
	AskFolder,
	AskRecordView,
	AskRequestRecord,
	AskRound,
	PackRecord,
	PoolSlice,
	PreviousRound,
	RangeText,
	ReaderPack,
	ReaderSlices,
	SkippedRecord,
} from '../lib/knowledge/ask/ask.types.ts'
import type { StandardFileIndex } from '../lib/knowledge/standard/standard-index.types.ts'
import type { AskPackJson, OpenedRounds, PackOptions, RunAskPackParams } from './ask.types.ts'

/**
 * `dialecte ask pack <ask-id> [--out <dir>] [--outside] [--web] [--lot <id|folder>] [--json]`: opens a round of
 * readers for an ask (the command line is what follows `pack`). Exit 0 the briefs ready (a round still open printed
 * again, nothing rewritten), 1 nothing new to give (the round skipped: the state and the next command named), 2
 * usage, an unknown or answered ask, an ask without `request.json`, a file changed since the ask, `--outside` on a
 * documents ask or the reverse.
 */
export async function runAskPack(params: RunAskPackParams): Promise<CommandOutput> {
	const environment = params.environment ?? process.env
	const options = packOptionsOf({ argv: params.argv })
	if ('output' in options) return options.output
	const { ask, json, out } = options
	const place = askFolderOf({ cwd: params.cwd, lot: options.lot, environment })
	if ('refused' in place) return refused({ message: place.refused })

	const askFolder = join(place.folder, ask)
	const read = packedAskOf({ ask, asksFolder: place.folder })
	if ('output' in read) return read.output
	const { record, opened, request } = read
	const outside = !request.request.documents
	const route = routeRefusalOf({ ask, outside, outsideAsked: options.outside })
	if (route !== undefined) return refused({ message: route })
	if (opened.adjudicator !== null)
		return packAdjudicator({
			...params,
			...opened.adjudicator,
			environment,
			ask,
			askFolder,
			request: request.request,
			record: record.record,
			json,
			out,
		})

	const latest = opened.rounds[opened.rounds.length - 1]
	// a round still open (its pack and no verdict) is printed again as written: no brief, no nonce made anew
	if (latest?.pack !== null && latest?.pack !== undefined && latest.verdict === null)
		return readyOutput({ ask, round: latest, json, out })
	// a round skipped before is answered the same, nothing rewritten, no question raised twice (J-15)
	if (latest?.skipped !== null && latest?.skipped !== undefined)
		return skippedRoundOutput({
			run: params,
			place,
			options,
			request: request.request,
			round: latest.round,
			reason: latest.skipped.reason,
		})
	return nextRoundOutput({
		run: params,
		environment,
		options,
		place,
		request: request.request,
		record: record.record,
		rounds: opened.rounds,
	})
}

/**
 * Opens the ask's next round of readers: its readers' slices to the budget, then the round written and its
 * `ask.pack` event (R1-16); or nothing new to give: the round skipped, its event written, the state and next named.
 */
async function nextRoundOutput(params: {
	run: RunAskPackParams
	environment: NodeJS.ProcessEnv
	options: PackOptions
	place: AskFolder
	request: AskRequestRecord
	record: AskRecordView
	rounds: AskRound[]
}): Promise<CommandOutput> {
	const { run, options, place, request, rounds } = params
	const { ask, json, out } = options
	const outside = !request.documents
	const round = (rounds[rounds.length - 1]?.round ?? 0) + 1
	const pack = await nextPackOf({
		cwd: run.cwd,
		environment: params.environment,
		request,
		record: params.record,
		outside,
		rounds,
	})
	if ('refused' in pack) return refused({ message: pack.refused, exitCode: pack.exitCode })
	const latest = rounds[rounds.length - 1]
	// a high documents round with nothing left goes to the adjudicator's brief when an accepted report answers
	// (I-8, L-3); when none does (all not-in-text, or none), the person is next, never the adjudicator (J-6)
	const kept =
		'skipped' in pack.readers && request.effort === 'high' && !outside && latest !== undefined
			? readAcceptedReports({ folder: latest.folder, ask })
			: undefined
	if (kept !== undefined && 'refused' in kept) return refused({ message: kept.refused })
	if (kept !== undefined && latest !== undefined && kept.reports.some(isAnsweringReport))
		return packAdjudicator({
			...run,
			environment: params.environment,
			latest,
			open: false,
			ask,
			askFolder: join(place.folder, ask),
			request,
			record: params.record,
			json,
			out,
		})
	if ('skipped' in pack.readers)
		return skippedRoundOutput({ run, place, options, request, round, reason: pack.readers.reason })
	const written = writeRound({
		ask,
		askFolder: join(place.folder, ask),
		round,
		readers: pack.readers.readers,
		request,
		record: pack.record,
		outside: outside ? { web: options.web } : null,
		files: pack.files,
		originalLines: pack.originalLines,
		nonce: run.nonce ?? randomUUID,
		now: run.now ?? currentTime,
	})
	if ('refused' in written) return refused({ message: written.refused })
	const readers = written.round.pack?.readers.length ?? 0
	writePackEvent({ place, ask, round, readers, skipped: false, now: run.now })
	return readyOutput({ ask, round: written.round, json, out })
}

/**
 * Writes the pack's `ask.pack` event (R1-16): the round, how many readers it gave, whether it was skipped (never the
 * question); a write that fails prints its line on standard error (the exit is kept).
 */
function writePackEvent(params: {
	place: AskFolder
	ask: string
	round: number
	readers: number
	skipped: boolean
	now: (() => Date) | undefined
}): void {
	const { place } = params
	const failure = writeAskEvent({
		file: place.eventsFile,
		event: askPackEventOf({
			ask: params.ask,
			lot: place.lotName,
			round: params.round,
			readers: params.readers,
			skipped: params.skipped,
			...(params.now === undefined ? {} : { now: params.now }),
		}),
	})
	if (failure !== undefined) printLines({ stream: 'stderr', lines: [failure] })
}

/** The pack's command line read: one ask id and the options, or the usage refusal. */
function packOptionsOf(params: { argv: string[] }): PackOptions | { output: CommandOutput } {
	const read = readArguments({
		argv: params.argv,
		valueOptions: PACK_VALUE_OPTIONS,
		flags: PACK_FLAGS,
	})
	if (typeof read === 'string') return { output: refused({ message: read, usage: true }) }
	const [ask, ...extra] = read.words
	if (ask === undefined)
		return { output: refused({ message: PACK_MESSAGES.needsAsk, usage: true }) }
	if (extra.length > 0)
		return {
			output: refused({
				message: fillMessage({
					template: PACK_MESSAGES.extraWords,
					values: { words: extra.join(' ') },
				}),
				usage: true,
			}),
		}
	const outside = read.flags.has('outside')
	const web = read.flags.has('web')
	if (web && !outside)
		return { output: refused({ message: PACK_MESSAGES.webWithoutOutside, usage: true }) }
	return {
		ask,
		lot: read.values.get('lot'),
		out: read.values.get('out'),
		outside,
		web,
		json: read.flags.has('json'),
	}
}

/** What a pack reads of an ask: its record, its rounds and its request; or the refusal naming the fix. */
function packedAskOf(params: { ask: string; asksFolder: string }):
	| {
			record: { record: AskRecordView }
			opened: OpenedRounds
			request: { request: AskRequestRecord }
	  }
	| { output: CommandOutput } {
	const { ask, asksFolder } = params
	const askFolder = join(asksFolder, ask)
	const record = ASK_ID_PATTERN.test(ask) ? readAskRecord({ askFolder }) : { absent: true as const }
	if ('absent' in record)
		return {
			output: refused({
				message: fillMessage({
					template: PACK_MESSAGES.unknownAsk,
					values: { ask, folder: asksFolder },
				}),
			}),
		}
	if ('refused' in record) return { output: refused({ message: record.refused }) }
	const opened = openedRoundsOf({ ask, askFolder, record: record.record })
	if ('refused' in opened) return { output: refused({ message: opened.refused }) }
	const request = requestOf({ ask, askFolder, question: record.record.question })
	if ('output' in request) return request
	return { record, opened, request }
}

/** The ask's request record, or the refusal: one that does not read, or none (an ask made before the readers). */
function requestOf(params: {
	ask: string
	askFolder: string
	question: string
}): { request: AskRequestRecord } | { output: CommandOutput } {
	const request = readAskRequest({ askFolder: params.askFolder })
	if ('refused' in request) return { output: refused({ message: request.refused }) }
	if ('absent' in request)
		return {
			output: refused({
				message: fillMessage({
					template: PACK_MESSAGES.noRequest,
					values: { ask: params.ask, question: params.question },
				}),
			}),
		}
	return request
}

/**
 * The rounds of an ask that may take another, and where the adjudicator stands (`next`: the readers' last round
 * closed for it, its brief to write; `open`: its brief written, its report awaited; D38); or the refusal: an ask
 * answered (its record or its latest verdict), one waiting for a person, a round whose folder holds no pack yet, a
 * closed round that asked for no other.
 */
function openedRoundsOf(params: {
	ask: string
	askFolder: string
	record: AskRecordView
}): OpenedRounds | { refused: string } {
	const { ask, record } = params
	const answered = fillMessage({ template: PACK_MESSAGES.answered, values: { ask } })
	// a person's answer is the latest record of all (D6)
	if (record.state === ANSWERED_STATE || existsSync(join(params.askFolder, ANSWER_RECORD_FILE)))
		return { refused: answered }
	if (record.state === PACK_STATES.person)
		return {
			refused: fillMessage({
				template: PACK_MESSAGES.needsPerson,
				values: { ask, next: fillMessage({ template: NEXT_COMMANDS.answer, values: { ask } }) },
			}),
		}
	const opened = askRoundsOf({ askFolder: params.askFolder })
	if ('refused' in opened) return opened
	const { rounds } = opened
	const latest = rounds[rounds.length - 1]
	if (latest === undefined) return { rounds, adjudicator: null }
	// a round skipped for nothing left (J-15): the pack answers it again
	if (latest.skipped !== null) return { rounds, adjudicator: null }
	if (latest.verdict === null && latest.pack === null) {
		if (existsSync(join(latest.folder, ADJUDICATOR_BRIEF_FILES.json)))
			return { rounds, adjudicator: { latest, open: true } }
		return {
			refused: fillMessage({
				template: PACK_MESSAGES.roundBeingWritten,
				values: { folder: latest.folder, round: String(latest.round), ask },
			}),
		}
	}
	if (latest.verdict === null || latest.verdict.state === PACK_STATES.ready)
		return { rounds, adjudicator: null }
	if (latest.verdict.state === ANSWERED_STATE) return { refused: answered }
	if (latest.verdict.state === PACK_STATES.adjudicator)
		return { rounds, adjudicator: { latest, open: false } }
	return {
		refused: fillMessage({
			template: PACK_MESSAGES.roundClosed,
			values: {
				round: String(latest.round),
				ask,
				state: latest.verdict.state,
				next:
					latest.verdict.next ?? fillMessage({ template: NEXT_COMMANDS.answer, values: { ask } }),
			},
		}),
	}
}

/** The refusal of a route the ask did not take: `--outside` on a documents ask, or a pack without it on an outside one. */
function routeRefusalOf(params: {
	ask: string
	outside: boolean
	outsideAsked: boolean
}): string | undefined {
	const { ask, outside, outsideAsked } = params
	if (outsideAsked && !outside)
		return fillMessage({ template: PACK_MESSAGES.outsideOnDocuments, values: { ask } })
	if (!outsideAsked && outside)
		return fillMessage({ template: PACK_MESSAGES.documentsOnOutside, values: { ask } })
	return undefined
}

/**
 * The readers of the next round: outside, one round of readers with no slice (a second: nothing new); documents,
 * the pool rebuilt and split to the budget, the closed rounds read (what each letter had, what was verified).
 */
async function nextPackOf(params: {
	cwd: string
	environment: NodeJS.ProcessEnv
	request: AskRequestRecord
	record: AskRecordView
	outside: boolean
	rounds: AskRound[]
}): Promise<
	| {
			readers: ReaderPack
			files: Map<string, StandardFileIndex>
			originalLines: Map<string, string[]>
			record: AskRecordView
	  }
	| { refused: string; exitCode: 1 | 2 }
> {
	const { request, rounds, record } = params
	if (params.outside) {
		const readers: ReaderPack =
			rounds.length > 0
				? { skipped: true, reason: OUTSIDE_ONE_ROUND_REASON }
				: {
						round: 1,
						readers: READERS_AT_EFFORT[request.effort].map((letter) => ({
							letter,
							slices: [],
							counted: 0,
						})),
					}
		return { readers, files: new Map(), originalLines: new Map(), record }
	}
	const pool = await askPoolOf({
		cwd: params.cwd,
		environment: params.environment,
		request,
		record,
	})
	if ('refused' in pool) return pool
	return {
		readers: readerSlicesOf({
			pool: pool.pool,
			effort: request.effort,
			budget: READER_LINE_BUDGET,
			previous: rounds.map((round) => previousRoundOf({ round, pool: pool.pool })),
		}),
		files: pool.files,
		originalLines: pool.originalLines,
		// a re-ask's angles and slices are rebuilt from its request (D33): its briefs list them
		record: pool.record,
	}
}

/**
 * A closed round as the next pack reads it: what each letter was given (its recorded ranges as ids of the pool now,
 * I-8), the angles a verified cite came from.
 */
function previousRoundOf(params: { round: AskRound; pool: PoolSlice[] }): PreviousRound {
	const { round, pool } = params
	return {
		round: round.round,
		given: (round.pack?.readers ?? []).map((reader) => ({
			letter: reader.letter,
			slices: givenIdsOf({ reader, pool }),
		})),
		verifiedAngles: round.verdict?.verifiedAngles ?? [],
	}
}

/**
 * Opens the round: its folder claimed (exclusive: two packs at once open it once), each reader's brief written
 * whole with its own nonce, then `pack.json` last (the round is open from it, D14).
 */
function writeRound(params: {
	ask: string
	askFolder: string
	round: number
	readers: ReaderSlices[]
	request: AskRequestRecord
	record: AskRecordView
	outside: { web: boolean } | null
	files: Map<string, StandardFileIndex>
	originalLines: Map<string, string[]>
	nonce: () => string
	now: () => Date
}): { round: AskRound } | { refused: string } {
	const { ask, round, files, originalLines } = params
	const roundsFolder = join(params.askFolder, ROUNDS_FOLDER)
	const folder = join(roundsFolder, `${ROUND_FOLDER_PREFIX}${round}`)
	mkdirSync(roundsFolder, { recursive: true })
	try {
		mkdirSync(folder)
	} catch (error) {
		if (!isAlreadyThere(error)) throw error
		return {
			refused: fillMessage({
				template: PACK_MESSAGES.roundBeingWritten,
				values: { folder, round: String(round), ask },
			}),
		}
	}
	const subject = briefSubjectOf({ request: params.request, record: params.record })
	const given: PackRecord['readers'] = []
	for (const reader of params.readers) {
		const nonce = params.nonce()
		const brief = readerBriefOf({
			ask,
			question: params.request.question,
			subject,
			angles: params.record.angles,
			reader,
			nonce,
			round,
			rangeText: function rangeTextOfSlice({ slice }): RangeText {
				return rangeOfSlice({ slice, files, originalLines })
			},
			outside:
				params.outside === null
					? null
					: { name: params.request.standard?.name ?? null, web: params.outside.web },
		})
		const names = briefNamesOf({ letter: reader.letter })
		replaceWhole({ path: join(folder, names.markdown), text: brief.markdown })
		replaceWhole({ path: join(folder, names.json), text: recordText(brief.json) })
		given.push({
			letter: reader.letter,
			nonce,
			slices: reader.slices.map((slice) => slice.id),
			// the ranges the brief holds (I-6): what a verdict or an answer checks "given" against
			ranges: reader.slices.map((slice) => packRangeOf({ slice })),
		})
	}
	const pack: PackRecord = {
		schema: 1,
		ask,
		round,
		outside: params.outside !== null,
		web: params.outside?.web ?? false,
		readers: given,
		at: params.now().toISOString(),
	}
	replaceWhole({ path: join(folder, PACK_RECORD_FILE), text: recordText(pack) })
	return { round: { round, folder, pack, verdict: null, skipped: null } }
}

/** The lines of a slice from its file's index; none when the documents no longer hold the file. */
function rangeOfSlice(params: {
	slice: PoolSlice
	files: Map<string, StandardFileIndex>
	originalLines: Map<string, string[]>
}): RangeText {
	const { slice } = params
	const file = params.files.get(slice.file)
	if (file === undefined) return { lines: [], counted: 0 }
	return rangeTextOf({
		file,
		from: slice.from,
		to: slice.to,
		original: params.originalLines.get(slice.file) ?? [],
	})
}

/** The file names of a reader's brief in its round folder. */
function briefNamesOf(params: { letter: string }): { markdown: string; json: string } {
	return {
		markdown: fillMessage({ template: READER_BRIEF_FILES.markdown, values: params }),
		json: fillMessage({ template: READER_BRIEF_FILES.json, values: params }),
	}
}

/**
 * The answer of a round whose briefs are written: each reader's brief and slices, what is next; with `--out`, the
 * briefs copied there too (the ask folder keeps the originals). Exit 0.
 */
function readyOutput(params: {
	ask: string
	round: AskRound
	json: boolean
	out: string | undefined
}): CommandOutput {
	const { ask, round, out } = params
	const readers = round.pack?.readers ?? []
	if (out !== undefined)
		copyBriefs({ from: round.folder, to: out, letters: readers.map((reader) => reader.letter) })
	const answer: AskPackJson = {
		schema: PACK_JSON_SCHEMA,
		ask,
		round: round.round,
		state: PACK_STATES.ready,
		readers: readers.map((reader) => ({
			letter: reader.letter,
			brief: join(round.folder, briefNamesOf({ letter: reader.letter }).markdown),
			slices: reader.slices,
		})),
		next: fillMessage({ template: PACK_NEXT_COMMANDS.verdict, values: { ask } }),
	}
	if (params.json) return { output: endedOf(jsonOf(answer, '\t')), exitCode: PACK_EXIT_CODES.ready }
	return {
		output: textOf([
			fillMessage({
				template: PACK_MESSAGES.ready,
				values: { ask, round: String(answer.round), count: String(answer.readers.length) },
			}),
			...answer.readers.map((reader) =>
				fillMessage({
					template: PACK_MESSAGES.reader,
					values: {
						letter: reader.letter,
						brief: reader.brief,
						slices:
							reader.slices.length === 0
								? PACK_MESSAGES.noSlice
								: reader.slices.join(PACK_SLICE_SEPARATOR),
					},
				}),
			),
			fillMessage({ template: PACK_MESSAGES.next, values: { next: answer.next ?? '' } }),
			'',
		]),
		exitCode: PACK_EXIT_CODES.ready,
	}
}

/** Copies each reader's brief (markdown and json) from the round folder into `--out`, each written whole. */
function copyBriefs(params: { from: string; to: string; letters: string[] }): void {
	mkdirSync(params.to, { recursive: true })
	for (const letter of params.letters)
		for (const name of Object.values(briefNamesOf({ letter })))
			replaceWhole({
				path: join(params.to, name),
				text: readFileSync(join(params.from, name), 'utf8'),
			})
}

/**
 * The answer of a round with nothing new to give (D15, case 30): nothing written, the person next (a high documents
 * round goes to the adjudicator's brief instead, L-3), its next command named. Exit 1.
 */
function skippedOutput(params: {
	ask: string
	round: number
	reason: string
	json: boolean
	next: string
}): CommandOutput {
	const { ask, round, next } = params
	// the person is next (a high documents round with an answering report goes to the adjudicator, L-3, J-6)
	const state = PACK_STATES.person
	const answer: AskPackJson = {
		schema: PACK_JSON_SCHEMA,
		ask,
		round,
		state,
		readers: [],
		next,
	}
	if (params.json)
		return { output: endedOf(jsonOf(answer, '\t')), exitCode: PACK_EXIT_CODES.skipped }
	return {
		output: textOf([
			fillMessage({
				template: PACK_MESSAGES.skipped,
				values: { state, ask, round: String(round), reason: params.reason },
			}),
			fillMessage({ template: PACK_MESSAGES.next, values: { next } }),
			'',
		]),
		exitCode: PACK_EXIT_CODES.skipped,
	}
}

/**
 * A round skipped for nothing left to give (J-13, J-15): its `skipped.json` published once (a pack again keeps the
 * first, the same bytes), its `ask.pack` event, the person route, the lot's note rewritten (the ask at needs-person),
 * then the skipped answer. Exit 1.
 */
async function skippedRoundOutput(params: {
	run: RunAskPackParams
	place: AskFolder
	options: PackOptions
	request: AskRequestRecord
	round: number
	reason: string
}): Promise<CommandOutput> {
	const { run, place, options, round } = params
	const { ask } = options
	const folder = join(place.folder, ask, ROUNDS_FOLDER, `${ROUND_FOLDER_PREFIX}${round}`)
	const record: SkippedRecord = {
		schema: 1,
		ask,
		round,
		state: PACK_STATES.person,
		reason: params.reason,
		at: (run.now ?? currentTime)().toISOString(),
	}
	mkdirSync(folder, { recursive: true })
	publishOnce({
		path: join(folder, SKIPPED_RECORD_FILE),
		text: recordText(record),
		readOnly: false,
	})
	writePackEvent({ place, ask, round, readers: 0, skipped: true, now: run.now })
	const next = personRouteOf({ place, ask, request: params.request, folder, now: run.now })
	await rewriteLotNote({
		lotHome: lotHomeOf({ place, lotGiven: options.lot !== undefined }),
		asksFolder: place.folder,
		now: run.now,
	})
	return skippedOutput({ ask, round, reason: params.reason, json: options.json, next })
}

/**
 * The person route of a skipped round (J-13), as the verdict's: the ask's state recorded needs-person (an `ask.state`
 * event), and in a store lot its question raised once (pointing to the round's `skipped.json`) with the `lot answer`
 * next; elsewhere the `ask answer` next.
 */
function personRouteOf(params: {
	place: AskFolder
	ask: string
	request: AskRequestRecord
	folder: string
	now: (() => Date) | undefined
}): string {
	const { place, ask } = params
	const failure = writeAskEvent({
		file: place.eventsFile,
		event: askStateEventOf({
			ask,
			lot: place.lotName,
			state: PACK_STATES.person,
			rung: READERS_RUNG,
			conflict: false,
			...(params.now === undefined ? {} : { now: params.now }),
		}),
	})
	if (failure !== undefined) printLines({ stream: 'stderr', lines: [failure] })
	const lotNext =
		place.lotFolder === null || place.lotName === null
			? null
			: personRouteNextOf({
					lotFolder: place.lotFolder,
					lotName: place.lotName,
					ask,
					question: params.request.question,
					verdictPath: join(params.folder, SKIPPED_RECORD_FILE),
					now: params.now,
				})
	return lotNext ?? fillMessage({ template: NEXT_COMMANDS.answer, values: { ask } })
}

/** An accepted report that answers: a verdict other than `not-in-text` backed by a verified claim (J-6). */
function isAnsweringReport(report: AcceptedReport): boolean {
	return (
		report.report.verdict !== NOT_IN_TEXT_VERDICT && report.claims.some((claim) => claim.verified)
	)
}

/** Whether a folder claim failed because the folder is already there. */
function isAlreadyThere(error: unknown): boolean {
	return error instanceof Error && 'code' in error && error.code === 'EEXIST'
}

/** The clock of a real pack. */
function currentTime(): Date {
	return new Date()
}

/** A refusal: `ask: <message>`, the pack's usage line after it for a usage error; exit 2 unless told. */
function refused(params: {
	message: string
	usage?: boolean
	exitCode?: CommandOutput['exitCode']
}): CommandOutput {
	return askVerbRefused({
		message: params.message,
		...(params.usage === true ? { usageStart: PACK_USAGE_START } : {}),
		...(params.exitCode === undefined ? {} : { exitCode: params.exitCode }),
	})
}
