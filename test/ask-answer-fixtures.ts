/**
 * Shared by the `ask answer`, answer hook, note and round claim tests: asks in the states a person answers (made on
 * documents or outside, kept in the state folder or with a store lot), the person's answer run on them, and the
 * claim files a dead process leaves.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, utimesSync } from 'node:fs'
import { join } from 'node:path'

import { runAsk } from '../src/commands/ask.ts'
import {
	ANSWER_FILE,
	ANSWER_TEXT,
	CITED_FILE,
	CLAUSE_LINES,
	CLAUSE_SENTENCES,
	PERSON,
} from './ask-answer-fixtures.constants.ts'
import {
	FIRST_ASK,
	RUNG_ONE_QUESTION,
	SEMANTIC_QUESTION,
} from './ask-command-workspace.constants.ts'
import {
	askedJson,
	askedWith,
	createDocumentsWorkspace,
	createLotAskWorkspace,
	readJsonFile,
} from './ask-command-workspace.ts'
import { PACK_FILE, READER_FILES, ROUND_ONE, ROUNDS_FOLDER } from './ask-pack-fixtures.constants.ts'
import { asksFolderOf, packedWith, readRoundFile, writeRoundOne } from './ask-pack-fixtures.ts'
import { VERDICT_STANDARDS } from './ask-verdict-fixtures.constants.ts'
import { factFolderText, readFactFile } from './fact-fixtures.ts'
import { transitionFilesOf } from './lot-questions.ts'
import { DECLARED_NAME } from './standard-selection.constants.ts'
import { writeTextFile } from './standard-workspace.ts'

import { expect, vi } from 'vitest'

import type { CommandExitCode, CommandOutput } from '../src/lib/command-output.types.ts'
import type { PackRecord } from '../src/lib/knowledge/ask/ask.types.ts'
import type { Fact } from '../src/lib/knowledge/facts/facts.types.ts'
import type { QuestionRecord } from '../src/lib/store/store.types.ts'
import type {
	AnswerJson,
	AskedOverClauses,
	LotAsked,
	PackedInLot,
	PersonAnswerParams,
} from './ask-answer-fixtures.types.ts'
import type { AskCommandWorkspace } from './ask-command-workspace.types.ts'
import type { AskedForPack } from './ask-pack-fixtures.types.ts'
import type { CitedClause } from './ask-verdict-fixtures.types.ts'

/** The asks folder, id and flags of the first ask of a workspace, as the pack fixtures name them. */
function firstAskOf(params: { workspace: AskCommandWorkspace }): AskedForPack {
	return {
		workspace: params.workspace,
		asksFolder: asksFolderOf({ workspace: params.workspace }),
		ask: FIRST_ASK,
		sliceIds: [],
		sliceAngles: [],
		lotArgv: [],
	}
}

/** The first ask of a workspace of documents (or none) sent straight to the person with `--person-only` (exit 1). */
export async function askedPersonOnly(params: { documents: boolean }): Promise<AskedForPack> {
	const workspace = createDocumentsWorkspace({ standards: VERDICT_STANDARDS })
	const configured = params.documents
		? workspace
		: { ...workspace, environment: withoutRoot(workspace.environment) }
	await askedWith({
		workspace: configured,
		argv: [SEMANTIC_QUESTION, '--person-only'],
		exitCode: 1,
	})
	return firstAskOf({ workspace: configured })
}

/** The environment without `DIALECTE_STANDARD`: no documents are configured. */
function withoutRoot(environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
	const { DIALECTE_STANDARD: _root, ...rest } = environment
	return rest
}

/** The first ask of a documents workspace answered at rung 1 by the definition (exit 0, fact F-0001). */
export async function askedAnsweredAtRungOne(): Promise<AskedForPack> {
	const workspace = createDocumentsWorkspace({ standards: VERDICT_STANDARDS })
	await askedWith({ workspace, argv: [RUNG_ONE_QUESTION], exitCode: 0 })
	return firstAskOf({ workspace })
}

