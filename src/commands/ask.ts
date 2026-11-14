/**
 * `dialecte ask "<question>"`: the answer ladder, rungs 0-3 (a fact, the definition, the catalogues and api
 * indexes, the documents' slices), the ask kept as a folder, its events written, the lot's standard note.
 */
import { dirname, join } from 'node:path'

import { COMMAND_MAP } from '../lib/command-map/command-map.constants.ts'
import { askEventsOf } from '../lib/knowledge/ask/ask-events-of.ts'
import { askFolderOf } from '../lib/knowledge/ask/ask-folder-of.ts'
import { AskRefusal } from '../lib/knowledge/ask/ask-refusal.ts'
import {
	ASK_RECORD_FILE,
	KIND_SLOT_NEEDS,
	NAME_SEPARATOR,
	RUNG_ONE_FACT_SOURCE,
	RUNG_TWO_FACT_SOURCE,
} from '../lib/knowledge/ask/ask.constants.ts'
import { claimAskId } from '../lib/knowledge/ask/claim-ask-id.ts'
import { loadAskSetup } from '../lib/knowledge/ask/load-ask-setup.ts'
import { loadStandardIndexes } from '../lib/knowledge/ask/load-standard-indexes.ts'
import { noStandardRefusalOf } from '../lib/knowledge/ask/no-standard-refusal-of.ts'
import { reaskUnchecked } from '../lib/knowledge/ask/reask-unchecked.ts'
import { readLadderQuestion, runLadder } from '../lib/knowledge/ask/run-ladder.ts'
import { selectStandard } from '../lib/knowledge/ask/select-standard.ts'
import { standardKeyOf } from '../lib/knowledge/ask/standard-key-of.ts'
import { standardNoteOf } from '../lib/knowledge/ask/standard-note-of.ts'
import { writeAskEvent } from '../lib/knowledge/ask/write-ask-event.ts'
import { factsFolderRefusal } from '../lib/knowledge/facts/data-folder.ts'
import { fillMessage } from '../lib/knowledge/standard/fill-message.ts'
import { endedOf, jsonOf, printLines, printOut, textOf } from '../lib/print/print.ts'
import { createStepProgress } from '../lib/progress/step-progress.ts'
import { createStreamLiveOutput } from '../lib/progress/stream-live-output.ts'
import { createSystemClock } from '../lib/progress/system-clock.ts'
import { readArguments } from '../lib/review-rounds/round-arguments.ts'
import { effectiveEffort } from '../lib/risk/risk-records.ts'
import { readStandardRoot } from '../lib/standard/read-standard-root.ts'
import { STANDARD_FILE } from '../lib/standard/standard.constants.ts'
import { BRIEF_EFFORTS } from '../lib/store/brief.constants.ts'
import { recordText, replaceWhole } from '../lib/store/publish.ts'
import {
	ANGLE_TERMS_SEPARATOR,
	ASK_COMMAND,
	ASK_EXIT_CODES,
	ASK_FLAGS,
	ASK_JSON_SCHEMA,
	ASK_LIMIT_PATTERN,
	ASK_MESSAGES,
	ASK_VALUE_OPTIONS,
	DEFAULT_ASK_EFFORT,
	DEFAULT_ASK_LIMIT,
	NEXT_COMMANDS,
	UNBUILT_ASK_VERBS,
} from './ask.constants.ts'

import type { CommandOutput } from '../lib/command-output.types.ts'
import type {
	AskFolder,
	AskKind,
	AskOutcome,
	AskRequest,
	AskSetup,
	AskSetupBase,
	AskStandard,
	RungTiming,
	StandardSelection,
} from '../lib/knowledge/ask/ask.types.ts'
import type { RoundArguments } from '../lib/review-rounds/review-rounds.types.ts'
import type { LoadedDialecte } from '../lib/schema/schema.types.ts'
import type { StandardRecord } from '../lib/standard/standard.types.ts'
import type { BriefEffort } from '../lib/store/brief.types.ts'
import type { AskJson, AskStandardJson, RunAskParams } from './ask.types.ts'

