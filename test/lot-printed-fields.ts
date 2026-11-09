/** Builds the lots of the printed-fields test, forges one field of one record, runs the verbs and judges what they print. */
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { waitLot } from '../src/commands/lot-wait.ts'
import { runLot } from '../src/commands/lot.ts'
import { HANDOVER_FILES, HANDOVER_RUN_MARKER_FILE } from '../src/lib/handover/handover.constants.ts'
import { registryOfLotFolder } from '../src/lib/store/lot-records.ts'
import { SCENARIO_SCHEMA, SCENARIOS } from '../src/lib/store/scenarios.constants.ts'
import { createBriefWorkspace, writeStoreLot } from './brief-workspace.ts'
import { markAbandoned } from './handover-store-scenario.ts'
import { inboxIn } from './inbox-workspace.ts'
import {
	FORGED_MARK,
	FORGED_TAILS,
	FORGED_TIME_VALUE,
	FORGED_VALUE,
	PRINTED_VERB_ORDER,
	RECAP_QUESTION_TEXT,
	STORE_TIME_PATTERN,
	THREW_PREFIX,
} from './lot-printed-fields.constants.ts'
import { QUESTION_LOT, QUESTION_NOW } from './lot-questions.constants.ts'
import { writeAnswerFile } from './lot-questions.ts'
import { RUN_STARTED_AT } from './lot-stop-workspace.constants.ts'
import { resultOf, stopOf } from './lot-stop-workspace.ts'
import { writeStoreListFile } from './lot-stores.ts'
import { lotWithAnswers } from './lot-with-answers.ts'
import { createWaitTime } from './simulated-lot.ts'
import { answerOf, entryOf, identityOf, transitionOf, writeRecordFile } from './store-records.ts'
import { unsafeCharactersIn } from './unsafe-characters.ts'

import type { CommandResult } from '../src/lib/command-result.types.ts'
import type {
	PrintedFile,
	PrintedKind,
	PrintedLot,
	PrintedVerb,
} from './lot-printed-fields.types.ts'

/** The lot of `kind` built in a scratch workspace, its store listed for the inbox. */
export function buildPrintedLot(kind: PrintedKind): PrintedLot {
	if (kind.real) {
		const lot = lotWithAnswers({
			questions: { 1: RECAP_QUESTION_TEXT },
			answers: [{ file: 'q1.json', body: answerOf(1) }],
		})
		return {
			cwd: lot.start.repository,
			lotFolder: lot.lotFolder,
			registry: registryOfLotFolder(lot.lotFolder),
			name: lot.lotName,
		}
	}
	const workspace = createBriefWorkspace()
	const lotFolder = writeStoreLot({
		workspace,
		name: QUESTION_LOT,
		scope: ['src/'],
		simulated: kind.simulated,
		later: [...kind.later],
		registry: kind.registry,
		repository: workspace.repository,
	})
	for (const record of kind.answers) writeAnswerFile({ lotFolder, record })
	if (kind.abandoned) markAbandoned({ folder: lotFolder, file: HANDOVER_FILES.abandoned })
	if (kind.running)
		writeFileSync(
			join(lotFolder, HANDOVER_RUN_MARKER_FILE),
			JSON.stringify({ pid: process.pid, startedAt: RUN_STARTED_AT }),
		)
	if (kind.simulated)
		writeRecordFile({
			folder: lotFolder,
			name: 'scenario.json',
			text: JSON.stringify({
				schema: SCENARIO_SCHEMA,
				name: 'question',
				steps: SCENARIOS.question,
			}),
		})
	writeStoreListFile({ stores: [workspace.store] })
	return { cwd: workspace.repository, lotFolder, registry: workspace.registry, name: QUESTION_LOT }
}

/** Every record file the lot of `kind` holds, each with a record of the shape it holds: where the fields come from. */
export function printedFilesOf(kind: PrintedKind): PrintedFile[] {
	const transitions = [transitionOf({ seq: 1, kind: 'start' }), ...kind.later]
	if (kind.real) transitions.push(transitionOf({ seq: 21, kind: 'question' }))
	return [
		{ where: 'lot', name: 'identity.json', template: identityOf() },
		...transitions.map((transition) => ({
			where: 'lot' as const,
			name: `transitions/${String(transition.seq).padStart(6, '0')}.json`,
			template: transition,
		})),
		...[...kind.answers, ...(kind.real ? [answerOf(1)] : [])].map((answer) => ({
			where: 'lot' as const,
			name: `answers/${answer.question}.json`,
			template: answer,
		})),
		...(kind.registry === undefined
			? []
			: [
					{
						where: 'registry' as const,
						name: `${QUESTION_LOT}.json`,
						template: entryOf({ state: kind.registry }),
					},
				]),
		...(kind.abandoned
			? [{ where: 'lot' as const, name: HANDOVER_FILES.abandoned, template: { at: '' } }]
			: []),
		...(kind.running
			? [
					{
						where: 'lot' as const,
						name: HANDOVER_RUN_MARKER_FILE,
						template: { pid: 0, startedAt: '' },
					},
				]
			: []),
		...(kind.simulated
			? [
					{
						where: 'lot' as const,
						name: 'scenario.json',
						template: { schema: SCENARIO_SCHEMA, name: 'question', steps: SCENARIOS.question },
					},
				]
			: []),
	]
}

