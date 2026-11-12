/**
 * `dialecte facts list | show | forget`: reads and retires the facts ledger in the data folder
 * (`$XDG_DATA_HOME/dialecte/facts`, else `$HOME/.local/share/dialecte/facts`). Nothing is ever deleted: a forgotten fact
 * keeps its file and says why in its history. Every verb refuses a ledger inside a git work tree.
 */
import { closestNames } from '../lib/closest-names.ts'
import { COMMAND_MAP } from '../lib/command-map/command-map.constants.ts'
import { factCheckOf } from '../lib/knowledge/facts/command-check.ts'
import { factsFolder, factsFolderRefusal } from '../lib/knowledge/facts/data-folder.ts'
import { readHistory } from '../lib/knowledge/facts/fact-history.ts'
import { FACT_ID_PATTERN } from '../lib/knowledge/facts/facts.constants.ts'
import {
	factIdsOf,
	listFacts,
	readFact,
	readsSchemaSource,
} from '../lib/knowledge/facts/read-facts.ts'
import { historyLineOf, updateFact } from '../lib/knowledge/facts/record-fact.ts'
import { fillMessage } from '../lib/knowledge/standard/fill-message.ts'
import { NAME_LIST_SEPARATOR } from '../lib/knowledge/standard/standard-input.constants.ts'
import { endedOf, jsonOf, printOut, textOf } from '../lib/print/print.ts'
import { readArguments } from '../lib/review-rounds/round-arguments.ts'
import { stableJson } from '../lib/stable-json.ts'
import {
	CLOSEST_ID_LIMIT,
	COLUMN_SEPARATOR,
	CUT_MARK,
	FACTS_COMMAND,
	FACTS_MESSAGES,
	FACTS_VERB_OPTIONS,
	HISTORY_INDENT,
	HISTORY_SHOWN_FIRST,
	LIST_STATES,
	QUESTION_CUT,
	REASON_MARK,
	UNCHECKED_STATE,
} from './facts.constants.ts'

import type { CommandOutput } from '../lib/command-output.types.ts'
import type { Fact, FactCheck, FactView, HistoryLine } from '../lib/knowledge/facts/facts.types.ts'
import type { PrintedText } from '../lib/print/print.types.ts'
import type {
	FactShowJson,
	FactsVerb,
	FactsVerbParams,
	ListState,
	RunFactsParams,
} from './facts.types.ts'

/** Runs the command on the process's command line. */
export async function run(argv: string[]): Promise<void> {
	const result = await runFacts({ argv, cwd: process.cwd() })
	printOut({ stream: 'stdout', text: result.output, ending: 'as-is' })
	process.exitCode = result.exitCode
}

/** Runs one verb and answers its text and exit code. */
export async function runFacts(params: RunFactsParams): Promise<CommandOutput> {
	const [verbWord, ...rest] = params.argv
	if (!isFactsVerb(verbWord))
		return usageError({ prefix: FACTS_COMMAND, message: FACTS_MESSAGES.unknownVerb })
	const options = FACTS_VERB_OPTIONS[verbWord]
	const read = readArguments({
		argv: rest,
		valueOptions: options.valueOptions,
		flags: options.flags,
	})
	if (typeof read === 'string') return verbError({ verb: verbWord, message: read })
	const environment = params.environment ?? process.env
	const verbParams: FactsVerbParams = {
		...params,
		environment,
		read,
		// the environment's home (an empty one is unset), else the process's
		folder: factsFolder({ environment, home: environment.HOME || undefined }),
	}
	if (verbWord === 'list') return runList(verbParams)
	if (verbWord === 'show') return runShow(verbParams)
	return runForget(verbParams)
}

function isFactsVerb(word: string | undefined): word is FactsVerb {
	return word !== undefined && Object.hasOwn(FACTS_VERB_OPTIONS, word)
}

