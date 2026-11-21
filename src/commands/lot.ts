/**
 * `dialecte lot exempt <reason>` / `lot accept <case> <reason>` / `lot revised <case|file|glob> <reason>` /
 * `lot gone <file|glob> <reason>` / `lot moved <from> <to> <reason>` / `lot mutation <off|changed|audit|gate>`: writes the lot declaration `.dialecte/lot.json` of the package in the
 * current folder, formatted, keeping what it already holds. An acceptance names one case; a revision a
 * case, a file or a glob; a gone entry a file or a glob, never a case; a moved entry two cases, or a file and the file
 * or glob its cases moved to (`tdd red` carries their red). `lot accept|revised|gone|moved --remove <entry>`
 * drops the entry written exactly so (a list left empty leaves the file): a receipt only ever exempts, so its removal
 * makes tdd and the gate stricter and needs no proof.
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
import { createInterface } from 'node:readline/promises'

import { floorRefusalOf, runningCliOf } from '../lib/cli-floor/cli-floor.ts'
import { closestNames } from '../lib/closest-names.ts'
import { renderLotUsage } from '../lib/command-map/render-help.ts'
import { resultOf } from '../lib/command-result.ts'
import { isFolder } from '../lib/file-system.ts'
import { createHost } from '../lib/host/select-host.ts'
import { fillMessage } from '../lib/knowledge/standard/fill-message.ts'
import { statusLandingOf } from '../lib/landing/lot-landing.ts'
import { MUTATION_MODES } from '../lib/mutation/mutation.constants.ts'
import { packageRootOf } from '../lib/package-root.ts'
import { linesOf, printOut, textOf } from '../lib/print/print.ts'
import { formOfLotVerb } from '../lib/review-rounds/review-round-verbs.ts'
import { REVIEW_ROUND_VALUE_OPTIONS } from '../lib/review-rounds/review-rounds.constants.ts'
import { effortOfClass, isEffort } from '../lib/risk/risk-records.ts'
import { BRIEF_EFFORTS } from '../lib/store/brief.constants.ts'
import { lotRefusalExit, lotUsageExit } from '../lib/store/lot-exits.ts'
import { requireLot, resolveLot } from '../lib/store/resolve-lot.ts'
import { namesOneCase } from '../lib/tdd/lot-declaration.ts'
import { GLOB_MAGIC_PATTERN, LOT_VERBS } from '../lib/tdd/tdd.constants.ts'
import { LOT_FILE } from '../lib/worktree/worktree.constants.ts'
import { lotAnswer } from './lot-answer.ts'
import { runLotApprove } from './lot-approve.ts'
import { runLotBrief } from './lot-brief.ts'
import { runLotClose } from './lot-close.ts'
import { runLotDesign } from './lot-design.ts'
import { lotExport } from './lot-export.ts'
import { lotForecast } from './lot-forecast.ts'
import { runLotKeepDecision } from './lot-keep-decision.ts'
import { runLotLand } from './lot-land.ts'
import { runLotPr } from './lot-pr.ts'
import { runLotPrune } from './lot-prune.ts'
import { lotReport } from './lot-report.ts'
import { lotResult } from './lot-result.ts'
import { runLotReview } from './lot-review.ts'
import { LOT_RISK_EFFORT_OPTION, LOT_RISK_VALUE_OPTIONS } from './lot-risk.constants.ts'
import { runLotRisk } from './lot-risk.ts'
import { runLotScope } from './lot-scope.ts'
import {
	START_EFFORT_ATTEMPTS,
	START_EFFORT_PROMPT,
	START_NO_ANSWER,
	START_USAGE_REASONS,
} from './lot-start.constants.ts'
import { askedClassOf, finishStart, prepareStart, startLot } from './lot-start.ts'
import { lotStation } from './lot-station.ts'
import { lotStatus } from './lot-status.ts'
import { lotStop } from './lot-stop.ts'
import { printsOnStandardError } from './lot-streams.ts'
import { runLotVerify } from './lot-verify.ts'
import { waitLot } from './lot-wait.ts'
import {
	LOT_MOVED_GLOB_FROM,
	LOT_MOVED_MIXED,
	LOT_REMOVE_CLOSEST_LIMIT,
	LOT_REMOVE_KEYS,
	LOT_REMOVE_LINES,
	LOT_REMOVE_OPTION,
} from './lot.constants.ts'
import { asksJson } from './mutants-output.ts'
import { runRecap } from './recap.ts'
import { runRecordVerb } from './record.ts'
import { runDelta } from './review.ts'

import type { DeclaredRenamedForm } from '../lib/command-map/command-map.types.ts'
import type { CommandResult } from '../lib/command-result.types.ts'
import type { HandoverProbe } from '../lib/handover/handover.types.ts'
import type { HostAdapter } from '../lib/host/host.types.ts'
import type { RiskClass } from '../lib/risk/risk.types.ts'
import type { BriefEffort } from '../lib/store/brief.types.ts'
import type { ResolveMode } from '../lib/store/store.types.ts'
import type {
	LotCaseEntry,
	LotCaseList,
	LotGoneEntry,
	LotMovedEntry,
} from '../lib/tdd/tdd.types.ts'
import type { AskFunction, RemovableList, RunLotCommandParams } from './lot.types.ts'

export async function run(argv: string[]): Promise<void> {
	const [verb, ...words] = argv
	const cliPath = realpathSync(process.argv[1])
	// a cli older than a repository the invocation reaches asks for runs no verb (wait included)
	const floorLines = floorRefusalOf({
		cwd: process.cwd(),
		argv,
		running: runningCliOf({ invokedPath: process.argv[1], realPath: cliPath }),
	})
	// `wait` sleeps between its reads and tells its progress on standard error when that is a terminal
	const result =
		floorLines !== undefined
			? lotRefusalExit({ lines: floorLines, json: asksJson(argv) })
			: verb === 'wait'
				? await waitLot({ cwd: process.cwd(), argv: words, isTerminal: process.stderr.isTTY })
				: await runLotCommand({
						argv,
						cwd: process.cwd(),
						isTerminal: process.stdin.isTTY === true && process.stdout.isTTY === true,
						ask: askOnTerminal,
						cliPath,
					})
	printOut({
		stream: printsOnStandardError({ verb, exitCode: result.exitCode }) ? 'stderr' : 'stdout',
		text: result.output,
	})
	if (result.exitCode !== 0) process.exit(result.exitCode)
}

/**
 * The entry of `dialecte lot` with its questions: `lot start` on a terminal asks the effort (D13) when neither
 * `--effort`, `--json`, `--dry-run` nor the brief names one, and passes the answer on; every other verb is `runLot`
 * (`wait` is awaited by `run`, its terminal being standard error).
 */
