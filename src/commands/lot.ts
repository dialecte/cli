/**
 * `dialecte lot exempt <reason>` / `lot accept <case> <reason>` / `lot revised <case|file|glob> <reason>` /
 * `lot gone <file|glob> <reason>` / `lot mutation <off|changed|audit|gate>`: writes the lot declaration `.dialecte/lot.json` of the package in the
 * current folder, formatted, keeping what it already holds. An acceptance names one case; a revision a
 * case, a file or a glob; a gone entry a file or a glob, never a case.
 * The review rounds' verbs, in the lot's hand-over folder (the table of the renamed forms lists them): the
 * ones that write there run by `runRecordVerb`, `lot delta` by `runDelta`, `lot recap` by `runRecap`;
 * `lot close <hand-over name|index>...` by `runLotClose`; `lot start <brief.json>` by `startLot`, `lot status <id>`
 * by `lotStatus`, `lot answer <id> <question> "<answer>"` by `lotAnswer`, `lot result <id>` by `lotResult`, `lot stop <id> --reason
 * <text>` by `lotStop`; `lot wait <id>` by `waitLot`, the one
 * asynchronous verb (`run` awaits it; `runLot` stays synchronous for the others). A review rounds' verb takes `<id|folder>`: an id resolves to its lot folder first.
 * The usage is the map's lot section.
 */
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { renderLotUsage } from '../lib/command-map/render-help.ts'
import { resultOf } from '../lib/command-result.ts'
import { MUTATION_MODES } from '../lib/mutation/mutation.constants.ts'
import { packageRootOf } from '../lib/package-root.ts'
import { linesOf, printOut, textOf } from '../lib/print/print.ts'
import { formOfLotVerb } from '../lib/review-rounds/review-round-verbs.ts'
import { REVIEW_ROUND_VALUE_OPTIONS } from '../lib/review-rounds/review-rounds.constants.ts'
import { resolveLot } from '../lib/store/resolve-lot.ts'
import { namesOneCase } from '../lib/tdd/lot-declaration.ts'
import { LOT_VERBS } from '../lib/tdd/tdd.constants.ts'
import { LOT_FILE } from '../lib/worktree/worktree.constants.ts'
import { lotAnswer } from './lot-answer.ts'
import { runLotClose } from './lot-close.ts'
import { lotExport } from './lot-export.ts'
import { lotReport } from './lot-report.ts'
import { lotResult } from './lot-result.ts'
import { startLot } from './lot-start.ts'
import { lotStation } from './lot-station.ts'
import { lotStatus } from './lot-status.ts'
import { lotStop } from './lot-stop.ts'
import { printsOnStandardError } from './lot-streams.ts'
import { runLotVerify } from './lot-verify.ts'
import { waitLot } from './lot-wait.ts'
import { runRecap } from './recap.ts'
import { runRecordVerb } from './record.ts'
import { runDelta } from './review.ts'

import type { DeclaredRenamedForm } from '../lib/command-map/command-map.types.ts'
import type { CommandResult } from '../lib/command-result.types.ts'
import type { HandoverProbe } from '../lib/handover/handover.types.ts'
import type { ResolveMode } from '../lib/store/store.types.ts'
import type { LotCaseEntry, LotCaseList, LotGoneEntry } from '../lib/tdd/tdd.types.ts'

export async function run(argv: string[]): Promise<void> {
	const [verb, ...words] = argv
	// `wait` sleeps between its reads: the one verb that runs asynchronously
	const result =
		verb === 'wait'
			? await waitLot({ cwd: process.cwd(), argv: words, isTerminal: process.stderr.isTTY })
			: runLot({ cwd: process.cwd(), argv, cliPath: realpathSync(process.argv[1]) })
	printOut({
		stream: printsOnStandardError({ verb, exitCode: result.exitCode }) ? 'stderr' : 'stdout',
		text: result.output,
	})
	if (result.exitCode !== 0) process.exit(result.exitCode)
}

