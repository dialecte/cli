/**
 * `dialecte standard index | find | show | eval`: builds and reads the index of the standards a person keeps
 * on their machine (one folder per standard under `DIALECTE_STANDARD`), and answers from it. The index lives
 * in the cache (`$XDG_CACHE_HOME/dialecte`, else `~/.cache/dialecte`); nothing is written anywhere else, and
 * neither the root, a standard folder nor the cache may lie inside a git work tree.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { closestNames } from '../lib/closest-names.ts'
import { COMMAND_MAP } from '../lib/command-map/command-map.constants.ts'
import { ladderSlicesOf } from '../lib/knowledge/ask/ladder-slices-of.ts'
import { loadAskSetup } from '../lib/knowledge/ask/load-ask-setup.ts'
import { loadStandardIndexes } from '../lib/knowledge/ask/load-standard-indexes.ts'
import { identityOf } from '../lib/knowledge/ask/merge-slices.ts'
import { evaluateGold } from '../lib/knowledge/standard/evaluate-gold.ts'
import { fillMessage } from '../lib/knowledge/standard/fill-message.ts'
import { findInStandard } from '../lib/knowledge/standard/find-in-standard.ts'
import { logicalLinesIn } from '../lib/knowledge/standard/logical-lines-in.ts'
import { matchableTextOf } from '../lib/knowledge/standard/matchable-text-of.ts'
import { showStandardRange } from '../lib/knowledge/standard/show-standard-range.ts'
import { MANIFEST_HASH_PREFIX } from '../lib/knowledge/standard/standard-cache.constants.ts'
import { NAME_LIST_SEPARATOR } from '../lib/knowledge/standard/standard-input.constants.ts'
import { DEFAULT_FIND_LIMIT } from '../lib/knowledge/standard/standard-search.constants.ts'
import { endedOf, jsonOf, printOut, textOf } from '../lib/print/print.ts'
import { formatDuration } from '../lib/progress/format-duration.ts'
import { createStepProgress } from '../lib/progress/step-progress.ts'
import { createStreamLiveOutput } from '../lib/progress/stream-live-output.ts'
import { createSystemClock } from '../lib/progress/system-clock.ts'
import { readArguments } from '../lib/review-rounds/round-arguments.ts'
import {
	ADDED_LINE_PREFIX,
	CLOSEST_NAME_LIMIT,
	COLUMN_SEPARATOR,
	LIMIT_PATTERN,
	NOISE_PERCENT_DECIMALS,
	NOISE_RATIO_DECIMALS,
	QUOTE_LINE_SEPARATOR,
	RANGE_ARGUMENT_PATTERN,
	RECALL_DECIMALS,
	REPEATED_LINES_SHOWN,
	REPEATED_TEXT_CUT,
	SHORT_MANIFEST_LENGTH,
	SKIPPED_STATE,
	STANDARD_COMMAND,
	STANDARD_MESSAGES,
	STANDARD_VERB_OPTIONS,
	VOCABULARY_LINE,
	WIDE_FIND_LIMIT,
} from './standard.constants.ts'

import type { CommandOutput } from '../lib/command-output.types.ts'
import type { AskSetup } from '../lib/knowledge/ask/ask.types.ts'
import type {
	StandardInstalledVocabulary,
	StandardReadyIndex,
} from '../lib/knowledge/standard/standard-cache.types.ts'
import type { StandardFileIndex } from '../lib/knowledge/standard/standard-index.types.ts'
import type {
	StandardEvaluation,
	StandardGoldExpected,
	StandardGoldItem,
	StandardSearchIndex,
	StandardSlice,
} from '../lib/knowledge/standard/standard-search.types.ts'
import type { PrintedText } from '../lib/print/print.types.ts'
import type {
	GoldFind,
	OpenedStandards,
	OpenedStandardsAnswer,
	OpenStandardsParams,
	RunStandardParams,
	StandardFileSummary,
	StandardIndexJsonEntry,
	StandardVerb,
	StandardVerbParams,
} from './standard.types.ts'

export async function run(argv: string[]): Promise<void> {
	const result = await runStandard({ argv, cwd: process.cwd() })
	printOut({ stream: 'stdout', text: result.output, ending: 'as-is' })
	process.exitCode = result.exitCode
}

export async function runStandard(params: RunStandardParams): Promise<CommandOutput> {
	const [verbWord, ...rest] = params.argv
	if (!isStandardVerb(verbWord))
		return {
			output: textOf([
				`${STANDARD_COMMAND}: ${STANDARD_MESSAGES.unknownVerb}`,
				...COMMAND_MAP.standard.usage,
				'',
			]),
			exitCode: 2,
		}
	const options = STANDARD_VERB_OPTIONS[verbWord]
	const read = readArguments({
		argv: rest,
		valueOptions: options.valueOptions,
		flags: options.flags,
	})
	if (typeof read === 'string') return verbError({ verb: verbWord, message: read })
	const verbParams: StandardVerbParams = {
		...params,
		environment: params.environment ?? process.env,
		read,
	}
	if (verbWord === 'index') return runIndex(verbParams)
	if (verbWord === 'find') return runFind(verbParams)
	if (verbWord === 'show') return runShow(verbParams)
	return runEval(verbParams)
}

function isStandardVerb(word: string | undefined): word is StandardVerb {
	return word !== undefined && Object.hasOwn(STANDARD_VERB_OPTIONS, word)
}

/** `index`: builds or reuses each selected standard's index and prints its quality. */
async function runIndex(params: StandardVerbParams): Promise<CommandOutput> {
	const { read } = params
	if (read.words.length > 0) return unexpectedWords({ verb: 'index', words: read.words })
	const opened = await openStandards({
		verb: 'index',
		params,
		scores: true,
		standardId: read.values.get('standard'),
		rebuild: read.flags.has('rebuild'),
	})
	if (opened.kind === 'output') return opened.output
	const { installed } = opened.opened
	return {
		output: read.flags.has('json')
			? jsonAnswerOf({ vocabulary: vocabularyJsonOf(installed), ...indexJsonOf(opened.opened) })
			: textOf([vocabularyLineOf(installed), ...indexLinesOf(opened.opened), '']),
		exitCode: opened.opened.indexes.length === 0 ? 1 : 0,
	}
}

