/**
 * Shared by the `ask verdict` tests: an ask over two clauses whose first round is open, the readers' reports written
 * as whole files from what their briefs gave (the nonce, the slices and their lines), and the command run on them.
 */
import { join } from 'node:path'

import { runAsk } from '../src/commands/ask.ts'
import { FIRST_ASK, SEMANTIC_QUESTION } from './ask-command-workspace.constants.ts'
import {
	askedJson,
	createDocumentsWorkspace,
	readJsonFile,
	withoutStandard,
} from './ask-command-workspace.ts'
import {
	PACK_FILE,
	ROUND_TWO,
	PACK_STANDARDS,
	READER_FILES,
	ROUND_ONE,
	ROUNDS_FOLDER,
	VERDICT_FILE,
} from './ask-pack-fixtures.constants.ts'
import { asksFolderOf, packedWith, readRoundFile } from './ask-pack-fixtures.ts'
import {
	ADJUDICATOR_BRIEF_JSON,
	ANSWER_LONG_TEXT,
	ANSWER_SHORT_TEXT,
	CITED_LINE_MARKER,
	CLAIM_TEXT,
	FIRST_SENTENCE_TAIL,
	REPORTS_FOLDER,
	WEB_CITE,
	SECOND_CLAUSE_MARKER,
	USED_FOLDER,
	VERDICT_STANDARDS,
} from './ask-verdict-fixtures.constants.ts'
import { writeTextFile } from './standard-workspace.ts'

import { expect } from 'vitest'

import type { CommandExitCode, CommandOutput } from '../src/lib/command-output.types.ts'
import type {
	DocumentReport,
	OutsideReport,
	ReaderLetter,
	ReportVerdict,
} from '../src/lib/knowledge/ask/ask.types.ts'
import type { PackRecord } from '../src/lib/knowledge/ask/ask.types.ts'
import type { AskedForPack } from './ask-pack-fixtures.types.ts'
import type {
	BriefForReport,
	BriefSliceWithLines,
	CitedClause,
	OutsideReportOfParams,
	PackedForVerdict,
	ReportOfParams,
	VerdictJson,
} from './ask-verdict-fixtures.types.ts'
import type { StandardsDescription } from './standard-workspace.types.ts'

/** The first ask of a workspace of two clauses, made with the question and the flags given: needs readers (exit 3). */
async function askedOverClauses(params: {
	question?: string
	argv?: string[]
	standards?: StandardsDescription
}): Promise<AskedForPack> {
	const workspace = createDocumentsWorkspace({ standards: params.standards ?? VERDICT_STANDARDS })
	const json = await askedJson({
		workspace,
		argv: [params.question ?? SEMANTIC_QUESTION, ...(params.argv ?? [])],
		exitCode: 3,
	})
	return {
		workspace,
		asksFolder: asksFolderOf({ workspace }),
		ask: FIRST_ASK,
		sliceIds: json.slices.map((slice) => slice.id),
		sliceAngles: json.slices.map((slice) => slice.angles),
		lotArgv: [],
	}
}

/** The briefs the pack of a round (the first unless said) wrote, one per letter its `pack.json` names. */
export function briefsOf(params: {
	asked: AskedForPack
	round?: string
}): PackedForVerdict['briefs'] {
	const { asked } = params
	const round = params.round ?? ROUND_ONE
	const pack = readRoundFile({ asked, round, name: PACK_FILE }) as PackRecord
	return Object.fromEntries(
		pack.readers.map((reader) => [
			reader.letter,
			readRoundFile({ asked, round, name: READER_FILES[reader.letter][0] }),
		]),
	)
}

/**
 * An ask over two clauses (the question and flags given, a semantic one at medium unless said; the documents of the
 * verdict cases unless said) whose first round is open: packed, each reader's brief read.
 */
export async function packedForVerdict(
	params: { question?: string; argv?: string[]; standards?: StandardsDescription } = {},
): Promise<PackedForVerdict> {
	const asked = await askedOverClauses(params)
	await packedWith({ workspace: asked.workspace, argv: [asked.ask], exitCode: 0 })
	return { ...asked, briefs: briefsOf({ asked }) }
}

/** An ask with no documents configured whose outside round is open: packed `--outside`, each brief read. */
export async function packedOutsideForVerdict(
	params: { question?: string; argv?: string[]; web?: boolean } = {},
): Promise<PackedForVerdict> {
	const workspace = withoutStandard({
		workspace: createDocumentsWorkspace({ standards: PACK_STANDARDS }),
	})
	await askedJson({
		workspace,
		argv: [params.question ?? SEMANTIC_QUESTION, ...(params.argv ?? [])],
		exitCode: 3,
	})
	const asked: AskedForPack = {
		workspace,
		asksFolder: asksFolderOf({ workspace }),
		ask: FIRST_ASK,
		sliceIds: [],
		sliceAngles: [],
		lotArgv: [],
	}
	await packedWith({
		workspace,
		argv: [asked.ask, '--outside', ...(params.web === true ? ['--web'] : [])],
		exitCode: 0,
	})
	return { ...asked, briefs: briefsOf({ asked }) }
}