export async function runLotCommand(params: RunLotCommandParams): Promise<CommandResult> {
	const [verb, ...words] = params.argv
	if (verb !== 'start' || !params.isTerminal)
		return runLot({
			cwd: params.cwd,
			argv: params.argv,
			now: params.now,
			cliPath: params.cliPath,
		})
	const prepared = prepareStart({ cwd: params.cwd, argv: words, now: params.now })
	if ('exit' in prepared) return prepared.exit
	const riskClass = askedClassOf(prepared.prepared)
	if (riskClass === undefined) return finishStart({ prepared: prepared.prepared })
	let asked: BriefEffort | undefined
	try {
		asked = await askEffort({ riskClass, ask: params.ask })
	} catch {
		// the input closed before an answer (D22): nothing written
		return lotRefusalExit({ lines: [START_NO_ANSWER], json: false })
	}
	if (asked === undefined)
		return lotUsageExit({
			reason: fillMessage({
				template: START_USAGE_REASONS.asked,
				values: { efforts: BRIEF_EFFORTS.join(', '), attempts: String(START_EFFORT_ATTEMPTS) },
			}),
			json: false,
		})
	return finishStart({ prepared: prepared.prepared, asked })
}

/**
 * The effort a terminal answers for `riskClass`: an empty answer takes the class's effort, a word out of the efforts
 * asks again; undefined after `START_EFFORT_ATTEMPTS` such words. Throws what `ask` throws (its input closed).
 */
async function askEffort(params: {
	riskClass: RiskClass
	ask: AskFunction
}): Promise<BriefEffort | undefined> {
	const fallback = effortOfClass({ riskClass: params.riskClass })
	const prompt = fillMessage({
		template: START_EFFORT_PROMPT,
		values: { class: params.riskClass, effort: fallback },
	})
	for (let attempt = 0; attempt < START_EFFORT_ATTEMPTS; attempt++) {
		const answer = await params.ask({ prompt })
		const word = answer.trim()
		if (word === '') return fallback
		if (isEffort(word)) return word
	}
	return undefined
}