/** Runs the command on the process's command line. */
export async function run(argv: string[]): Promise<void> {
	const result = await runAsk({ argv, cwd: process.cwd() })
	printOut({ stream: 'stdout', text: result.output, ending: 'as-is' })
	process.exitCode = result.exitCode
}

/**
 * Runs one ask and answers its text and exit code: 0 answered, 1 a person next, 2 usage or a refusal (nothing
 * written), 3 readers next. The lines that never change the exit code (a standard folder not found for the
 * dialecte's standard, an event not written) go to standard error.
 */
export async function runAsk(params: RunAskParams): Promise<CommandOutput> {
	const environment = params.environment ?? process.env
	const unbuilt = unbuiltVerbRefusal({ argv: params.argv })
	if (unbuilt !== undefined) return unbuilt
	const read = readArguments({
		argv: params.argv,
		valueOptions: ASK_VALUE_OPTIONS,
		flags: ASK_FLAGS,
	})
	if (typeof read === 'string') return refused({ message: read, usage: true })
	const options = optionsOf({ read })
	if ('refused' in options) return refused({ message: options.refused, usage: true })
	const place = askFolderOf({ cwd: params.cwd, lot: read.values.get('lot'), environment })
	if ('refused' in place) return refused({ message: place.refused })
	const lotHome = lotHomeOf({ place, lotGiven: read.values.has('lot') })
	const effort = effortOf({ place, lotHome, asked: options.effort })
	if ('refused' in effort) return refused({ message: effort.refused })
	const request: AskRequest = { ...options.request, effort: effort.level }

	const loaded = await loadAskSetup({
		cwd: params.cwd,
		environment,
		packageName: request.packageName,
		facts: !request.noFacts,
	})
	if ('refused' in loaded) return refused({ message: loaded.refused })
	const base = loaded.setup
	const factsRefusal = request.noFacts
		? undefined
		: factsFolderRefusal({ folder: base.factsFolder })
	if (factsRefusal !== undefined) return refused({ message: factsRefusal })

	const placed = placedQuestionOf({ request, base })
	if ('refused' in placed) return refused({ message: placed.refused })
	const selection = selectStandard({ environment, standardName: placed.dialecte?.standard })
	if ('refused' in selection) return refused({ message: selection.refused })
	// the line of 32m: documents exist, under other names than the dialecte's standard (an empty root says nothing)
	if (selection.kind === 'none' && selection.line !== null && selection.known.length > 0)
		printLines({ stream: 'stderr', lines: [selection.line] })
	// --no-standard is decided from the selection and the folders' files, before any index is built
	const noStandard = request.noStandard
		? noStandardRefusalOf({ environment, selection })
		: undefined
	if (noStandard !== undefined) return refused({ message: noStandard })
	const documents = request.noStandard
		? { standard: noDocumentsOf({ selection }) }
		: await standardOf({ params, environment, selection, placed })
	if ('output' in documents) return documents.output
	const setup: AskSetup = { ...base, standard: documents.standard }

	// every refusal of the ladder was read with the question (placedQuestionOf): the ask is made only now
	const ask = claimAskId({ asksFolder: place.folder })
	const rungs: RungTiming[] = []
	const outcome = runLadder({
		request,
		setup,
		ask,
		lot: place.lotName,
		onRung: function rungTimed(timing) {
			rungs.push(timing)
		},
	})
	if (!request.noFacts && setup.standard.kind === 'documents') reaskFor({ place, setup, selection })

	const json = askJsonOf({
		ask,
		request,
		outcome,
		environment,
		selection,
		standard: setup.standard,
	})
	replaceWhole({ path: join(place.folder, ask, ASK_RECORD_FILE), text: recordText(json) })
	writeEvents({ place, ask, request, outcome, rungs })
	if (lotHome !== undefined && (outcome.rung === 3 || outcome.source === 'outside'))
		writeStandardNote({ place, lotHome, now: setup.now })
	return {
		output: read.flags.has('json')
			? endedOf(jsonOf(json, '\t'))
			: textOf([...answerLinesOf({ json, outcome }), '']),
		exitCode: ASK_EXIT_CODES[outcome.state],
	}
}