/** `list`: every key's current fact (any state), those of one state, or every fact file (`--state all`). */
async function runList(params: FactsVerbParams): Promise<CommandOutput> {
	const { read, folder } = params
	if (read.words.length > 0) return unexpectedWords({ verb: 'list', words: read.words })
	const state = read.values.get('state')
	if (state !== undefined && !isListState(state))
		return verbError({
			verb: 'list',
			message: fillMessage({
				template: FACTS_MESSAGES.unknownState,
				values: { state, states: LIST_STATES.join(NAME_LIST_SEPARATOR) },
			}),
		})
	const refusal = refusalOf({ verb: 'list', folder })
	if (refusal) return refusal
	const check = await checkOf({ verb: params, ids: factIdsOf({ folder }) })
	const about = read.values.get('about')
	const views = listFacts({ folder, check }).filter(
		(view) => isInState({ view, state }) && isAbout({ view, about }),
	)
	if (read.flags.has('json')) return answered(jsonAnswerOf({ facts: views }))
	if (views.length === 0)
		return answered(
			textOf([noFactsLineOf({ params, filtered: state !== undefined || about !== undefined }), '']),
		)
	return answered(textOf([...views.map(listLineOf), '']))
}

/** `show <id>`: the fact, its state now and its history in order. */
async function runShow(params: FactsVerbParams): Promise<CommandOutput> {
	const { read, folder } = params
	const [id, ...extra] = read.words
	if (id === undefined) return verbError({ verb: 'show', message: FACTS_MESSAGES.needsId })
	if (extra.length > 0) return unexpectedWords({ verb: 'show', words: extra })
	const refusal = refusalOf({ verb: 'show', folder })
	if (refusal) return refusal
	// an id that is not F-<n> never names a file: nothing is read for it
	const check = await checkOf({ verb: params, ids: FACT_ID_PATTERN.test(id) ? [id] : [] })
	const view = knownViewOf({ folder, id, check })
	if (view.kind === 'output') return view.output
	const { fact } = view
	const history = readHistory({ folder, id: fact.id })
	if (read.flags.has('json')) {
		const shown: FactShowJson = {
			fact,
			state: view.view.state,
			current: view.view.current,
			...(view.view.reason === undefined ? {} : { reason: view.view.reason }),
			history,
		}
		return answered(jsonAnswerOf(shown))
	}
	return answered(textOf([...showLinesOf({ view: view.view, fact, history }), '']))
}

/** `forget <id> --reason <text>`: state `forgotten` and a `forgotten` line holding the reason; nothing deleted. */
async function runForget(params: FactsVerbParams): Promise<CommandOutput> {
	const { read, folder } = params
	const [id, ...extra] = read.words
	if (id === undefined) return verbError({ verb: 'forget', message: FACTS_MESSAGES.needsId })
	if (extra.length > 0) return unexpectedWords({ verb: 'forget', words: extra })
	const reason = read.values.get('reason')
	if (reason === undefined || reason.trim() === '')
		return verbError({ verb: 'forget', message: FACTS_MESSAGES.needsReason })
	const refusal = refusalOf({ verb: 'forget', folder })
	if (refusal) return refusal
	const view = knownViewOf({ folder, id, check: undefined })
	if (view.kind === 'output') return view.output
	const already = view.fact.state === 'forgotten'
	if (!already)
		updateFact({
			folder,
			fact: view.fact,
			changes: { state: 'forgotten' },
			line: {
				...historyLineOf({
					context: { at: new Date().toISOString(), lot: null, ask: null },
					event: 'forgotten',
					fact: view.fact.id,
				}),
				// whole: the fitted line cuts it (code points, `cut: true`)
				reason,
			},
		})
	if (read.flags.has('json'))
		return answered(jsonAnswerOf({ id: view.fact.id, state: 'forgotten', already }))
	return answered(
		textOf([
			fillMessage({
				template: already ? FACTS_MESSAGES.forgottenAlready : FACTS_MESSAGES.forgotten,
				values: { id: view.fact.id },
			}),
			'',
		]),
	)
}

/**
 * The check of a read of these fact ids: the injected one, else the command's own, which loads the installed
 * dialectes only when one of the facts holds a schema source (D17).
 */
async function checkOf(params: {
	verb: FactsVerbParams
	ids: readonly string[]
}): Promise<FactCheck> {
	const { verb } = params
	if (verb.check !== undefined) return verb.check
	const needsDialectes = readsSchemaSource({ folder: verb.folder, ids: params.ids })
	return factCheckOf({
		environment: verb.environment,
		cwd: verb.cwd,
		loadDialectes: needsDialectes ? verb.loadDialectes : null,
	})
}