export function runLot(params: {
	cwd: string
	argv: string[]
	now?: Date
	/** The repository-cli probe of `lot result`'s card; the real one when left out. */
	probe?: HandoverProbe
	/** The cli named in `lot result`'s card when the repository's own cannot run hand-overs. */
	cliPath?: string
}): CommandResult {
	const [verb, ...words] = params.argv
	if (verb === 'close') return runLotClose({ cwd: params.cwd, argv: words, now: params.now })
	if (verb === 'start') return startLot({ cwd: params.cwd, argv: words, now: params.now })
	if (verb === 'status') return lotStatus({ cwd: params.cwd, argv: words })
	if (verb === 'answer') return lotAnswer({ cwd: params.cwd, argv: words, now: params.now })
	if (verb === 'stop') return lotStop({ cwd: params.cwd, argv: words, now: params.now })
	if (verb === 'station') return lotStation({ cwd: params.cwd, argv: words, now: params.now })
	if (verb === 'report') return lotReport({ cwd: params.cwd, argv: words, now: params.now })
	if (verb === 'export') return lotExport({ cwd: params.cwd, argv: words })
	if (verb === 'result')
		return lotResult({
			cwd: params.cwd,
			argv: words,
			probe: params.probe,
			cliPath: params.cliPath,
		})
	if (verb === 'verify') {
		const resolved = resolveFolderWord({ cwd: params.cwd, words, mode: 'write' })
		if ('exitCode' in resolved) return resolved
		const result = runLotVerify({ cwd: params.cwd, argv: resolved.words, now: params.now })
		if (resolved.note === undefined) return result
		return { ...result, output: textOf([resolved.note, ...linesOf(result.output)]) }
	}
	const reviewRound = runReviewRoundVerb({ cwd: params.cwd, verb, words, now: params.now })
	if (reviewRound) return reviewRound
	const mutationRefusal = verb === 'mutation' ? refuseMutationWords(words) : undefined
	if (mutationRefusal) return resultOf({ exitCode: 2, lines: [`lot: ${mutationRefusal}`] })
	const list: LotCaseList | undefined = verb === 'accept' || verb === 'revised' ? verb : undefined
	const gone = verb === 'gone'
	if (!LOT_VERBS.includes(verb ?? '') || words.length !== (list || gone ? 2 : 1))
		return { exitCode: 2, output: renderLotUsage() }
	if (list === 'accept' && !namesOneCase(words[0]))
		return resultOf({
			exitCode: 2,
			lines: [
				`lot: a case is <file>::<name> (the file, then the full name vitest prints), not ${JSON.stringify(words[0])}`,
			],
		})
	if ((list || gone) && words[0].trim() === '')
		return resultOf({ exitCode: 2, lines: [`lot: ${verb} needs a case, a file or a glob first`] })
	if (gone && namesOneCase(words[0]))
		return resultOf({
			exitCode: 2,
			lines: [
				`lot: gone names a test file or a glob over test files, not a case: ${JSON.stringify(words[0])}`,
			],
		})
	const root = packageRootOf(params.cwd)
	if (!root)
		return resultOf({ exitCode: 1, lines: [`lot: no package.json at or above ${params.cwd}`] })
	const path = join(root, LOT_FILE)
	let read: unknown = {}
	if (existsSync(path))
		try {
			read = JSON.parse(readFileSync(path, 'utf8'))
		} catch (error) {
			return resultOf({
				exitCode: 1,
				lines: [`lot: ${path} is not JSON (${(error as Error).message}); fix or remove it first`],
			})
		}
	if (typeof read !== 'object' || read === null || Array.isArray(read))
		return resultOf({
			exitCode: 1,
			lines: [`lot: ${path} holds no object (${JSON.stringify(read)}); fix or remove it first`],
		})
	const declaration = read as Record<string, unknown>
	if (list) {
		const [testCase, reason] = words
		const entries = Array.isArray(declaration[list]) ? (declaration[list] as LotCaseEntry[]) : []
		const known = entries.some((entry) => entry.case === testCase)
		declaration[list] = known
			? entries.map((entry) => (entry.case === testCase ? { case: testCase, reason } : entry))
			: [...entries, { case: testCase, reason }]
	} else if (gone) {
		const [file, reason] = words
		const entries = Array.isArray(declaration.gone) ? (declaration.gone as LotGoneEntry[]) : []
		const known = entries.some((entry) => entry.file === file)
		declaration.gone = known
			? entries.map((entry) => (entry.file === file ? { file, reason } : entry))
			: [...entries, { file, reason }]
	} else if (verb === 'mutation') declaration.mutation = words[0]
	else declaration.tdd = `exempt: ${words[0]}`
	mkdirSync(dirname(path), { recursive: true })
	writeFileSync(path, `${JSON.stringify(declaration, null, '\t')}\n`)
	return resultOf({ exitCode: 0, lines: [`lot: ${path} written`] })
}

