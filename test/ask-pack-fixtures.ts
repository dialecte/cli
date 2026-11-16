/**
 * Shared by the reader pack's tests: slices, angles and a file index built as whole values, and the trees the
 * `ask pack` command runs in (an ask that needs readers, a round 1 written by hand).
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { runAsk } from '../src/commands/ask.ts'
import { recordFact } from '../src/lib/knowledge/facts/record-fact.ts'
import {
	ASKS_FOLDER,
	FIRST_ASK,
	SECOND_ASK,
	SEMANTIC_QUESTION,
	STATE_ASKS_SEGMENTS,
} from './ask-command-workspace.constants.ts'
import {
	askedJson,
	createDocumentsWorkspace,
	createHandoverFolder,
	readJsonFile,
	withoutStandard,
} from './ask-command-workspace.ts'
import { workspaceFactsFolder } from './ask-fix-1-fixtures.ts'
import { SETUP_NOW } from './ask-ladder-fixtures.constants.ts'
import {
	HAND_WRITTEN_AT,
	HAND_WRITTEN_NONCES,
	PACK_FILE,
	PACK_STANDARDS,
	REASK_PACK_QUESTION,
	ROUND_ONE,
	ROUNDS_FOLDER,
	VERDICT_FILE,
} from './ask-pack-fixtures.constants.ts'
import { factDraft } from './fact-fixtures.ts'
import { WIDGET_PACKAGE } from './installed-test-dialecte.constants.ts'
import { writeTextFile } from './standard-workspace.ts'

import { expect } from 'vitest'

import type { CommandExitCode, CommandOutput } from '../src/lib/command-output.types.ts'
import type {
	AskAngle,
	AskSlice,
	PackRange,
	PackRecord,
	PoolSlice,
	ReaderLetter,
	ReaderPack,
	VerdictRecord,
} from '../src/lib/knowledge/ask/ask.types.ts'
import type { StandardFileIndex } from '../src/lib/knowledge/standard/standard-index.types.ts'
import type { AskCommandWorkspace } from './ask-command-workspace.types.ts'
import type {
	AngleOfParams,
	AskedForPack,
	AskSliceOfParams,
	PoolSliceOfParams,
	QualityBlockOf,
} from './ask-pack-fixtures.types.ts'

/** One slice of the ask's list, in a file of a hundred lines unless said. */
export function askSliceOf(params: AskSliceOfParams): AskSlice {
	return {
		id: params.id,
		file: params.file ?? 'example-0000/tag',
		from: params.from ?? 1,
		to: params.to ?? 10,
		clause: null,
		angles: params.angles ?? [],
		score: params.score ?? 1,
		linked: false,
	}
}

/** One slice of the pool: good, forty counted lines and no angle unless said. */
export function poolSliceOf(params: PoolSliceOfParams): PoolSlice {
	return {
		...askSliceOf({ id: params.id, angles: params.angles, from: params.from, to: params.to }),
		file: params.file ?? 'example-0000/tag',
		family: params.family,
		counted: params.counted ?? 40,
		quality: params.quality ?? 'good',
	}
}

/** One angle with no terms of its own. */
export function angleOf(params: AngleOfParams): AskAngle {
	return { id: params.id, family: params.family, terms: [] }
}

/** The index of a file made of `blocks` of quality: nothing else of it is read by the cases. */
export function fileIndexOf(params: { blocks: QualityBlockOf[] }): StandardFileIndex {
	return {
		fileId: 'example-0000/tag',
		lineCount: params.blocks[params.blocks.length - 1]?.to ?? 0,
		logicalLines: [],
		noiseRanges: [],
		headings: [],
		definitions: [],
		tables: [],
		crossReferences: [],
		quality: {
			blocks: params.blocks.map((block) => ({
				from: block.from,
				to: block.to,
				lines: block.to - block.from + 1,
				dropped: 0,
				noiseRatio: 0,
				verdict: block.verdict,
			})),
			verdict: 'partial',
			readableLines: 0,
			droppedLines: 0,
			headingCandidatesKept: 0,
			headingCandidatesTurnedProse: 0,
			repeatedLines: [],
		},
	}
}

/** The readers of a pack as the cases compare them: letter, slice ids, counted lines. */
export function readersOf(pack: ReaderPack): unknown {
	if ('skipped' in pack) return pack
	return pack.readers.map((reader) => ({
		letter: reader.letter,
		ids: reader.slices.map((slice) => slice.id),
		counted: reader.counted,
	}))
}