/** The refusal of a ledger inside a git work tree (exit 2), undefined when none holds it. */
function refusalOf(params: { verb: FactsVerb; folder: string }): CommandOutput | undefined {
	const refusal = factsFolderRefusal({ folder: params.folder })
	return refusal === undefined
		? undefined
		: verbError({ verb: params.verb, message: refusal, usage: false })
}

/**
 * The readable fact of an id, with its view; else the answer that stops the verb: an unknown id (exit 1, the
 * closest ids named) or a file that is not readable JSON (exit 1, its path).
 */
function knownViewOf(params: {
	folder: string
	id: string
	check: FactCheck | undefined
}): { kind: 'fact'; view: FactView; fact: Fact } | { kind: 'output'; output: CommandOutput } {
	const { folder, id } = params
	// an id that is not F-<n> never names a file: no path is built from it
	const view = FACT_ID_PATTERN.test(id) ? readFact({ folder, id, check: params.check }) : undefined
	if (view === undefined) return { kind: 'output', output: unknownIdOutput({ folder, id }) }
	if (view.fact === undefined)
		return {
			kind: 'output',
			output: failure(
				fillMessage({ template: FACTS_MESSAGES.unreadable, values: { path: view.path } }),
			),
		}
	return { kind: 'fact', view, fact: view.fact }
}

function unknownIdOutput(params: { folder: string; id: string }): CommandOutput {
	const closest = closestNames({
		name: params.id,
		candidates: factIdsOf({ folder: params.folder }),
		limit: CLOSEST_ID_LIMIT,
	})
	return failure(
		fillMessage({
			template: FACTS_MESSAGES.unknownId,
			values: {
				id: params.id,
				folder: params.folder,
				closest:
					closest.length === 0
						? ''
						: fillMessage({
								template: FACTS_MESSAGES.closest,
								values: { names: closest.join(NAME_LIST_SEPARATOR) },
							}),
			},
		}),
	)
}

function isListState(state: string): state is ListState {
	return (LIST_STATES as readonly string[]).includes(state)
}

/**
 * Whether `list` shows the view: without `--state`, every key's current fact; `all`, every fact file; `orphan`, the
 * fact files no pointer names; `unchecked`, the current unchecked facts and valid person facts given without
 * documents; any other state, the current facts in that state now.
 */
function isInState(params: { view: FactView; state: ListState | undefined }): boolean {
	const { view, state } = params
	if (state === 'all') return true
	if (state === 'orphan') return view.state === 'orphan'
	if (!view.current) return false
	if (state === undefined) return true
	if (state === UNCHECKED_STATE) return view.state === UNCHECKED_STATE || isPersonUnchecked(view)
	return view.state === state
}

/** A valid person fact given without documents (`unchecked: true`). */
function isPersonUnchecked(view: FactView): boolean {
	return view.state === 'valid' && view.fact?.unchecked === true
}

/** Whether the fact's subject holds the `--about` tag (as a tag, never as a parent); every view without one. */
function isAbout(params: { view: FactView; about: string | undefined }): boolean {
	if (params.about === undefined) return true
	return params.view.fact?.subject.tags.some((tag) => tag.tag === params.about) ?? false
}

/**
 * A `list` line: id, state now, effort, source, superseded by, the question cut, then why the check found it stale
 * or unverifiable and the fix; an unreadable file with its path.
 */
function listLineOf(view: FactView): string {
	const { fact } = view
	if (fact === undefined) return [view.id, view.state, view.path].join(COLUMN_SEPARATOR)
	return [
		view.id,
		stateLabelOf(view),
		fact.effort,
		fact.source,
		...(fact.supersededBy === null ? [] : [`superseded by ${fact.supersededBy}`]),
		cutQuestion(fact.question),
		...reasonColumnOf(view),
	].join(COLUMN_SEPARATOR)
}

/** The reason column of a view the check found stale or unverifiable: `- <what failed and the fix>`; none else. */
function reasonColumnOf(view: FactView): string[] {
	return view.reason === undefined || view.reason === '' ? [] : [`${REASON_MARK}${view.reason}`]
}