/** `find`: the ranked slices of every selected standard, linked slices after the direct ones. */
async function runFind(params: StandardVerbParams): Promise<CommandOutput> {
	const { read } = params
	const query = read.words.join(' ').trim()
	if (query === '') return verbError({ verb: 'find', message: STANDARD_MESSAGES.needsTerms })
	const limitValue = read.values.get('limit')
	if (limitValue !== undefined && !LIMIT_PATTERN.test(limitValue))
		return verbError({
			verb: 'find',
			message: fillMessage({ template: STANDARD_MESSAGES.badLimit, values: { value: limitValue } }),
		})
	const about = read.values.get('about')
	const opened = await openStandards({
		verb: 'find',
		params,
		scores: true,
		standardId: read.values.get('standard'),
		about,
	})
	if (opened.kind === 'output') return opened.output
	const { indexes, installed } = opened.opened
	if (indexes.length === 0)
		return verbError({ verb: 'find', message: STANDARD_MESSAGES.noIndexableFile, exitCode: 1 })
	const slices = findInStandard({
		indexes: indexes.map((index) => index.search),
		query,
		about,
		limit: limitValue === undefined ? undefined : Number(limitValue),
	})
	if (read.flags.has('json'))
		return {
			output: jsonAnswerOf({
				vocabulary: vocabularyJsonOf(installed),
				query,
				about: about ?? null,
				slices,
			}),
			exitCode: slices.length === 0 ? 1 : 0,
		}
	if (slices.length === 0)
		return verbError({
			verb: 'find',
			message: fillMessage({ template: STANDARD_MESSAGES.nothingMatched, values: { query } }),
			exitCode: 1,
		})
	return {
		output: textOf([vocabularyLineOf(installed), ...findLinesOf({ slices, indexes }), '']),
		exitCode: 0,
	}
}