/**
 * An ask over two clauses whose round 1 was given the first slice of the ask only (written by hand, its verdict asking
 * for another round); `packRoundTwo` opens round 2 for real, which gives the other slice.
 */
export async function askedOverClausesInRounds(params: {
	packRoundTwo: boolean
}): Promise<AskedOverClauses> {
	const workspace = createDocumentsWorkspace({ standards: VERDICT_STANDARDS })
	const json = await askedJson({ workspace, argv: [SEMANTIC_QUESTION], exitCode: 3 })
	const asked: AskedForPack = {
		...firstAskOf({ workspace }),
		sliceIds: json.slices.map((slice) => slice.id),
		sliceAngles: json.slices.map((slice) => slice.angles),
	}
	writeRoundOne({ asked, given: 'first' })
	if (params.packRoundTwo) await packedWith({ workspace, argv: [asked.ask], exitCode: 0 })
	const [first] = json.slices
	const roundOneClause: CitedClause =
		first !== undefined && first.from <= CLAUSE_LINES.first && CLAUSE_LINES.first <= first.to
			? 'first'
			: 'second'
	return { asked, roundOneClause, json }
}

/** The clause the first slice of the ask does not hold: the one round 2 gives (or nothing, when not packed). */
export function otherClauseOf(params: { clause: CitedClause }): CitedClause {
	return params.clause === 'first' ? 'second' : 'first'
}

/** The words of `--cite` and `--quote` that cite the sentence of a clause, whole, at its line. */
export function citeArgvOf(params: { clause: CitedClause; quote?: string }): string[] {
	const line = CLAUSE_LINES[params.clause]
	return [
		'--cite',
		`${CITED_FILE}:${line}-${line}`,
		'--quote',
		params.quote ?? CLAUSE_SENTENCES[params.clause],
	]
}

/** `ask answer <ask> <text> --by <person> <argv>...` run in the ask's workspace, its exit code pinned in an `expect`. */
export async function personAnswered(
	params: PersonAnswerParams & { exitCode: CommandExitCode },
): Promise<CommandOutput> {
	const { asked } = params
	const run = runAsk({
		argv: [
			'answer',
			asked.ask,
			params.text ?? ANSWER_TEXT,
			...(params.by === null ? [] : ['--by', params.by ?? PERSON]),
			...(params.argv ?? []),
			...asked.lotArgv,
		],
		cwd: asked.workspace.cwd,
		environment: asked.workspace.environment,
	})
	await expect(run).resolves.toMatchObject({ exitCode: params.exitCode })
	return run
}

/** The parsed `--json` of an `ask answer` run. */
export async function personAnsweredJson(
	params: PersonAnswerParams & { exitCode: CommandExitCode },
): Promise<AnswerJson> {
	const answer = await personAnswered({ ...params, argv: [...(params.argv ?? []), '--json'] })
	return JSON.parse(answer.output) as AnswerJson
}

/** The ask's `answer.json`, parsed; undefined when the ask holds none. */
export function readAnswerRecord(params: { asked: AskedForPack }): unknown {
	const path = join(params.asked.asksFolder, params.asked.ask, ANSWER_FILE)
	return existsSync(path) ? readJsonFile(path) : undefined
}

/** The ids of the fact files of a ledger folder, sorted. */
export function factIdsIn(params: { folder: string }): string[] {
	return existsSync(params.folder)
		? readdirSync(params.folder)
				.filter((name) => /^F-\d+\.json$/u.test(name))
				.map((name) => name.replace('.json', ''))
				.sort()
		: []
}

/** A fact file of a ledger folder, parsed; undefined when the ledger holds no such fact. */
export function readFactIfAny(params: { folder: string; id: string }): Fact | undefined {
	return existsSync(join(params.folder, `${params.id}.json`)) ? readFactFile(params) : undefined
}

/** The text of a file of a ledger folder; undefined when there is none. */
export function factTextIfAny(params: { folder: string; id: string }): string | undefined {
	return existsSync(join(params.folder, `${params.id}.json`))
		? factFolderText({ folder: params.folder, name: `${params.id}.json` })
		: undefined
}