/** The request the command line asks (its effort settled later) and the `--effort` given, or the refusal. */
function optionsOf(params: {
	read: RoundArguments
}): { request: Omit<AskRequest, 'effort'>; effort: BriefEffort | undefined } | { refused: string } {
	const { values, flags } = params.read
	const question = params.read.words.join(' ').trim()
	if (question === '') return { refused: ASK_MESSAGES.needsQuestion }
	const kind = values.get('kind')
	if (kind !== undefined && !isAskKind(kind))
		return {
			refused: fillMessage({
				template: ASK_MESSAGES.unknownKind,
				values: { kind, kinds: Object.keys(KIND_SLOT_NEEDS).join(NAME_SEPARATOR) },
			}),
		}
	const effort = values.get('effort')
	if (effort !== undefined && !isEffort(effort))
		return {
			refused: fillMessage({
				template: ASK_MESSAGES.unknownEffort,
				values: { effort, efforts: BRIEF_EFFORTS.join(NAME_SEPARATOR) },
			}),
		}
	const limit = values.get('limit')
	if (limit !== undefined && !ASK_LIMIT_PATTERN.test(limit))
		return {
			refused: fillMessage({ template: ASK_MESSAGES.badLimit, values: { value: limit } }),
		}
	return {
		request: {
			question,
			...optionalOf({ about: values.get('about') }),
			...optionalOf({ code: values.get('code') }),
			...optionalOf({ method: values.get('method') }),
			...optionalOf({ packageName: values.get('package') }),
			...(kind === undefined ? {} : { kind }),
			decision: flags.has('decision'),
			noFacts: flags.has('no-facts'),
			limit: limit === undefined ? DEFAULT_ASK_LIMIT : Number(limit),
			noStandard: flags.has('no-standard'),
			personOnly: flags.has('person-only'),
		},
		effort,
	}
}

/** The one member of `entry` when its value is given, else nothing (an optional member stays absent). */
function optionalOf<Name extends string>(
	entry: Record<Name, string | undefined>,
): Partial<Record<Name, string>> {
	return Object.fromEntries(
		Object.entries(entry).filter(([, value]) => value !== undefined),
	) as Partial<Record<Name, string>>
}

function isAskKind(word: string): word is AskKind {
	return Object.hasOwn(KIND_SLOT_NEEDS, word)
}

function isEffort(word: string): word is BriefEffort {
	return BRIEF_EFFORTS.some((effort) => effort === word)
}

/**
 * The folder of the lot an ask belongs to: a store lot's folder, a hand-over folder given with `--lot`; undefined
 * for an ask of the state folder.
 */
function lotHomeOf(params: { place: AskFolder; lotGiven: boolean }): string | undefined {
	const { place } = params
	if (place.lotFolder !== null) return place.lotFolder
	return params.lotGiven ? dirname(place.folder) : undefined
}

/**
 * The effort of the ask (D19): the lot's (`--effort` must say the same), else `--effort`, else medium; the
 * refusal of an `--effort` the lot does not run at.
 */
function effortOf(params: {
	place: AskFolder
	lotHome: string | undefined
	asked: BriefEffort | undefined
}): { level: BriefEffort } | { refused: string } {
	const { place, lotHome, asked } = params
	const lotEffort =
		lotHome === undefined ? undefined : effectiveEffort({ folder: place.lotFolder ?? lotHome })
	if (lotEffort !== undefined && asked !== undefined && asked !== lotEffort)
		return {
			refused: fillMessage({
				template: ASK_MESSAGES.lotEffort,
				values: { asked, effort: lotEffort, lot: place.lotName ?? lotHome ?? '' },
			}),
		}
	return { level: lotEffort ?? asked ?? DEFAULT_ASK_EFFORT }
}

/**
 * The question read against the installed dialectes before any document is chosen, and the dialecte whose
 * standard the ask reads: the one the question's tags decide, else `--package`, else the only one, else the
 * folder's own; the refusal of a question the ladder cannot read.
 */