/** One question on the process's terminal: the prompt on standard output, the line read from standard input. */
async function askOnTerminal(params: { prompt: string }): Promise<string> {
	const terminal = createInterface({ input: process.stdin, output: process.stdout })
	try {
		return await terminal.question(params.prompt)
	} finally {
		terminal.close()
	}
}

export function runLot(params: {
	cwd: string
	argv: string[]
	now?: Date
	/** The repository-cli probe of `lot result`'s card; the real one when left out. */
	probe?: HandoverProbe
	/** The cli named in `lot result`'s card when the repository's own cannot run hand-overs. */
	cliPath?: string
	/** Where lots land, asked by `lot status` (the stack parent's pull request) and `lot close`; default: the repository's host. */
	host?: HostAdapter
	/** The shared temporary folders `lot design` refuses a design in; default `/tmp` and `/private/tmp`. */
	sharedTemporaryRoots?: readonly string[]
}): CommandResult {
	const [verb, ...words] = params.argv
	if (verb === 'close')
		return runLotClose({ cwd: params.cwd, argv: words, now: params.now, host: params.host })
	if (verb === 'land') return runLotLand({ cwd: params.cwd, argv: words, host: params.host })
	if (verb === 'prune')
		return runLotPrune({ cwd: params.cwd, argv: words, now: params.now, host: params.host })
	if (verb === 'pr') return runLotPr({ cwd: params.cwd, argv: words })
	if (verb === 'review') return runLotReview({ cwd: params.cwd, argv: words, now: params.now })
	if (verb === 'approve') return runLotApprove({ cwd: params.cwd, argv: words, now: params.now })
	if (verb === 'design')
		return runLotDesign({
			cwd: params.cwd,
			argv: words,
			now: params.now,
			sharedTemporaryRoots: params.sharedTemporaryRoots,
		})
	if (verb === 'brief') return runLotBrief({ cwd: params.cwd, argv: words, now: params.now })
	if (verb === 'start') return startLot({ cwd: params.cwd, argv: words, now: params.now })
	if (verb === 'status')
		return lotStatus({
			cwd: params.cwd,
			argv: words,
			landing: statusLandingOf(params.host ?? createHost()),
		})
	if (verb === 'answer') return lotAnswer({ cwd: params.cwd, argv: words, now: params.now })
	if (verb === 'stop') return lotStop({ cwd: params.cwd, argv: words, now: params.now })
	if (verb === 'station') return lotStation({ cwd: params.cwd, argv: words, now: params.now })
	if (verb === 'report') return lotReport({ cwd: params.cwd, argv: words, now: params.now })
	if (verb === 'export') return lotExport({ cwd: params.cwd, argv: words })
	if (verb === 'forecast') return lotForecast({ cwd: params.cwd, argv: words, now: params.now })
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
	if (verb === 'risk') return runRiskVerb({ cwd: params.cwd, words, now: params.now })
	if (verb === 'scope') return runLotScope({ cwd: params.cwd, argv: words, now: params.now })
	if (verb === 'keep' || verb === 'unkeep')
		return runLotKeepDecision({ cwd: params.cwd, argv: [verb, ...words], now: params.now })
	const reviewRound = runReviewRoundVerb({ cwd: params.cwd, verb, words, now: params.now })
	if (reviewRound) return reviewRound
	const mutationRefusal = verb === 'mutation' ? refuseMutationWords(words) : undefined
	if (mutationRefusal) return resultOf({ exitCode: 2, lines: [`lot: ${mutationRefusal}`] })
	return runDeclarationVerb({ cwd: params.cwd, verb, words })
}

/**
 * The verbs of the lot declaration (`LOT_VERBS`): the words checked, then the entry written or (`--remove`) dropped;
 * usage for a verb it does not know or the wrong number of words.
 */