/** `show`: the logical lines of a range of one file, its standard's index built when missing. */
async function runShow(params: StandardVerbParams): Promise<CommandOutput> {
	const [argument = '', ...extra] = params.read.words
	if (extra.length > 0) return unexpectedWords({ verb: 'show', words: extra })
	const match = RANGE_ARGUMENT_PATTERN.exec(argument)
	const from = Number(match?.[2])
	const to = Number(match?.[3])
	if (!match || from < 1)
		return verbError({
			verb: 'show',
			message: fillMessage({ template: STANDARD_MESSAGES.showExpected, values: { argument } }),
		})
	const fileId = match[1].toLowerCase()
	const [standardId] = fileId.split('/')
	const opened = await openStandards({ verb: 'show', params, standardId, scores: false })
	if (opened.kind === 'output') return opened.output
	const files = opened.opened.indexes.flatMap((index) => index.search.files)
	const file = files.find((candidate) => candidate.fileId === fileId)
	if (!file)
		return verbError({
			verb: 'show',
			message: fillMessage({
				template: STANDARD_MESSAGES.unknownFile,
				values: {
					id: fileId,
					standard: standardId,
					known: files.map((candidate) => candidate.fileId).join(NAME_LIST_SEPARATOR) || 'none',
				},
			}),
		})
	const answer = showStandardRange({ file, from, to })
	if (answer.kind === 'refused')
		return verbError({
			verb: 'show',
			message: fillMessage({
				template:
					answer.reason === 'from-after-to'
						? STANDARD_MESSAGES.fromAfterTo
						: STANDARD_MESSAGES.beyondLastLine,
				values: { argument, id: fileId, lines: String(file.lineCount) },
			}),
		})
	if (answer.kind === 'nothing')
		return verbError({
			verb: 'show',
			message: fillMessage({ template: STANDARD_MESSAGES.nothingToShow, values: { argument } }),
			exitCode: 1,
		})
	if (params.read.flags.has('json'))
		return { output: jsonAnswerOf({ file: fileId, from, to, lines: answer.lines }), exitCode: 0 }
	return {
		output: textOf([
			...answer.lines.map((line) => `${rangeOf(line)}${COLUMN_SEPARATOR}${line.text}`),
			'',
		]),
		exitCode: 0,
	}
}

/** `eval`: the recall of find over a gold file, each miss with its reason. */
async function runEval(params: StandardVerbParams): Promise<CommandOutput> {
	const [goldWord, ...extra] = params.read.words
	if (goldWord === undefined)
		return verbError({ verb: 'eval', message: STANDARD_MESSAGES.evalExpected })
	if (extra.length > 0) return unexpectedWords({ verb: 'eval', words: extra })
	const gold = readGold({ path: resolve(params.cwd, goldWord) })
	if (typeof gold === 'string') return verbError({ verb: 'eval', message: gold })
	const opened = await openStandards({
		verb: 'eval',
		params,
		scores: true,
		standardId: params.read.values.get('standard'),
	})
	if (opened.kind === 'output') return opened.output
	const searches = opened.opened.indexes.map((index) => index.search)
	const finds = await goldFindsOf({ params, opened: opened.opened, searches })
	if ('output' in finds) return finds.output
	const evaluation = evaluateGold({
		items: gold,
		find: ({ item }) => finds.find({ item, limit: DEFAULT_FIND_LIMIT }),
		findWide: ({ item }) => finds.find({ item, limit: WIDE_FIND_LIMIT }),
		files: searches.flatMap((search) => search.files),
	})
	const { installed } = opened.opened
	const added = params.read.flags.has('angles')
		? addedItemsOf({
				items: gold,
				plain: ({ item }) => findForGold({ searches, item, limit: DEFAULT_FIND_LIMIT }),
				angled: ({ item }) => finds.find({ item, limit: DEFAULT_FIND_LIMIT }),
				files: searches.flatMap((search) => search.files),
			})
		: undefined
	const { misses, ...recalls } = evaluation
	return {
		output: params.read.flags.has('json')
			? jsonAnswerOf({
					vocabulary: vocabularyJsonOf(installed),
					...recalls,
					...(added === undefined ? {} : { added }),
					misses,
				})
			: textOf([vocabularyLineOf(installed), ...evalLinesOf({ evaluation, added }), '']),
		exitCode: evaluation.items === 0 ? 1 : 0,
	}
}