/** The fields (strings, numbers, booleans, nulls) of a record: each path as a list of keys, and whether it holds a time. */
export function leavesOf(params: {
	value: unknown
	prefix?: readonly string[]
}): { path: string[]; time: boolean }[] {
	const { value } = params
	const prefix = params.prefix ?? []
	if (typeof value !== 'object' || value === null)
		return [
			{ path: [...prefix], time: typeof value === 'string' && STORE_TIME_PATTERN.test(value) },
		]
	return Object.entries(value).flatMap(([key, inner]) =>
		leavesOf({ value: inner, prefix: [...prefix, key] }),
	)
}

/** Replaces the field at `path` of the record file at `file` with a forged value (a time-shaped one for a time); false when the file has no such parent. */
export function forgeField(params: {
	file: string
	path: readonly string[]
	time: boolean
}): boolean {
	const record = JSON.parse(readFileSync(params.file, 'utf8')) as Record<string, unknown>
	let holder: Record<string, unknown> = record
	for (const key of params.path.slice(0, -1)) {
		const next = holder[key]
		if (typeof next !== 'object' || next === null) return false
		holder = next as Record<string, unknown>
	}
	holder[params.path.at(-1) ?? ''] = params.time ? FORGED_TIME_VALUE : FORGED_VALUE
	// the published file is read-only: replaced, as a hand with write access to the folder would
	rmSync(params.file)
	writeFileSync(params.file, `${JSON.stringify(record)}\n`)
	return true
}

/** The path of a record file of the lot. */
export function pathOfPrintedFile(params: { lot: PrintedLot; file: PrintedFile }): string {
	const { lot, file } = params
	return join(file.where === 'lot' ? lot.lotFolder : lot.registry, file.name)
}

/** The text form of each of `verbs` on the lot, run in the order of `PRINTED_VERB_ORDER`. */
export async function printedBy(params: {
	lot: PrintedLot
	verbs: readonly PrintedVerb[]
}): Promise<Partial<Record<PrintedVerb, CommandResult>>> {
	const { lot } = params
	const printed: Partial<Record<PrintedVerb, CommandResult>> = {}
	for (const verb of PRINTED_VERB_ORDER.filter((each) => params.verbs.includes(each)))
		printed[verb] = await runVerb({ lot, verb })
	return printed
}

/** One verb of the lot, in its text form; a verb that throws prints what a crash would: `threw: <message>`. */
async function runVerb(params: { lot: PrintedLot; verb: PrintedVerb }): Promise<CommandResult> {
	try {
		return await runVerbUnguarded(params)
	} catch (error) {
		return { exitCode: -1, output: `${THREW_PREFIX}${(error as Error).message}` }
	}
}

/** One verb of the lot, in its text form. */
async function runVerbUnguarded(params: {
	lot: PrintedLot
	verb: PrintedVerb
}): Promise<CommandResult> {
	const { cwd, name } = params.lot
	if (params.verb === 'status') return runLot({ cwd, argv: ['status', name] })
	if (params.verb === 'recap') return runLot({ cwd, argv: ['recap', name] })
	if (params.verb === 'result') return resultOf({ cwd, id: name, json: false })
	if (params.verb === 'inbox') return inboxIn({ cwd })
	if (params.verb === 'stop') return stopOf({ cwd, id: name })
	if (params.verb === 'answer')
		return runLot({ cwd, argv: ['answer', name, 'q1', 'keep'], now: QUESTION_NOW })
	const time = createWaitTime()
	return waitLot({ cwd, argv: [name, '--timeout', '0'], clock: time.clock, sleep: time.sleep })
}

/** What a printed text keeps of its shape: the first word of each line, so the count and the prefixes. */
function lineShapeOf(output: string): string {
	return JSON.stringify(output.split('\n').map((line) => line.split(' ')[0]))
}

/**
 * The verbs whose forged output breaks the class invariant: it throws; it holds a raw carriage return, escape or
 * other unsafe character; a printed line begins with the forged tail; or, when it exits as the unforged run did
 * and shows a forged field, its lines differ in count or first word. A lot read damaged shows no forged field and
 * exits otherwise, so it passes.
 */
export function unsafeVerbsOf(params: {
	baseline: Partial<Record<PrintedVerb, CommandResult>>
	forged: Partial<Record<PrintedVerb, CommandResult>>
}): PrintedVerb[] {
	return PRINTED_VERB_ORDER.filter(function isUnsafe(verb) {
		const base = params.baseline[verb]
		const result = params.forged[verb]
		if (base === undefined || result === undefined) return false
		const { output } = result
		if (output.startsWith(THREW_PREFIX)) return true
		const lines = output.split('\n')
		if (unsafeCharactersIn({ text: output, lines: lines.length }).length > 0) return true
		if (lines.some((line) => FORGED_TAILS.some((tail) => line.startsWith(tail)))) return true
		if (result.exitCode !== base.exitCode || !output.includes(FORGED_MARK)) return false
		return lineShapeOf(output) !== lineShapeOf(base.output)
	})
}