/** An ask of a store lot (documents of the cases, or none) made with `--lot`, kept with the lot. */
export async function askedInLot(params: {
	documents: boolean
	question?: string
	argv?: string[]
	exitCode: CommandExitCode
}): Promise<LotAsked> {
	const { workspace, lots, lotFolder } = createLotAskWorkspace({
		place: 'project',
		...(params.documents ? { standards: VERDICT_STANDARDS, standardName: DECLARED_NAME } : {}),
	})
	await askedWith({
		workspace,
		argv: [params.question ?? SEMANTIC_QUESTION, ...(params.argv ?? []), '--lot', lotFolder],
		exitCode: params.exitCode,
	})
	return {
		workspace,
		asksFolder: join(lotFolder, 'asks'),
		ask: FIRST_ASK,
		sliceIds: [],
		sliceAngles: [],
		lotArgv: ['--lot', lotFolder],
		lotFolder,
		lots,
	}
}

/** An outside ask of a store lot whose first round is open: packed `--outside`, each brief read. */
export async function packedOutsideInLot(): Promise<PackedInLot> {
	const asked = await askedInLot({ documents: false, exitCode: 3 })
	await packedWith({
		workspace: asked.workspace,
		argv: [asked.ask, '--outside', ...asked.lotArgv],
		exitCode: 0,
	})
	const pack = readRoundFile({ asked, round: ROUND_ONE, name: PACK_FILE }) as PackRecord
	const briefs = Object.fromEntries(
		pack.readers.map((reader) => [
			reader.letter,
			readRoundFile({ asked, round: ROUND_ONE, name: READER_FILES[reader.letter][0] }),
		]),
	)
	return { ...asked, briefs }
}

/** The questions the lot's transitions raised, in order. */
export function raisedQuestionsOf(params: { lotFolder: string }): QuestionRecord[] {
	return transitionFilesOf(params.lotFolder).flatMap((transition) =>
		transition.question === null ? [] : [transition.question],
	)
}

/** The names of the round folders of an ask, sorted (the folder holds none before round 1). */
export function roundFolderNames(params: { asked: AskedForPack }): string[] {
	const folder = join(params.asked.asksFolder, params.asked.ask, ROUNDS_FOLDER)
	return existsSync(folder) ? readdirSync(folder).sort() : []
}

/**
 * Points the process environment at the workspace's data, cache and documents, as the process of `lot answer` would
 * be (the hook reads the process, never an environment it is given); the test restores them when it ends.
 */
export function pointProcessAt(params: { workspace: AskCommandWorkspace }): void {
	const { environment } = params.workspace
	for (const name of ['XDG_DATA_HOME', 'XDG_CACHE_HOME', 'DIALECTE_STANDARD'])
		vi.stubEnv(name, environment[name])
}

/** A process id that no process holds: a child that ran and ended. */
export function deadProcessId(): number {
	const child = spawnSync(process.execPath, ['-e', ''], { encoding: 'utf8' })
	if (child.pid === undefined) throw new Error('the probe process has no id')
	return child.pid
}

/** The start time (ms) of a process as `ps` tells it; now when it cannot be read (a process that is gone). */
function startMsOf(pid: number): number {
	if (pid === process.pid) return Date.now() - process.uptime() * 1000
	const text = spawnSync('ps', ['-o', 'lstart=', '-p', String(pid)], {
		encoding: 'utf8',
	}).stdout.trim()
	const parsed = Date.parse(text)
	return Number.isNaN(parsed) ? Date.now() : parsed
}

/**
 * A claim file as a process left it: the process id, then its start time in ms (the form every claim has), last
 * written `ageMs` ago.
 */
export function writeClaimFile(params: { path: string; pid: number; ageMs: number }): void {
	writeTextFile({
		path: params.path,
		text: `${params.pid}\n${Math.round(startMsOf(params.pid))}\n`,
	})
	const written = new Date(Date.now() - params.ageMs)
	utimesSync(params.path, written, written)
}