/** The brief of a reader of the open round. */
export function briefOf(params: {
	packed: PackedForVerdict
	letter: ReaderLetter
}): BriefForReport {
	const brief = params.packed.briefs[params.letter]
	if (brief === undefined) throw new Error(`the round holds no brief for reader ${params.letter}`)
	return brief
}

/** The slice of the brief that holds the first or the second clause (told by the words of its lines). */
function sliceOfClause(params: {
	brief: BriefForReport
	clause: 'first' | 'second'
}): BriefSliceWithLines {
	const wanted = params.clause === 'second'
	const slice = params.brief.slices.find((candidate) =>
		candidate.lines.some((line) => line.text.includes(SECOND_CLAUSE_MARKER) === wanted),
	)
	if (slice === undefined)
		throw new Error(`the brief of reader ${params.brief.reader} holds no ${params.clause} clause`)
	return slice
}

/** A whole document report of a reader: it cites the line of a clause that holds `shall` and backs its verdict. */
export function reportOf(params: ReportOfParams): DocumentReport {
	const brief = briefOf({ packed: params.packed, letter: params.letter })
	const slice = sliceOfClause({ brief, clause: params.clause ?? 'first' })
	const line = slice.lines.find((candidate) => candidate.text.includes(CITED_LINE_MARKER))
	if (line === undefined) throw new Error(`the slice ${slice.id} holds no line with shall`)
	const verdict = params.verdict ?? 'yes'
	return {
		ask: params.ask ?? params.packed.ask,
		round: params.round ?? brief.round,
		reader: params.letter,
		nonce: brief.nonce,
		verdict,
		value: params.value ?? null,
		answer: params.answer ?? ANSWER_SHORT_TEXT,
		claims: [
			{
				text: params.claimText ?? CLAIM_TEXT,
				supports: verdict,
				cites: [
					{ file: slice.file, from: line.from, to: line.to, quote: params.quote ?? line.text },
				],
			},
		],
		notFound: [],
		familiesRead: ['parents'],
		session: params.session ?? `session-${params.letter}`,
	}
}

/** A whole outside report of a reader: a model's answer by default, no cite. */
export function outsideReportOf(params: OutsideReportOfParams): OutsideReport {
	const brief = briefOf({ packed: params.packed, letter: params.letter })
	const verdict = params.verdict ?? 'yes'
	return {
		ask: params.packed.ask,
		round: brief.round,
		reader: params.letter,
		nonce: brief.nonce,
		source: params.source ?? 'model',
		verdict,
		value: params.value ?? null,
		answer: params.answer ?? ANSWER_SHORT_TEXT,
		claims: [
			{
				text: CLAIM_TEXT,
				supports: verdict === 'not-known' ? 'not-in-text' : verdict,
				cites: params.source === 'web' ? [WEB_CITE] : [],
			},
		],
		notFound: [],
		familiesRead: [],
		session: params.session ?? `session-${params.letter}`,
	}
}

/** Writes a report (or any value) as a whole file below the project's reports folder; answers its path. */
export function reportFileOf(params: {
	packed: PackedForVerdict
	name: string
	report: unknown
}): string {
	const path = join(params.packed.workspace.base, REPORTS_FOLDER, `${params.name}.json`)
	writeTextFile({ path, text: `${JSON.stringify(params.report, null, '\t')}\n` })
	return path
}

/** `ask verdict <ask> <files>... <argv>...` run in the workspace, its exit code pinned inside an `expect`. */
export async function verdictedWith(params: {
	packed: AskedForPack
	files: string[]
	argv?: string[]
	exitCode: CommandExitCode
}): Promise<CommandOutput> {
	const { packed } = params
	const run = runAsk({
		argv: ['verdict', packed.ask, ...params.files, ...(params.argv ?? []), ...packed.lotArgv],
		cwd: packed.workspace.cwd,
		environment: packed.workspace.environment,
	})
	await expect(run).resolves.toMatchObject({ exitCode: params.exitCode })
	return run
}

/** The parsed `--json` of an `ask verdict` run. */
export async function verdictedJson(params: {
	packed: AskedForPack
	files: string[]
	argv?: string[]
	exitCode: CommandExitCode
}): Promise<VerdictJson> {
	const answer = await verdictedWith({ ...params, argv: [...(params.argv ?? []), '--json'] })
	return JSON.parse(answer.output) as VerdictJson
}