function placedQuestionOf(params: {
	request: AskRequest
	base: AskSetupBase
}): { dialecte: LoadedDialecte | undefined } | { refused: string } {
	const { request, base } = params
	const noDocuments: AskStandard = { kind: 'none', name: null, key: null }
	let decided: LoadedDialecte | undefined
	try {
		decided = readLadderQuestion({
			request: { ...request, noStandard: false },
			setup: { ...base, standard: noDocuments },
		}).read.dialecte
	} catch (error) {
		if (error instanceof AskRefusal) return { refused: error.message }
		throw error
	}
	const { dialectes } = base
	const [only, ...others] = dialectes
	return {
		dialecte:
			decided ??
			dialectes.find((dialecte) => dialecte.packageName === request.packageName) ??
			(others.length === 0 ? only : undefined) ??
			dialectes.find((dialecte) => dialecte.packageName === base.ownPackage),
	}
}

/**
 * The documents the ask reads: the indexes of the selected folders (built in the cache when missing), or none; the
 * answer that stops the ask when the load refuses (exit 2) or a build aborts (exit 1).
 */
async function standardOf(params: {
	params: RunAskParams
	environment: NodeJS.ProcessEnv
	selection: Exclude<StandardSelection, { refused: string }>
	placed: { dialecte: LoadedDialecte | undefined }
}): Promise<{ standard: AskStandard } | { output: CommandOutput }> {
	const { selection } = params
	if (selection.kind === 'none') return { standard: noDocumentsOf({ selection }) }
	const loaded = await loadStandardIndexes({
		cwd: params.params.cwd,
		environment: params.environment,
		standardIds: selection.folderIds,
		...optionalOf({ packageName: params.placed.dialecte?.packageName }),
		progress: process.stderr.isTTY
			? createStepProgress({
					live: createStreamLiveOutput(process.stderr),
					clock: createSystemClock(),
				})
			: undefined,
	})
	if (loaded.kind === 'refused') return { output: refused({ message: loaded.message }) }
	if (loaded.kind === 'unknownPackage')
		return {
			output: refused({
				message: fillMessage({
					template: ASK_MESSAGES.unknownPackage,
					values: { name: loaded.name, installed: loaded.installed.join(NAME_SEPARATOR) },
				}),
			}),
		}
	if (loaded.kind === 'aborted')
		return { output: refused({ message: loaded.message, exitCode: 1 }) }
	// folders holding no file give no document to read: the outside route, as with none
	if (loaded.standard.folders.length === 0) return { standard: noDocumentsOf({ selection }) }
	return { standard: loaded.standard }
}

/** No document to read for the selection: the outside route, the declared name and its key kept. */
function noDocumentsOf(params: {
	selection: Exclude<StandardSelection, { refused: string }>
}): AskStandard {
	return { kind: 'none', name: params.selection.name, key: params.selection.key }
}

/**
 * Re-asks the unchecked facts of the dialectes whose standard the selected documents are (D15): one ask each, its
 * record holding the question only.
 */
function reaskFor(params: {
	place: AskFolder
	setup: AskSetup
	selection: Exclude<StandardSelection, { refused: string }>
}): void {
	const { place, setup, selection } = params
	const packages = setup.dialectes
		.filter(
			(dialecte) =>
				dialecte.standard !== undefined &&
				selection.key !== null &&
				standardKeyOf(dialecte.standard) === selection.key,
		)
		.map((dialecte) => dialecte.packageName)
	reaskUnchecked({
		factsFolder: setup.factsFolder,
		packages,
		lot: place.lotName,
		now: setup.now,
		claim: function claimReask() {
			return claimAskId({ asksFolder: place.folder })
		},
		keep: function keepReask({ ask, question, fact }) {
			replaceWhole({
				path: join(place.folder, ask, ASK_RECORD_FILE),
				text: recordText({ ask, question, state: 'needs-readers', fact: null, reask: fact }),
			})
		},
	})
}

