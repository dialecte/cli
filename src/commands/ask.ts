/**
 * `dialecte ask "<question>"`: the answer ladder, rungs 0-3 (a fact, the definition, the catalogues and api
 * indexes, the documents' slices), the ask kept as a folder, its events written, the lot's standard note.
 */
import { join } from 'node:path'

import { COMMAND_MAP } from '../lib/command-map/command-map.constants.ts'
import { askEventsOf } from '../lib/knowledge/ask/ask-events-of.ts'
import { askFolderOf } from '../lib/knowledge/ask/ask-folder-of.ts'
import {
	ASK_RECORD_FILE,
	KIND_SLOT_NEEDS,
	LOT_ANSWER_NEXT,
	NAME_SEPARATOR,
	REQUEST_RECORD_FILE,
	RUNG_ONE_FACT_SOURCE,
	RUNG_TWO_FACT_SOURCE,
} from '../lib/knowledge/ask/ask.constants.ts'
import { claimAskId } from '../lib/knowledge/ask/claim-ask-id.ts'
import { loadAskSetup } from '../lib/knowledge/ask/load-ask-setup.ts'
import { loadStandardIndexes } from '../lib/knowledge/ask/load-standard-indexes.ts'
import { lotHomeOf } from '../lib/knowledge/ask/lot-home-of.ts'
import { noStandardRefusalOf } from '../lib/knowledge/ask/no-standard-refusal-of.ts'
import { placedDialecteOf } from '../lib/knowledge/ask/placed-dialecte-of.ts'
import { raiseAskQuestion } from '../lib/knowledge/ask/raise-ask-question.ts'
import { reaskUnchecked } from '../lib/knowledge/ask/reask-unchecked.ts'
import { runLadder } from '../lib/knowledge/ask/run-ladder.ts'
import { selectStandard } from '../lib/knowledge/ask/select-standard.ts'
import { standardKeyOf } from '../lib/knowledge/ask/standard-key-of.ts'
import { writeAskEvent } from '../lib/knowledge/ask/write-ask-event.ts'
import { rewriteLotNote } from '../lib/knowledge/ask/write-standard-note.ts'
import { factsFolderRefusal } from '../lib/knowledge/facts/data-folder.ts'
import { fillMessage } from '../lib/knowledge/standard/fill-message.ts'
import { endedOf, jsonOf, printLines, printOut, textOf } from '../lib/print/print.ts'
import { createStepProgress } from '../lib/progress/step-progress.ts'
import { createStreamLiveOutput } from '../lib/progress/stream-live-output.ts'
import { createSystemClock } from '../lib/progress/system-clock.ts'
import { readArguments } from '../lib/review-rounds/round-arguments.ts'
import { effectiveEffort } from '../lib/risk/risk-records.ts'
import { readStandardRoot } from '../lib/standard/read-standard-root.ts'
import { BRIEF_EFFORTS } from '../lib/store/brief.constants.ts'
import { recordText, replaceWhole } from '../lib/store/publish.ts'
import { runAskAnswer } from './ask-answer.ts'
import { runAskPack } from './ask-pack.ts'
import { runAskVerdict } from './ask-verdict.ts'
import {
	ABOUT_TEMPLATES,
	ANGLE_TERMS_SEPARATOR,
	ANSWER_VERB,
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
	PACK_VERB,
	REASK_FALLBACK_KIND,
	VERDICT_VERB,
} from './ask.constants.ts'

import type { CommandOutput } from '../lib/command-output.types.ts'
import type {
	AskFolder,
	AskKind,
	AskOutcome,
	AskRequest,
	AskRequestRecord,
	AskSetup,
	AskStandard,
	ManifestFile,
	RungTiming,
	StandardSelection,
} from '../lib/knowledge/ask/ask.types.ts'
import type { FactSubjectTag } from '../lib/knowledge/facts/facts.types.ts'
import type { RoundArguments } from '../lib/review-rounds/review-rounds.types.ts'
import type { LoadedDialecte } from '../lib/schema/schema.types.ts'
import type { BriefEffort } from '../lib/store/brief.types.ts'
import type {
	AskJson,
	AskStandardJson,
	RequestRecordOfParams,
	RequestStandard,
	RunAskParams,
} from './ask.types.ts'

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
	if (params.argv[0] === PACK_VERB) return runAskPack({ ...params, argv: params.argv.slice(1) })
	if (params.argv[0] === VERDICT_VERB)
		return runAskVerdict({ ...params, argv: params.argv.slice(1) })
	if (params.argv[0] === ANSWER_VERB) return runAskAnswer({ ...params, argv: params.argv.slice(1) })
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
	const prepared = await askSetupOf({ params, environment, request })
	if ('output' in prepared) return prepared.output
	const { setup, selection, documentsRead } = prepared

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
	if (!request.noFacts && setup.standard.kind === 'documents')
		reaskFor({ place, setup, selection, request, documentsRead })
	const json = askJsonOf({
		ask,
		request,
		outcome,
		environment,
		selection,
		standard: setup.standard,
	})
	writeAskRecords({ place, ask, request, outcome, json, documentsRead, rungs })
	const told = await lotFollowUp({
		place,
		lotHome,
		ask,
		question: request.question,
		outcome,
		json,
		now: setup.now,
	})
	return {
		output: read.flags.has('json')
			? endedOf(jsonOf(told, '\t'))
			: textOf([...answerLinesOf({ json: told, outcome }), '']),
		exitCode: ASK_EXIT_CODES[outcome.state],
	}
}