/**
 * The reports of readers A and B that agree and differ in their words (a report whose body equals another's is
 * refused): both cite the first clause, A the whole line with the long answer, B its first words with the short one.
 */
export function agreeingReportsOf(params: {
	packed: PackedForVerdict
	verdict?: ReportVerdict
	value?: string | null
}): DocumentReport[] {
	const { packed, verdict, value } = params
	return [
		reportOf({ packed, letter: 'A', verdict, value, answer: ANSWER_LONG_TEXT }),
		reportOf({ packed, letter: 'B', verdict, value, quote: FIRST_SENTENCE_TAIL }),
	]
}

/** Writes each report as a file named by its reader; answers the paths in the order of the reports. */
export function reportFilesOf(params: {
	packed: PackedForVerdict
	reports: (DocumentReport | OutsideReport)[]
}): string[] {
	return params.reports.map((report) =>
		reportFileOf({ packed: params.packed, name: `report-${report.reader}`, report }),
	)
}

/** The angle ids (sorted, each once) of the slices of the clauses cited, as the ask listed them. */
export function anglesOfClauses(params: {
	packed: PackedForVerdict
	clauses: CitedClause[]
}): string[] {
	const { packed } = params
	const brief = briefOf({ packed, letter: 'A' })
	const angles = params.clauses.flatMap((clause) => {
		const { id } = sliceOfClause({ brief, clause })
		return packed.sliceAngles[packed.sliceIds.indexOf(id)] ?? []
	})
	return [...new Set(angles)].sort()
}

/**
 * The report of reader C of a high ask: it found nothing (not-in-text, no claim), so it cites no range and never
 * changes which ranges the adjudicator is given.
 */
export function readerCReportOf(params: { packed: PackedForVerdict }): DocumentReport {
	const brief = briefOf({ packed: params.packed, letter: 'C' })
	return {
		ask: params.packed.ask,
		round: brief.round,
		reader: 'C',
		nonce: brief.nonce,
		verdict: 'not-in-text',
		value: null,
		answer: 'The slices given to reader C do not say.',
		claims: [],
		notFound: [],
		familiesRead: ['parents'],
		session: 'session-C',
	}
}

/**
 * A high ask whose first round ended at the adjudicator (reader A's claim conflicts in polarity) and whose
 * adjudicator's brief was written by `ask pack`: the packed ask and what the brief gave (round, nonce).
 */
export async function packedForAdjudicator(): Promise<{
	packed: PackedForVerdict
	round: number
	nonce: string
}> {
	const packed = await packedForVerdict({ argv: ['--effort', 'high'] })
	const files = reportFilesOf({
		packed,
		reports: [
			reportOf({ packed, letter: 'A', claimText: 'AA_1 shall not hold AAA_1' }),
			reportOf({ packed, letter: 'B' }),
			readerCReportOf({ packed }),
		],
	})
	await verdictedWith({ packed, files, exitCode: 3 })
	await packedWith({ workspace: packed.workspace, argv: [packed.ask], exitCode: 0 })
	const brief = readRoundFile({
		asked: packed,
		round: ROUND_TWO,
		name: ADJUDICATOR_BRIEF_JSON,
	}) as { round: number; nonce: string }
	return { packed, round: brief.round, nonce: brief.nonce }
}

/** The adjudicator's whole report: reader A's reading of the first clause, under the adjudicator's round and nonce. */
export function adjudicatorReportOf(params: {
	packed: PackedForVerdict
	round: number
	nonce: string
	quote?: string
	/** The clause it cites (the first, the one the readers cited, unless said). */
	clause?: CitedClause
}): DocumentReport {
	return {
		...reportOf({
			packed: params.packed,
			letter: 'A',
			answer: ANSWER_LONG_TEXT,
			quote: params.quote,
			clause: params.clause,
		}),
		reader: 'adjudicator',
		round: params.round,
		nonce: params.nonce,
		session: 'session-adjudicator',
	}
}

/** A nonce claimed by an earlier run: the empty file `ask verdict` leaves below the round's used folder. */
export function claimNonceOf(params: { packed: AskedForPack; nonce: string }): void {
	writeTextFile({
		path: join(
			params.packed.asksFolder,
			params.packed.ask,
			ROUNDS_FOLDER,
			ROUND_ONE,
			USED_FOLDER,
			params.nonce,
		),
		text: '',
	})
}

/** The parsed `verdict.json` of a round of the ask. */
export function readVerdictRecord(params: { packed: AskedForPack; round: string }): unknown {
	return readJsonFile(
		join(params.packed.asksFolder, params.packed.ask, ROUNDS_FOLDER, params.round, VERDICT_FILE),
	)
}