/** The `--json` object of the ask, as its folder keeps it (section 3). */
function askJsonOf(params: {
	ask: string
	request: AskRequest
	outcome: AskOutcome
	environment: NodeJS.ProcessEnv
	selection: Exclude<StandardSelection, { refused: string }>
	standard: AskStandard
}): AskJson {
	const { ask, request, outcome } = params
	return {
		schema: ASK_JSON_SCHEMA,
		ask,
		question: request.question,
		subject: outcome.subject,
		kind: outcome.kind,
		decision: outcome.decision,
		rung: outcome.rung,
		state: outcome.state,
		answer: outcome.answer,
		fact: outcome.fact,
		source: outcome.source,
		boundary: outcome.boundary,
		conflict: outcome.conflict,
		candidates: outcome.candidates,
		methods: outcome.methods,
		angles: outcome.angles,
		slices: outcome.slices,
		effort: { level: request.effort },
		next: nextOf({ ask, outcome }),
		standard: standardJsonOf(params),
	}
}

/** What the ask runs next: `ask pack` for readers (`--outside` without documents), `ask answer` for a person. */
function nextOf(params: { ask: string; outcome: AskOutcome }): string | null {
	const { ask, outcome } = params
	if (outcome.state === 'answered') return null
	const template =
		outcome.state === 'needs-person'
			? NEXT_COMMANDS.answer
			: outcome.source === 'outside'
				? NEXT_COMMANDS.packOutside
				: NEXT_COMMANDS.pack
	return fillMessage({ template, values: { ask } })
}

/** What the ask says of the documents: configured, readable, the declared name and key, the folders read. */
function standardJsonOf(params: {
	environment: NodeJS.ProcessEnv
	selection: Exclude<StandardSelection, { refused: string }>
	standard: AskStandard
}): AskStandardJson {
	const { selection, standard } = params
	const folders = standard.kind === 'documents' ? standard.folders : []
	return {
		configured: readStandardRoot({ environment: params.environment }) !== undefined,
		documents: standard.kind === 'documents',
		name: selection.name,
		key: selection.key,
		folders: folders.map((folder) => folder.id),
		files: Object.fromEntries(folders.map((folder) => [folder.id, folder.files])),
	}
}

/** Writes the ask's events in order; the first that fails prints its line on standard error, the rest are dropped. */
function writeEvents(params: {
	place: AskFolder
	ask: string
	request: AskRequest
	outcome: AskOutcome
	rungs: RungTiming[]
}): void {
	const { place } = params
	const events = askEventsOf({
		ask: params.ask,
		lot: place.lotName,
		request: params.request,
		outcome: params.outcome,
		rungs: params.rungs,
	})
	for (const event of events) {
		const failure = writeAskEvent({ file: place.eventsFile, event })
		if (failure === undefined) continue
		printLines({ stream: 'stderr', lines: [failure] })
		return
	}
}

/** The lot's `standard.json` (D18): consulted, the note recomputed from every ask of its `asks` folder. */
function writeStandardNote(params: {
	place: AskFolder
	lotHome: string
	now: (() => Date) | undefined
}): void {
	const record: StandardRecord = {
		state: 'consulted',
		note: standardNoteOf({ asksFolder: params.place.folder }),
		at: (params.now?.() ?? new Date()).toISOString(),
	}
	replaceWhole({ path: join(params.lotHome, STANDARD_FILE), text: recordText(record) })
}