/**
 * How many gold items only the slices the angles added hold (`eval --angles`, D27): a quote of the item is in a slice
 * of the angled list that find's own list does not hold, and no slice of find's list holds any quote of it.
 */
function addedItemsOf(params: {
	items: StandardGoldItem[]
	plain: (params: { item: StandardGoldItem }) => StandardSlice[]
	angled: (params: { item: StandardGoldItem }) => StandardSlice[]
	files: StandardFileIndex[]
}): number {
	const files = new Map(params.files.map((file) => [file.fileId, file]))
	return params.items.filter(function onlyAddedHold(item): boolean {
		if (item.expected.length === 0) return false
		const plain = params.plain({ item })
		const known = new Set(plain.map((slice) => identityOf({ slice })))
		const addedSlices = params.angled({ item }).filter((slice) => !known.has(identityOf({ slice })))
		return (
			holdsQuote({ slices: addedSlices, item, files }) &&
			!holdsQuote({ slices: plain, item, files })
		)
	}).length
}

/** Whether a slice holds one of the item's quotes: of its file, its logical lines joined by one space, both folded. */
function holdsQuote(params: {
	slices: StandardSlice[]
	item: StandardGoldItem
	files: Map<string, StandardFileIndex>
}): boolean {
	const { slices, item, files } = params
	return item.expected.some(function quoteHeld(expected): boolean {
		const file = files.get(expected.file)
		if (file === undefined) return false
		const quote = matchableTextOf(expected.quote)
		return slices.some(
			(slice) =>
				slice.file === file.fileId &&
				logicalLinesIn({ file, from: slice.from, to: slice.to })
					.map((line) => matchableTextOf(line.text))
					.join(QUOTE_LINE_SEPARATOR)
					.includes(quote),
		)
	})
}

/**
 * How `eval` finds a gold item's slices: `find` alone, or with `--angles` the ask ladder (D21) over the same indexes,
 * its setup loaded once; the answer that stops the verb when that setup cannot be read (exit 2).
 */
async function goldFindsOf(params: {
	params: StandardVerbParams
	opened: OpenedStandards
	searches: StandardSearchIndex[]
}): Promise<{ find: GoldFind } | { output: CommandOutput }> {
	const { searches } = params
	const verb = params.params
	if (!verb.read.flags.has('angles'))
		return {
			find: function findAlone({ item, limit }) {
				return findForGold({ searches, item, limit })
			},
		}
	// no fact is read or written and no ask is kept: the gold run leaves nothing behind
	const loaded = await loadAskSetup({
		cwd: verb.cwd,
		environment: verb.environment,
		packageName: verb.read.values.get('package'),
		facts: false,
	})
	if ('refused' in loaded) return { output: verbError({ verb: 'eval', message: loaded.refused }) }
	const setup: AskSetup = { ...loaded.setup, standard: params.opened.documents }
	// the recall and the `added` count read the same ladder run of an item: each item and limit runs once
	const runs = new Map<StandardGoldItem, Map<number, StandardSlice[]>>()
	return {
		find: function findThroughLadder({ item, limit }) {
			const ofItem = runs.get(item) ?? new Map<number, StandardSlice[]>()
			runs.set(item, ofItem)
			const known = ofItem.get(limit)
			if (known !== undefined) return known
			const slices = ladderSlicesOf({ setup, question: item.question, about: item.about, limit })
			ofItem.set(limit, slices)
			return slices
		},
	}
}

function findForGold(params: {
	searches: StandardSearchIndex[]
	item: StandardGoldItem
	limit: number
}): StandardSlice[] {
	return findInStandard({
		indexes: params.searches,
		query: params.item.question,
		about: params.item.about,
		limit: params.limit,
	})
}

/**
 * The selected standards with their indexes ready (built when missing), or the answer that stops the verb:
 * a refusal of the input or of the cache (exit 2), a `--package` not installed or an unknown `--about` tag
 * (exit 2), an aborted build (exit 1). The vocabulary of the installed dialectes (of the `--package` one
 * only, when given) is read once, before any build, by the verbs that score only.
 */