function runDeclarationVerb(params: {
	cwd: string
	verb: string | undefined
	words: string[]
}): CommandResult {
	const { verb, words } = params
	const list: LotCaseList | undefined = verb === 'accept' || verb === 'revised' ? verb : undefined
	const gone = verb === 'gone'
	const moved = verb === 'moved'
	if ((list || gone || moved) && words[0] === LOT_REMOVE_OPTION) {
		const removable: RemovableList = list ?? (gone ? 'gone' : 'moved')
		const named = words.slice(1)
		if (
			named.length !== LOT_REMOVE_KEYS[removable].length ||
			named.some((word) => word.trim() === '')
		)
			return { exitCode: 2, output: renderLotUsage() }
		return removeEntry({ cwd: params.cwd, list: removable, words: named })
	}
	if (!LOT_VERBS.includes(verb ?? '') || words.length !== (moved ? 3 : list || gone ? 2 : 1))
		return { exitCode: 2, output: renderLotUsage() }
	if (
		moved &&
		(namesOneCase(words[0]) !== namesOneCase(words[1]) || words.some((word) => word.trim() === ''))
	)
		return resultOf({
			exitCode: 2,
			lines: [
				LOT_MOVED_MIXED.replace('{from}', () => JSON.stringify(words[0])).replace('{to}', () =>
					JSON.stringify(words[1]),
				),
			],
		})
	if (moved && !namesOneCase(words[0]) && GLOB_MAGIC_PATTERN.test(words[0]))
		return resultOf({
			exitCode: 2,
			lines: [LOT_MOVED_GLOB_FROM.replace('{from}', () => JSON.stringify(words[0]))],
		})
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
	return writeDeclared({ cwd: params.cwd, verb: verb ?? '', words })
}

/**
 * `lot accept|revised <case> <reason>`, `lot gone <file> <reason>`, `lot moved <from> <to> <reason>`, `lot mutation <mode>`,
 * `lot exempt <reason>`, the words already checked: the entry written (an entry of the same case, file or `to` replaced
 * in place), or the key set.
 */
function writeDeclared(params: { cwd: string; verb: string; words: string[] }): CommandResult {
	const { verb, words } = params
	const list: LotCaseList | undefined = verb === 'accept' || verb === 'revised' ? verb : undefined
	const gone = verb === 'gone'
	const read = readDeclarationToWrite({ cwd: params.cwd })
	if ('exitCode' in read) return read
	const { path, declaration } = read
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
	} else if (verb === 'moved') {
		const [from, to, reason] = words
		const entries = Array.isArray(declaration.moved) ? (declaration.moved as LotMovedEntry[]) : []
		const known = entries.some((entry) => entry.from === from && entry.to === to)
		declaration.moved = known
			? entries.map((entry) =>
					entry.from === from && entry.to === to ? { from, to, reason } : entry,
				)
			: [...entries, { from, to, reason }]
	} else if (verb === 'mutation') declaration.mutation = words[0]
	else declaration.tdd = `exempt: ${words[0]}`
	writeDeclaration({ path, declaration })
	return resultOf({ exitCode: 0, lines: [`lot: ${path} written`] })
}

/**
 * The lot declaration of the package at or above `cwd` as a verb rewrites it: its path and what it holds (empty when
 * absent), or the refusal of a missing package, a file that is not JSON or holds no object.
 */
function readDeclarationToWrite(params: {
	cwd: string
}): { path: string; declaration: Record<string, unknown> } | CommandResult {
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
	return { path, declaration: read as Record<string, unknown> }
}

/** The declaration written at `path`: tab-indented JSON, a final newline. */
function writeDeclaration(params: { path: string; declaration: Record<string, unknown> }): void {
	mkdirSync(dirname(params.path), { recursive: true })
	writeFileSync(params.path, `${JSON.stringify(params.declaration, null, '\t')}\n`)
}

/**
 * `lot <list> --remove <entry>`: every entry of `list` written exactly as `words` (an `accept` or `revised` entry by
 * its case, a `gone` one by its file, a `moved` one by its from and to) dropped, the list left out once empty; refused
 * naming the list's closest entries when it holds no such entry, nothing written.
 */