/**
 * What the ask reads before the ladder runs: the setup (facts read unless `--no-facts`, the ledger checked), the
 * dialecte its question places, the standard selected for it and its documents (none with `--no-standard`, refused
 * while documents are readable); or the answer that stops the ask (nothing written).
 */
async function askSetupOf(params: {
	params: RunAskParams
	environment: NodeJS.ProcessEnv
	request: AskRequest
}): Promise<
	| {
			setup: AskSetup
			selection: Exclude<StandardSelection, { refused: string }>
			documentsRead: RequestStandard
	  }
	| { output: CommandOutput }
> {
	const { environment, request } = params
	const loaded = await loadAskSetup({
		cwd: params.params.cwd,
		environment,
		packageName: request.packageName,
		facts: !request.noFacts,
	})
	if ('refused' in loaded) return { output: refused({ message: loaded.refused }) }
	const base = loaded.setup
	const factsRefusal = request.noFacts
		? undefined
		: factsFolderRefusal({ folder: base.factsFolder })
	if (factsRefusal !== undefined) return { output: refused({ message: factsRefusal }) }

	const placed = placedDialecteOf({ request, base })
	if ('refused' in placed) return { output: refused({ message: placed.refused }) }
	const selection = selectStandard({ environment, standardName: placed.dialecte?.standard })
	if ('refused' in selection) return { output: refused({ message: selection.refused }) }
	// the line of 32m: documents exist, under other names than the dialecte's standard (an empty root says nothing)
	if (selection.kind === 'none' && selection.line !== null && selection.known.length > 0)
		printLines({ stream: 'stderr', lines: [selection.line] })
	// --no-standard is decided from the selection and the folders' files, before any index is built
	const noStandard = request.noStandard
		? noStandardRefusalOf({ environment, selection })
		: undefined
	if (noStandard !== undefined) return { output: refused({ message: noStandard }) }
	const documents = request.noStandard
		? { standard: noDocumentsOf({ selection }), manifest: [] }
		: await standardOf({ params: params.params, environment, selection, placed })
	if ('output' in documents) return documents
	const setup: AskSetup = { ...base, standard: documents.standard }
	return {
		setup,
		selection,
		documentsRead: { standard: setup.standard, selection, manifest: documents.manifest },
	}
}