async function openStandards(options: OpenStandardsParams): Promise<OpenedStandardsAnswer> {
	const { verb, params } = options
	const { about } = options
	const loaded = await loadStandardIndexes({
		cwd: params.cwd,
		environment: params.environment,
		standardIds: options.standardId === undefined ? undefined : [options.standardId],
		packageName: params.read.values.get('package'),
		rebuild: options.rebuild ?? false,
		// only the verbs that score read the installed dialectes; show reads none (an empty vocabulary)
		readVocabulary: options.scores,
		checkVocabulary:
			about === undefined
				? undefined
				: function aboutOfVocabulary({ installed }) {
						return aboutRefusal({ about, tags: installed.vocabulary.tags, cwd: params.cwd })
					},
		progress: process.stderr.isTTY
			? createStepProgress({
					live: createStreamLiveOutput(process.stderr),
					clock: createSystemClock(),
				})
			: undefined,
		afterFileRead: params.afterFileRead,
	})
	if (loaded.kind === 'refused')
		return stopped(
			verbError({
				verb,
				message: loaded.message,
				...(loaded.layout === undefined ? {} : { more: [loaded.layout] }),
			}),
		)
	if (loaded.kind === 'unknownPackage')
		return stopped(
			verbError({
				verb,
				message: packageRefusal({
					name: loaded.name,
					installed: loaded.installed,
					cwd: params.cwd,
				}),
			}),
		)
	if (loaded.kind === 'aborted')
		return stopped(verbError({ verb, message: loaded.message, exitCode: 1 }))
	const opened: OpenedStandards = {
		indexes: loaded.ready,
		skipped: loaded.skipped,
		installed: loaded.installed,
		documents: loaded.standard,
	}
	return { kind: 'opened', opened }
}

/** Why `--about` cannot run: no dialecte installed, or a tag none declares (with the closest names). */
function aboutRefusal(params: { about: string; tags: string[]; cwd: string }): string | undefined {
	const { about, tags } = params
	if (tags.length === 0)
		return fillMessage({
			template: STANDARD_MESSAGES.aboutNeedsDialecte,
			values: { cwd: params.cwd },
		})
	if (tags.includes(about)) return undefined
	return fillMessage({
		template: STANDARD_MESSAGES.unknownTag,
		values: { tag: about, closest: closestOf({ name: about, candidates: tags }) },
	})
}

/** Why `--package` cannot run: no dialecte installed, or a name none has (the installed ones, the closest). */
function packageRefusal(params: { name: string; installed: string[]; cwd: string }): string {
	const { name, installed } = params
	if (installed.length === 0)
		return fillMessage({
			template: STANDARD_MESSAGES.packageNeedsDialecte,
			values: { cwd: params.cwd },
		})
	return fillMessage({
		template: STANDARD_MESSAGES.unknownPackage,
		values: {
			name,
			closest: closestOf({ name, candidates: installed }),
			installed: installed.join(NAME_LIST_SEPARATOR),
		},
	})
}

/** ` - closest: <names>` for a name nobody declares, or nothing when none is close. */
function closestOf(params: { name: string; candidates: string[] }): string {
	const closest = closestNames({
		name: params.name,
		candidates: params.candidates,
		limit: CLOSEST_NAME_LIMIT,
	})
	return closest.length
		? fillMessage({
				template: STANDARD_MESSAGES.closest,
				values: { names: closest.join(NAME_LIST_SEPARATOR) },
			})
		: ''
}

/** The gold items of a JSON-lines file (blank lines skipped), or why it cannot be read. */
function readGold(params: { path: string }): StandardGoldItem[] | string {
	let text: string
	try {
		text = readFileSync(params.path, 'utf8')
	} catch {
		return fillMessage({
			template: STANDARD_MESSAGES.goldUnreadable,
			values: { path: params.path },
		})
	}
	const items: StandardGoldItem[] = []
	for (const [index, line] of text.split('\n').entries()) {
		if (line.trim() === '') continue
		const reason = goldItemOf({ line })
		if (typeof reason === 'string')
			return fillMessage({
				template: STANDARD_MESSAGES.goldMalformed,
				values: { path: params.path, line: String(index + 1), reason },
			})
		items.push(reason)
	}
	return items
}