/** The state now, `unchecked` added for a valid person fact given without documents. */
function stateLabelOf(view: FactView): string {
	return isPersonUnchecked(view) ? `${view.state} (${UNCHECKED_STATE})` : view.state
}

function cutQuestion(question: string): string {
	return question.length <= QUESTION_CUT
		? question
		: `${question.slice(0, QUESTION_CUT - CUT_MARK.length)}${CUT_MARK}`
}

/** `show` as text: the fact's head, its question, answer, origin, sources, evidence count, then its history. */
function showLinesOf(params: { view: FactView; fact: Fact; history: HistoryLine[] }): string[] {
	const { view, fact } = params
	const standing = view.current
		? 'current'
		: fact.supersededBy === null
			? 'not current'
			: `superseded by ${fact.supersededBy}`
	return [
		[fact.id, stateLabelOf(view), standing, ...reasonColumnOf(view)].join(COLUMN_SEPARATOR),
		`question${COLUMN_SEPARATOR}${fact.question}`,
		[
			'answer',
			fact.answer.verdict,
			...(fact.answer.value === null ? [] : [fact.answer.value]),
			fact.answer.text,
		].join(COLUMN_SEPARATOR),
		[
			'source',
			fact.source,
			`effort ${fact.effort}`,
			`recorded ${fact.at}`,
			...(fact.supersedes === null ? [] : [`supersedes ${fact.supersedes}`]),
		].join(COLUMN_SEPARATOR),
		...(fact.sources.length === 0
			? [`sources${COLUMN_SEPARATOR}none`]
			: fact.sources.map((source) => `sources${COLUMN_SEPARATOR}${stableJson(source)}`)),
		`evidence${COLUMN_SEPARATOR}${fact.evidence.length}`,
		'history',
		...params.history.map(historyTextOf),
	]
}

/** One history line under `show`: when, what, then its other members (lot, ask, reason...). */
function historyTextOf(line: HistoryLine): string {
	const others = Object.entries(line)
		.filter(
			([name, value]) =>
				!(HISTORY_SHOWN_FIRST as readonly string[]).includes(name) && value !== null,
		)
		.map(([name, value]) => `${name} ${typeof value === 'string' ? value : stableJson(value)}`)
	return `${HISTORY_INDENT}${[line.at, line.event, ...others].join(COLUMN_SEPARATOR)}`
}

function noFactsLineOf(params: { params: FactsVerbParams; filtered: boolean }): string {
	return fillMessage({
		template: params.filtered ? FACTS_MESSAGES.noneMatch : FACTS_MESSAGES.noFacts,
		values: { folder: params.params.folder },
	})
}

function unexpectedWords(params: { verb: FactsVerb; words: string[] }): CommandOutput {
	return verbError({
		verb: params.verb,
		message: fillMessage({
			template: FACTS_MESSAGES.unexpectedWords,
			values: { words: params.words.join(' ') },
		}),
	})
}

/** A verb's usage error or refusal: `facts <verb>: <message>`, then the usage lines unless told, exit 2. */
function verbError(params: { verb: FactsVerb; message: string; usage?: boolean }): CommandOutput {
	return usageError({
		prefix: `${FACTS_COMMAND} ${params.verb}`,
		message: params.message,
		usage: params.usage,
	})
}

function usageError(params: { prefix: string; message: string; usage?: boolean }): CommandOutput {
	return {
		output: textOf([
			`${params.prefix}: ${params.message}`,
			...(params.usage === false ? [] : COMMAND_MAP.facts.usage),
			'',
		]),
		exitCode: 2,
	}
}

/** A verb that found nothing to act on: exit 1. */
function failure(message: string): CommandOutput {
	return { output: textOf([`${FACTS_COMMAND}: ${message}`, '']), exitCode: 1 }
}

function answered(output: PrintedText): CommandOutput {
	return { output, exitCode: 0 }
}

/** `content` as the JSON a verb answers: tab-indented, its last line ended. */
function jsonAnswerOf(content: unknown): PrintedText {
	return endedOf(jsonOf(content, '\t'))
}