/** The reading of each slice's counted lines, from a table by slice id (forty when absent). */
export function countedByIdOf(
	table: Record<string, number>,
): (params: { slice: AskSlice }) => number {
	return function countedOfSlice(params) {
		return table[params.slice.id] ?? 40
	}
}

/** The reading of each slice's quality, from a table by slice id (good when absent). */
export function qualityByIdOf(
	table: Record<string, 'good' | 'poor' | 'unreadable'>,
): (params: { slice: AskSlice }) => 'good' | 'poor' | 'unreadable' {
	return function qualityOfSlice(params) {
		return table[params.slice.id] ?? 'good'
	}
}

/** The asks folder of a documents workspace's state folder. */
export function asksFolderOf(params: { workspace: AskCommandWorkspace }): string {
	return join(params.workspace.state, ...STATE_ASKS_SEGMENTS)
}

/**
 * A workspace of documents (two clauses naming the test dialecte's tag) and the first ask in it, answered with its
 * state `needs-readers`; `argv` are the flags given to that ask.
 */
export async function askedForPack(
	params: { argv?: string[]; single?: boolean; inHandover?: boolean } = {},
): Promise<AskedForPack> {
	const workspace = createDocumentsWorkspace({ standards: PACK_STANDARDS })
	const handover = params.inHandover === true ? createHandoverFolder({ workspace }) : undefined
	const lotArgv = handover === undefined ? [] : ['--lot', handover]
	const json = await askedJson({
		workspace,
		argv: [SEMANTIC_QUESTION, ...(params.argv ?? []), ...lotArgv],
		exitCode: 3,
	})
	const sliceIds = json.slices.map((slice) => slice.id)
	// the round cases need two slices to give apart; `single` is the ask made with --limit 1
	if (params.single === true) expect(sliceIds.length).toBe(1)
	else expect(sliceIds.length).toBeGreaterThan(1)
	return {
		workspace,
		asksFolder: handover === undefined ? asksFolderOf({ workspace }) : join(handover, ASKS_FOLDER),
		ask: FIRST_ASK,
		sliceIds,
		sliceAngles: json.slices.map((slice) => slice.angles),
		lotArgv,
	}
}

/**
 * A workspace of documents holding an unchecked fact about AA_1 and the ask the first ask made for it: the re-ask
 * `A-0002` (needs-readers), whose `ask.json` holds no angle and no slice and whose `request.json` comes from the fact.
 */
export async function reaskedForPack(): Promise<AskedForPack> {
	const workspace = createDocumentsWorkspace({ standards: PACK_STANDARDS })
	recordFact({
		folder: workspaceFactsFolder({ workspace }),
		draft: factDraft({
			question: REASK_PACK_QUESTION,
			subject: {
				package: WIDGET_PACKAGE,
				tags: [{ tag: 'AA_1', parent: null }],
				attributes: [],
				codes: [],
				methods: [],
			},
			kind: 'semantic',
			source: 'outside',
			sources: [{ kind: 'model' }],
		}),
		now: () => SETUP_NOW,
	})
	await askedJson({ workspace, argv: [SEMANTIC_QUESTION], exitCode: 3 })
	return {
		workspace,
		asksFolder: asksFolderOf({ workspace }),
		ask: SECOND_ASK,
		sliceIds: [],
		sliceAngles: [],
		lotArgv: [],
	}
}

/**
 * The twin of `reaskedForPack`: a workspace of the same documents and no unchecked fact, whose first ask `A-0001` asks
 * what the re-ask's request records (its question, its subject as `--about`, its package).
 */