/** One gold line as an item, or what is wrong with it. */
function goldItemOf(params: { line: string }): StandardGoldItem | string {
	let parsed: unknown
	try {
		parsed = JSON.parse(params.line)
	} catch {
		return STANDARD_MESSAGES.goldNotJson
	}
	if (typeof parsed !== 'object' || parsed === null) return STANDARD_MESSAGES.goldNotJson
	const { question, about, expected } = parsed as Record<string, unknown>
	const expectedValid =
		Array.isArray(expected) &&
		expected.every(
			(entry: unknown) =>
				typeof entry === 'object' &&
				entry !== null &&
				typeof (entry as Record<string, unknown>).file === 'string' &&
				typeof (entry as Record<string, unknown>).quote === 'string',
		)
	if (typeof question !== 'string' || !expectedValid) return STANDARD_MESSAGES.goldShape
	if (about !== undefined && typeof about !== 'string') return STANDARD_MESSAGES.goldShape
	return {
		question,
		...(about === undefined ? {} : { about }),
		// a file id is lowercased, as every id is
		expected: expected.map((entry: StandardGoldExpected) => ({
			file: entry.file.toLowerCase(),
			quote: entry.quote,
		})),
	}
}

/** `index` as text: per standard its line, its files' lines, their repeated lines; the skipped folders. */
function indexLinesOf(opened: OpenedStandards): string[] {
	const lines: string[] = []
	for (const index of opened.indexes) {
		const files = index.search.files
		lines.push(
			[
				index.standardId,
				`${files.length} files`,
				`${index.state} in ${formatDuration(index.elapsed)}`,
				`manifest ${index.manifestHash.slice(0, SHORT_MANIFEST_LENGTH)}`,
			].join(COLUMN_SEPARATOR),
		)
		for (const file of files) lines.push(fileLineOf(file))
		for (const file of files) {
			const repeated = file.quality.repeatedLines.slice(0, REPEATED_LINES_SHOWN)
			if (repeated.length === 0) continue
			lines.push(`${file.fileId}  repeated lines (information, nothing dropped):`)
			for (const candidate of repeated)
				lines.push(
					`  ${[
						`${candidate.count}x`,
						`gap ${candidate.medianGap}`,
						`${candidate.length} chars`,
						candidate.text.slice(0, REPEATED_TEXT_CUT),
					].join(COLUMN_SEPARATOR)}`,
				)
		}
	}
	for (const standard of opened.skipped)
		lines.push(`${standard.id}${COLUMN_SEPARATOR}${STANDARD_MESSAGES.noIndexableFile}`)
	return lines
}

function fileLineOf(file: StandardFileIndex): string {
	const summary = fileSummaryOf(file)
	return [
		file.fileId,
		`${summary.lines} lines`,
		summary.verdict,
		`noise ${(summary.noiseRatio * 100).toFixed(NOISE_PERCENT_DECIMALS)}%`,
		`headings ${summary.headings.kept}/${summary.headings.candidates}`,
		`tables ${summary.tables}`,
		`definitions ${summary.definitions}`,
	].join(COLUMN_SEPARATOR)
}

/** What `index` says of one file. */
function fileSummaryOf(file: StandardFileIndex): StandardFileSummary {
	const { quality } = file
	const scale = 10 ** NOISE_RATIO_DECIMALS
	return {
		id: file.fileId,
		lines: file.lineCount,
		verdict: quality.verdict,
		noiseRatio:
			file.lineCount === 0
				? 0
				: Math.round((quality.droppedLines / file.lineCount) * scale) / scale,
		headings: {
			kept: quality.headingCandidatesKept,
			candidates: quality.headingCandidatesKept + quality.headingCandidatesTurnedProse,
		},
		tables: file.tables.length,
		definitions: file.definitions.length,
		repeatedLines: quality.repeatedLines,
	}
}