function removeEntry(params: { cwd: string; list: RemovableList; words: string[] }): CommandResult {
	const { list } = params
	// shown joined by a space; compared word by word, so a space inside a path never spells another entry
	const entry = params.words.join(' ')
	const read = readDeclarationToWrite({ cwd: params.cwd })
	if ('exitCode' in read) return read
	const { path, declaration } = read
	const entries: unknown[] = Array.isArray(declaration[list]) ? declaration[list] : []
	const names = entries.map((item) => namesOfEntry({ item, list }))
	/** The entry at `position` is written exactly as the words. */
	function isNamed(position: number): boolean {
		const named = names[position]
		return named !== undefined && named.every((word, index) => word === params.words[index])
	}
	const index = names.findIndex((_, position) => isNamed(position))
	if (index === -1) {
		const closest = closestNames({
			name: entry,
			candidates: names.flatMap((named) => (named === undefined ? [] : [named.join(' ')])),
			limit: LOT_REMOVE_CLOSEST_LIMIT,
		})
		return resultOf({
			exitCode: 1,
			lines: [
				LOT_REMOVE_LINES.absent
					.replace('{list}', list)
					.replace('{entry}', () => JSON.stringify(entry))
					.replace('{closest}', () =>
						closest.length === 0
							? ''
							: LOT_REMOVE_LINES.closest.replace('{entries}', () =>
									closest.map((name) => JSON.stringify(name)).join(', '),
								),
					),
			],
		})
	}
	const removed = entries[index] as { reason?: unknown }
	const reason =
		typeof removed.reason === 'string'
			? LOT_REMOVE_LINES.reason.replace('{reason}', () => String(removed.reason))
			: ''
	// a copy written twice by hand goes too: none of it keeps exempting
	const kept = entries.filter((_, position) => !isNamed(position))
	if (kept.length === 0) delete declaration[list]
	else declaration[list] = kept
	writeDeclaration({ path, declaration })
	return resultOf({
		exitCode: 0,
		lines: [
			LOT_REMOVE_LINES.removed
				.replace('{path}', () => path)
				.replace('{list}', list)
				.replace('{entry}', () => entry)
				.replace('{reason}', () => reason),
		],
	})
}

/**
 * What an entry of `list` names (`LOT_REMOVE_KEYS`, in order): its case, its file, or a move's from and to; undefined
 * for a malformed one.
 */
function namesOfEntry(params: { item: unknown; list: RemovableList }): string[] | undefined {
	const { item } = params
	if (typeof item !== 'object' || item === null) return undefined
	const values = LOT_REMOVE_KEYS[params.list].map((key) => (item as Record<string, unknown>)[key])
	return values.every((value): value is string => typeof value === 'string') ? values : undefined
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

/**
 * `lot risk <id|folder> ...`: the folder word resolved (mode `write` for `--effort`, `read` otherwise), an id that names
 * no lot nor folder refused as `no lot <id>`, then `runLotRisk` on the words.
 */
function runRiskVerb(params: { cwd: string; words: string[]; now?: Date }): CommandResult {
	const { cwd, words } = params
	const mode: ResolveMode = words.includes(LOT_RISK_EFFORT_OPTION) ? 'write' : 'read'
	const valueOptions = LOT_RISK_VALUE_OPTIONS
	const resolved = resolveFolderWord({ cwd, words, mode, valueOptions })
	if ('exitCode' in resolved) return resolved
	const position = firstPositionalIndex({ words, valueOptions })
	let resolvedWords = resolved.words
	if (position !== undefined && !isFolder(resolvedWords[position])) {
		const required = requireLot({ argument: words[position], cwd, mode })
		if ('exitCode' in required) return required
		resolvedWords = resolvedWords.map((word, index) => (index === position ? required.lot : word))
	}
	const result = runLotRisk({ cwd, argv: resolvedWords, now: params.now })
	if (resolved.note === undefined) return result
	return { ...result, output: textOf([resolved.note, ...linesOf(result.output)]) }
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
	/** The options of the verb followed by a value, without the dashes; the review rounds' ones when left out. */
	valueOptions?: readonly string[]
}): { words: string[]; note?: string } | CommandResult {
	const { words } = params
	const position = firstPositionalIndex({ words, valueOptions: params.valueOptions })
	if (position === undefined) return { words }
	const resolved = resolveLot({ argument: words[position], cwd: params.cwd, mode: params.mode })
	if ('exitCode' in resolved) return { exitCode: resolved.exitCode, output: resolved.output }
	const folder = 'lot' in resolved ? resolved.lot : resolved.folder
	const replaced = words.map((word, index) => (index === position ? folder : word))
	return 'note' in resolved && resolved.note !== undefined
		? { words: replaced, note: resolved.note }
		: { words: replaced }
}

/**
 * Where the first word that is no option nor an option's value stands, as the review rounds' verbs read them (or the
 * verb whose `valueOptions` are given).
 */
function firstPositionalIndex(params: {
	words: readonly string[]
	valueOptions?: readonly string[]
}): number | undefined {
	const { words } = params
	const valueOptions = params.valueOptions ?? REVIEW_ROUND_VALUE_OPTIONS
	for (let index = 0; index < words.length; index++) {
		const word = words[index]
		if (word === '--') return index + 1 < words.length ? index + 1 : undefined
		if (!word.startsWith('--')) return index
		if (valueOptions.includes(word.slice(2))) index++
	}
	return undefined
}