/** Why `lot mutation <mode>` refuses its words: no mode, a mode it does not know, or a reason after it. */
function refuseMutationWords(words: readonly string[]): string | undefined {
	const modes = MUTATION_MODES.join(' | ')
	if (words.length === 0) return `mutation needs a mode: mutation <${modes}>`
	if (!MUTATION_MODES.some((mode) => mode === words[0]))
		return `mutation takes one of ${MUTATION_MODES.join(', ')}, not ${JSON.stringify(words[0])}`
	if (words.length > 1)
		return `mutation takes no reason: lot mutation <${modes}>, nothing after the mode`
	return undefined
}

/** A review rounds' verb run by today's implementation, or undefined for any other verb. */
function runReviewRoundVerb(params: {
	cwd: string
	verb: string | undefined
	words: string[]
	now?: Date
}): CommandResult | undefined {
	const { cwd } = params
	const form = formOfLotVerb(params.verb)
	if (!form) return undefined
	const resolved = resolveFolderWord({
		cwd,
		words: params.words,
		mode: form.command === 'record' ? 'write' : 'read',
	})
	if ('exitCode' in resolved) return resolved
	const result = runResolvedVerb({ form, cwd, words: resolved.words, now: params.now })
	if (resolved.note === undefined) return result
	return { ...result, output: textOf([resolved.note, ...linesOf(result.output)]) }
}

/** A review rounds' verb run on its words, the folder word already resolved. */
function runResolvedVerb(params: {
	form: DeclaredRenamedForm
	cwd: string
	words: string[]
	now?: Date
}): CommandResult {
	const { form, cwd, words } = params
	if (form.command === 'record')
		return runRecordVerb({ verb: form.lotVerb, cwd, argv: words, now: params.now })
	if (form.command === 'review')
		return runDelta({ cwd, argv: words, now: params.now ?? new Date() })
	return runRecap({ cwd, argv: words })
}

/**
 * The words with the folder word (the first positional one) replaced by the folder its `<id|folder>` names: the lot
 * folder of an id, else the folder as given; with the note of a folder that won over a lot of the same id, or the
 * refusal of an ambiguous index. Words without a folder word are left to the verb's own usage.
 */
function resolveFolderWord(params: {
	cwd: string
	words: string[]
	mode: ResolveMode
}): { words: string[]; note?: string } | CommandResult {
	const { words } = params
	const position = firstPositionalIndex(words)
	if (position === undefined) return { words }
	const resolved = resolveLot({ argument: words[position], cwd: params.cwd, mode: params.mode })
	if ('exitCode' in resolved) return { exitCode: resolved.exitCode, output: resolved.output }
	const folder = 'lot' in resolved ? resolved.lot : resolved.folder
	const replaced = words.map((word, index) => (index === position ? folder : word))
	return 'note' in resolved && resolved.note !== undefined
		? { words: replaced, note: resolved.note }
		: { words: replaced }
}

/** Where the first word that is no option nor an option's value stands, as the review rounds' verbs read them. */
function firstPositionalIndex(words: readonly string[]): number | undefined {
	for (let index = 0; index < words.length; index++) {
		const word = words[index]
		if (word === '--') return index + 1 < words.length ? index + 1 : undefined
		if (!word.startsWith('--')) return index
		if (REVIEW_ROUND_VALUE_OPTIONS.includes(word.slice(2))) index++
	}
	return undefined
}