/** Writes the ask's records: `ask.json` (the `--json` object), `request.json` (what it read, D2) and its events. */
function writeAskRecords(params: {
	place: AskFolder
	ask: string
	request: AskRequest
	outcome: AskOutcome
	json: AskJson
	documentsRead: RequestStandard
	rungs: RungTiming[]
}): void {
	const { place, ask, request, outcome } = params
	replaceWhole({ path: join(place.folder, ask, ASK_RECORD_FILE), text: recordText(params.json) })
	writeRequest({
		folder: join(place.folder, ask),
		record: requestRecordOf({
			question: request.question,
			about: request.about ?? null,
			code: request.code ?? null,
			method: request.method ?? null,
			packageName: request.packageName ?? null,
			kind: outcome.kind,
			decision: request.decision,
			limit: request.limit,
			effort: request.effort,
			documentsRead: params.documentsRead,
		}),
	})
	writeEvents({ place, ask, request, outcome, rungs: params.rungs })
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
 * The documents the ask reads: the indexes of the selected folders (built in the cache when missing) and their
 * files as read, or none; the answer that stops the ask when the load refuses (exit 2) or a build aborts (exit 1).
 */
async function standardOf(params: {
	params: RunAskParams
	environment: NodeJS.ProcessEnv
	selection: Exclude<StandardSelection, { refused: string }>
	placed: { dialecte: LoadedDialecte | undefined }
}): Promise<{ standard: AskStandard; manifest: ManifestFile[] } | { output: CommandOutput }> {
	const { selection } = params
	if (selection.kind === 'none') return { standard: noDocumentsOf({ selection }), manifest: [] }
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
	if (loaded.standard.folders.length === 0)
		return { standard: noDocumentsOf({ selection }), manifest: [] }
	return { standard: loaded.standard, manifest: loaded.manifest }
}

/** No document to read for the selection: the outside route, the declared name and its key kept. */
function noDocumentsOf(params: {
	selection: Exclude<StandardSelection, { refused: string }>
}): AskStandard {
	return { kind: 'none', name: params.selection.name, key: params.selection.key }
}

/**
 * Re-asks the unchecked facts of the dialectes whose standard the selected documents are (D15): one ask each, its
 * record holding the question only, its request made from the fact (question, subject, kind, package) and the
 * documents the ask read (D2), never the fact's answer.
 */
function reaskFor(params: {
	place: AskFolder
	setup: AskSetup
	selection: Exclude<StandardSelection, { refused: string }>
	request: AskRequest
	documentsRead: RequestStandard
}): void {
	const { place, setup, selection, request } = params
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
		keep: function keepReask({ ask, question, fact, subject, kind }) {
			replaceWhole({
				path: join(place.folder, ask, ASK_RECORD_FILE),
				text: recordText({ ask, question, state: 'needs-readers', fact: null, reask: fact }),
			})
			const [tag] = subject.tags
			writeRequest({
				folder: join(place.folder, ask),
				record: requestRecordOf({
					question,
					about: tag === undefined ? null : aboutTextOf({ tag, attribute: subject.attributes[0] }),
					code: subject.codes[0] ?? null,
					method: subject.methods[0] ?? null,
					packageName: subject.package,
					kind: isAskKind(kind) ? kind : REASK_FALLBACK_KIND,
					decision: false,
					limit: DEFAULT_ASK_LIMIT,
					effort: request.effort,
					documentsRead: params.documentsRead,
				}),
			})
		},
	})
}

/** The `--about` that names a fact's subject tag (and its first attribute): `[parent/]tag[@attribute]`. */
function aboutTextOf(params: { tag: FactSubjectTag; attribute: string | undefined }): string {
	const { tag, attribute } = params
	const placed =
		tag.parent === null
			? tag.tag
			: fillMessage({
					template: ABOUT_TEMPLATES.parent,
					values: { parent: tag.parent, tag: tag.tag },
				})
	return attribute === undefined
		? placed
		: fillMessage({ template: ABOUT_TEMPLATES.attribute, values: { about: placed, attribute } })
}

/** The request record of an ask (D2): what it asked and the documents it read, each file with its sha256 and lines. */
function requestRecordOf(params: RequestRecordOfParams): AskRequestRecord {
	const { standard, selection, manifest } = params.documentsRead
	const documents = standard.kind === 'documents'
	return {
		schema: 1,
		question: params.question,
		about: params.about,
		code: params.code,
		method: params.method,
		package: params.packageName,
		kind: params.kind,
		decision: params.decision,
		limit: params.limit,
		effort: params.effort,
		documents,
		standard: {
			name: selection.name,
			key: selection.key,
			folders: documents ? standard.folders.map((folder) => folder.id) : [],
			files: documents ? manifest : [],
		},
	}
}

/** Writes `request.json` beside the ask's record, whole (temporary file, then rename). */
function writeRequest(params: { folder: string; record: AskRequestRecord }): void {
	replaceWhole({
		path: join(params.folder, REQUEST_RECORD_FILE),
		text: recordText(params.record),
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

/**
 * What an ask of a lot does after its record: an ask past rung 2 (documents or outside readers) rewrites the lot's
 * note (D12); one that reaches the person in a store lot raises its question there (rung 6) and names its lot answer
 * as next (J-1), while elsewhere the `ask answer` command it prints is the way. Answers the ask's json as it stands.
 */
async function lotFollowUp(params: {
	place: AskFolder
	lotHome: string | undefined
	ask: string
	question: string
	outcome: AskOutcome
	json: AskJson
	now: (() => Date) | undefined
}): Promise<AskJson> {
	const { place, outcome, json } = params
	if (outcome.rung === 3 || outcome.source === 'outside')
		await rewriteLotNote({ lotHome: params.lotHome, asksFolder: place.folder, now: params.now })
	if (outcome.state !== 'needs-person' || place.lotFolder === null) return json
	const raised = raiseAskQuestion({
		lotFolder: place.lotFolder,
		ask: params.ask,
		question: params.question,
		now: params.now,
	})
	if (raised === null || place.lotName === null) return json
	// the person of a store lot answers with lot answer (J-1): ask.json written again with that next
	const told: AskJson = {
		...json,
		next: fillMessage({
			template: LOT_ANSWER_NEXT,
			values: { lot: place.lotName, question: raised },
		}),
	}
	replaceWhole({ path: join(place.folder, params.ask, ASK_RECORD_FILE), text: recordText(told) })
	return told
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