export async function reaskTwinForPack(): Promise<AskedForPack> {
	const workspace = createDocumentsWorkspace({ standards: PACK_STANDARDS })
	const json = await askedJson({
		workspace,
		argv: [REASK_PACK_QUESTION, '--about', 'AA_1', '--package', WIDGET_PACKAGE],
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

/** The first ask of a workspace with no documents configured: needs-readers on the outside route (exit 3). */
export async function askedOutside(): Promise<AskedForPack> {
	const workspace = withoutStandard({
		workspace: createDocumentsWorkspace({ standards: PACK_STANDARDS }),
	})
	await askedJson({ workspace, argv: [SEMANTIC_QUESTION], exitCode: 3 })
	return {
		workspace,
		asksFolder: asksFolderOf({ workspace }),
		ask: FIRST_ASK,
		sliceIds: [],
		sliceAngles: [],
		lotArgv: [],
	}
}

/** Every file of a folder: its text and its modification time, by name (nothing when the folder is absent). */
export function snapshotOf(folder: string): Record<string, { text: string; modified: number }> {
	if (!existsSync(folder)) return {}
	return Object.fromEntries(
		readdirSync(folder)
			.sort()
			.map((name) => [
				name,
				{
					text: readFileSync(join(folder, name), 'utf8'),
					modified: statSync(join(folder, name)).mtimeMs,
				},
			]),
	)
}

/** `ask pack <argv>` run in the workspace, its exit code pinned inside an `expect`. */
export async function packedWith(params: {
	workspace: AskCommandWorkspace
	argv: string[]
	exitCode: CommandExitCode
}): Promise<CommandOutput> {
	const run = runAsk({
		argv: ['pack', ...params.argv],
		cwd: params.workspace.cwd,
		environment: params.workspace.environment,
	})
	await expect(run).resolves.toMatchObject({ exitCode: params.exitCode })
	return run
}

/** The folder of a round of an ask. */
export function roundFolderOf(params: { asked: AskedForPack; round: string }): string {
	return join(params.asked.asksFolder, params.asked.ask, ROUNDS_FOLDER, params.round)
}

/** The parsed JSON of a file of a round of the ask. */
export function readRoundFile(params: {
	asked: AskedForPack
	round: string
	name: string
}): unknown {
	return readJsonFile(join(roundFolderOf(params), params.name))
}

/** The slices of an ask's `ask.json` that `ids` name, as the ranges a pack records for a reader that was given them. */
export function rangesOfIds(params: { asked: AskedForPack; ids: string[] }): PackRange[] {
	const record = readJsonFile(join(params.asked.asksFolder, params.asked.ask, 'ask.json')) as {
		slices: (PackRange & { angles: string[] })[]
	}
	return params.ids.flatMap((id) =>
		record.slices
			.filter((slice) => slice.id === id)
			.map((slice) => ({
				id: slice.id,
				file: slice.file,
				from: slice.from,
				to: slice.to,
				clause: slice.clause,
				linked: slice.linked,
			})),
	)
}

/**
 * Round 1 as a person left it: a `pack.json` whose readers (A and B; C too at high) were given the first slice of
 * the ask only, or every slice of it, and a `verdict.json` that asked for another round.
 */
export function writeRoundOne(params: {
	asked: AskedForPack
	given: 'first' | 'all'
	high?: boolean
	verifiedAngles?: string[]
	/** The verdict closed the ask as answered instead of asking for another round. */
	answered?: boolean
	/** The reports the verdict keeps (none unless said). */
	reports?: VerdictRecord['reports']
}): void {
	const { asked } = params
	const folder = roundFolderOf({ asked, round: ROUND_ONE })
	const given = params.given === 'first' ? asked.sliceIds.slice(0, 1) : asked.sliceIds
	const letters: ReaderLetter[] = params.high === true ? ['A', 'B', 'C'] : ['A', 'B']
	const pack: PackRecord = {
		schema: 1,
		ask: asked.ask,
		round: 1,
		outside: false,
		web: false,
		readers: letters.map((letter) => ({
			letter,
			nonce: HAND_WRITTEN_NONCES[letter],
			slices: given,
			ranges: rangesOfIds({ asked, ids: given }),
		})),
		at: HAND_WRITTEN_AT,
	}
	writeTextFile({ path: join(folder, PACK_FILE), text: `${JSON.stringify(pack, null, '\t')}\n` })
	const verdict: VerdictRecord = {
		schema: 1,
		ask: asked.ask,
		round: 1,
		adjudicator: false,
		reports: params.reports ?? [],
		outcome:
			params.answered === true
				? {
						state: 'answered',
						agreed: { verdict: 'yes', value: null, answer: 'Yes.', cites: [], letters: ['A', 'B'] },
					}
				: { state: 'next-round', reason: 'disagreement' },
		verifiedAngles: params.verifiedAngles ?? [],
		state: params.answered === true ? 'answered' : 'needs-readers',
		next: params.answered === true ? null : `dialecte ask pack ${asked.ask}`,
		fact: params.answered === true ? 'F-0001' : null,
		at: HAND_WRITTEN_AT,
	}
	writeTextFile({
		path: join(folder, VERDICT_FILE),
		text: `${JSON.stringify(verdict, null, '\t')}\n`,
	})
}