/** `index --json`: every selected standard in id order, a folder with no `.md` file as skipped. */
function indexJsonOf(opened: OpenedStandards): { standards: StandardIndexJsonEntry[] } {
	const standards: StandardIndexJsonEntry[] = [
		...opened.indexes.map((index) => ({
			id: index.standardId,
			manifest: `${MANIFEST_HASH_PREFIX}${index.manifestHash}`,
			state: index.state,
			skipped: false,
			files: index.search.files.map(fileSummaryOf),
		})),
		...opened.skipped.map((standard) => ({
			id: standard.id,
			manifest: null,
			state: SKIPPED_STATE,
			skipped: true,
			files: [],
		})),
	].sort((left, right) => (left.id < right.id ? -1 : 1))
	return { standards }
}

/** `find` as text: per slice its header, then the normalised text of its logical lines. */
function findLinesOf(params: { slices: StandardSlice[]; indexes: StandardReadyIndex[] }): string[] {
	const files = new Map(
		params.indexes.flatMap((index) => index.search.files.map((file) => [file.fileId, file])),
	)
	return params.slices.flatMap((slice, index) => {
		const header = [
			`${slice.file}:${slice.from}-${slice.to}`,
			[slice.clause, slice.title].filter((part) => part !== null).join(' '),
			`score ${slice.score}`,
			slice.linked ? '[linked]' : '',
		]
			.filter((part) => part !== '')
			.join(COLUMN_SEPARATOR)
		const file = files.get(slice.file)
		const text = (file ? logicalLinesIn({ file, from: slice.from, to: slice.to }) : []).map(
			(line) => `  ${line.text}`,
		)
		return [...(index === 0 ? [] : ['']), header, ...text]
	})
}

/** `eval` as text: the recall line, the `added +<n>` line with `--angles`, then one line per miss. */
function evalLinesOf(params: {
	evaluation: StandardEvaluation
	added: number | undefined
}): string[] {
	const { evaluation, added } = params
	const lines = [
		[
			`recall@5 ${evaluation.recallAt5.toFixed(RECALL_DECIMALS)}`,
			`recall@10 ${evaluation.recallAt10.toFixed(RECALL_DECIMALS)}`,
			`items ${evaluation.items}`,
			`not in text ${evaluation.notInText}`,
		].join(COLUMN_SEPARATOR),
		...(added === undefined ? [] : [`${ADDED_LINE_PREFIX}${added}`]),
		...evaluation.misses.map((miss) =>
			['miss', miss.file, miss.why, miss.question].join(COLUMN_SEPARATOR),
		),
	]
	return lines
}

/** The first line of a text answer: the dialectes whose definition is the vocabulary, or none. */
function vocabularyLineOf(installed: StandardInstalledVocabulary): string {
	return installed.packages.length === 0
		? VOCABULARY_LINE.none
		: `${VOCABULARY_LINE.prefix}${installed.packages.join(VOCABULARY_LINE.separator)}`
}

/** What `--json` carries of the vocabulary: the `name@version` of each dialecte it is made of. */
function vocabularyJsonOf(installed: StandardInstalledVocabulary): { packages: string[] } {
	return { packages: installed.packages }
}

/** `<from>` for a one-line entry, else `<from>-<to>`. */
function rangeOf(line: { from: number; to: number }): string {
	return line.from === line.to ? String(line.from) : `${line.from}-${line.to}`
}

function unexpectedWords(params: { verb: StandardVerb; words: string[] }): CommandOutput {
	return verbError({
		verb: params.verb,
		message: fillMessage({
			template: STANDARD_MESSAGES.unexpectedWords,
			values: { words: params.words.join(' ') },
		}),
	})
}

/** A verb's error: `standard <verb>: <message>`, exit 2 unless told. */
function verbError(params: {
	verb: StandardVerb
	message: string
	/** The lines under the message (the expected layout of the root). */
	more?: readonly string[]
	exitCode?: CommandOutput['exitCode']
}): CommandOutput {
	return {
		output: textOf([
			`${STANDARD_COMMAND} ${params.verb}: ${params.message}`,
			...(params.more ?? []),
			'',
		]),
		exitCode: params.exitCode ?? 2,
	}
}

function stopped(output: CommandOutput): OpenedStandardsAnswer {
	return { kind: 'output', output }
}

/** `content` as the JSON a verb answers: tab-indented, its last line ended. */
function jsonAnswerOf(content: unknown): PrintedText {
	return endedOf(jsonOf(content, '\t'))
}