/** The text answer: the answer and its source, or the state with what the readers or the person get, then next. */
function answerLinesOf(params: { json: AskJson; outcome: AskOutcome }): string[] {
	const { json, outcome } = params
	const candidates = json.candidates.map((candidate) =>
		fillMessage({ template: ASK_MESSAGES.candidate, values: { ...candidate } }),
	)
	const next =
		json.next === null
			? []
			: [fillMessage({ template: ASK_MESSAGES.next, values: { next: json.next } })]
	const limits = boundaryLinesOf({ json })
	if (json.state === 'answered')
		return [
			fillMessage({ template: ASK_MESSAGES.answer, values: { text: json.answer?.text ?? '' } }),
			fillMessage({ template: ASK_MESSAGES.source, values: { source: sourceWordOf({ json }) } }),
			fillMessage({
				template: ASK_MESSAGES.recorded,
				values: {
					ask: json.ask,
					rung: String(json.rung),
					fact:
						json.fact === null
							? ''
							: fillMessage({ template: ASK_MESSAGES.recordedFact, values: { fact: json.fact } }),
				},
			}),
			...limits,
			...candidates,
		]
	if (json.state === 'needs-person')
		return [
			fillMessage({
				template: ASK_MESSAGES.needsPerson,
				values: { ask: json.ask, rung: String(json.rung) },
			}),
			...limits,
			...candidates,
			...next,
		]
	if (outcome.source === 'outside')
		return [
			fillMessage({ template: ASK_MESSAGES.needsOutside, values: { ask: json.ask } }),
			...angleLinesOf({ json }),
			...limits,
			...candidates,
			...next,
		]
	return [
		fillMessage({
			template: ASK_MESSAGES.needsReaders,
			values: { ask: json.ask, count: String(json.slices.length) },
		}),
		...(json.slices.length === 0 ? [ASK_MESSAGES.noSlice] : json.slices.map(sliceLineOf)),
		...limits,
		...candidates,
		...next,
	]
}

/**
 * The lines of a `--decision` ask's boundary (D29): `boundary: <answer> (definition)` when the definition was read,
 * then `! conflict: ...` naming what the prose named outside it.
 */
function boundaryLinesOf(params: { json: AskJson }): string[] {
	const { boundary, conflict } = params.json
	return [
		...(boundary === null
			? []
			: [
					fillMessage({
						template: ASK_MESSAGES.boundary,
						values: { answer: boundary.answer.text },
					}),
				]),
		...(conflict === null
			? []
			: [
					fillMessage({
						template: ASK_MESSAGES.conflict,
						values: { outside: conflict.outside.join(NAME_SEPARATOR) },
					}),
				]),
	]
}

/** Where an answer comes from, as the text names it: the fact reused, the definition, the dialecte's own files. */
function sourceWordOf(params: { json: AskJson }): string {
	const { json } = params
	if (json.rung === 0)
		return fillMessage({ template: ASK_MESSAGES.sourceFact, values: { fact: json.fact ?? '' } })
	return json.rung === 1 ? RUNG_ONE_FACT_SOURCE : RUNG_TWO_FACT_SOURCE
}

/** One slice as the text lists it: its id, file range, clause, score, linked mark. */
function sliceLineOf(slice: AskJson['slices'][number]): string {
	return fillMessage({
		template: ASK_MESSAGES.slice,
		values: {
			id: slice.id,
			file: slice.file,
			from: String(slice.from),
			to: String(slice.to),
			clause:
				slice.clause === null
					? ''
					: fillMessage({ template: ASK_MESSAGES.sliceClause, values: { clause: slice.clause } }),
			score: String(slice.score),
			linked: slice.linked ? ASK_MESSAGES.sliceLinked : '',
		},
	})
}

/** The angles as the text lists them for the outside readers. */
function angleLinesOf(params: { json: AskJson }): string[] {
	return params.json.angles.map((angle) =>
		fillMessage({
			template: ASK_MESSAGES.angle,
			values: {
				id: angle.id,
				family: angle.family,
				terms: angle.terms.join(ANGLE_TERMS_SEPARATOR),
			},
		}),
	)
}

/** `ask pack ...` or `ask answer ...` (first word): refused in one line until the reader station builds them. */
function unbuiltVerbRefusal(params: { argv: readonly string[] }): CommandOutput | undefined {
	const [verb] = params.argv
	if (verb === undefined || !UNBUILT_ASK_VERBS.some((unbuilt) => unbuilt === verb)) return undefined
	return refused({ message: fillMessage({ template: ASK_MESSAGES.unbuiltVerb, values: { verb } }) })
}

/** A refusal: `ask: <message>`, the usage lines after it for a usage error; exit 2 unless told. */
function refused(params: {
	message: string
	usage?: boolean
	exitCode?: CommandOutput['exitCode']
}): CommandOutput {
	return {
		output: textOf([
			`${ASK_COMMAND}: ${params.message}`,
			...(params.usage === true ? COMMAND_MAP.ask.usage : []),
			'',
		]),
		exitCode: params.exitCode ?? 2,
	}
}
