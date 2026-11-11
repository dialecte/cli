/**
 * `dialecte lot result <id> [--json]` (33S section 7): what a host reads once a lot stops being busy. Never blocks
 * and writes nothing; the hand-over's card comes from git, as `handover show --json` computes it.
 */
import { handoverCardData } from '../lib/handover/handover-card.ts'
import { handoverState } from '../lib/handover/list-handovers.ts'
import { readHandoverFolder } from '../lib/handover/read-handover-folder.ts'
import { JSON_FLAG } from '../lib/parse-invocation.constants.ts'
import { jsonOf, textOf } from '../lib/print/print.ts'
import { readArguments } from '../lib/review-rounds/round-arguments.ts'
import { exitCodeOfState } from '../lib/store/exit-code-of-state.ts'
import { lotDamagedExit, lotRefusalExit, lotUsageExit } from '../lib/store/lot-exits.ts'
import { readCheckedLotState, registryOfLotFolder } from '../lib/store/lot-records.ts'
import { lotState } from '../lib/store/lot-state.ts'
import { noLotRefusal, requiredLotOf } from '../lib/store/resolve-lot.ts'
import { NEXT_COMMANDS } from '../lib/store/store.constants.ts'
import { shownHandoverCard } from './handover.ts'
import {
	RESULT_ABANDONED_REASON,
	RESULT_FLAGS,
	RESULT_PLACEHOLDER_PATTERN,
	RESULT_TEXTS,
} from './lot-result.constants.ts'

import type { CommandResult } from '../lib/command-result.types.ts'
import type { HandoverFolder, HandoverProbe, StoreEntry } from '../lib/handover/handover.types.ts'
import type { LotStateInput, LotStateReport } from '../lib/store/store.types.ts'
import type {
	BusyResultJson,
	EndedResultJson,
	LotResultParams,
	ReadyResultJson,
	ResultHandover,
	ResultQuestion,
} from './lot-result.types.ts'

/**
 * The result of the lot `<id>` names, as text or `--json`: `ready` or `committed` exit 0 with the hand-over (its
 * card, show and run lines), the worktree, the branch and the answered questions; `failed` or `canceled` exit 1
 * with the last transition's reason, time and position; `input-required` exit 3 with the open questions;
 * `working` exit 5; a damaged lot exit 6 with its reason and the stop to run; a usage error or an unknown id exit 2. Agent text is printed escaped in the text form.
 */
export function lotResult(params: LotResultParams): CommandResult {
	const read = readArguments({ argv: params.argv, valueOptions: [], flags: RESULT_FLAGS })
	if (typeof read === 'string')
		return lotUsageExit({ reason: read, json: params.argv.includes(JSON_FLAG) })
	const json = read.flags.has('json')
	const [id, ...extra] = read.words
	if (id === undefined) return lotUsageExit({ reason: 'lot result takes one id: none given', json })
	if (extra.length > 0)
		return lotUsageExit({ reason: `lot result takes one id, not also ${extra.join(' ')}`, json })
	const required = requiredLotOf({ argument: id, cwd: params.cwd, mode: 'read' })
	if ('exitCode' in required) return lotRefusalExit({ lines: required.lines, json })
	const lotFolder = required.lot
	const checked = readCheckedLotState({ lotFolder, registry: registryOfLotFolder(lotFolder) })
	if (checked === undefined) return lotRefusalExit({ lines: [noLotRefusal(id)], json })
	if ('damage' in checked) return lotDamagedExit({ lotFolder, damage: checked.damage, json })
	const { input } = checked
	const report = lotState(input)
	const exitCode = exitCodeOfState({
		verb: 'result',
		state: report.state,
		limit: report.limit,
		timedOut: false,
	})
	const { state } = report
	// the text forms print their lines through the boundary; JSON takes the values as stored
	if (state === 'ready' || state === 'committed') {
		const ready = readyResultOf({ input, report, probe: params.probe, cliPath: params.cliPath })
		return { exitCode, output: json ? jsonOf(ready, 2) : textOf(readyLines(ready)) }
	}
	const { name } = input.identity
	if (state === 'failed' || state === 'canceled') {
		const ended = endedResultOf({ input, report })
		return { exitCode, output: json ? jsonOf(ended, 2) : textOf([endedLine({ name, ended })]) }
	}
	const busy: BusyResultJson = { state, questions: report.openQuestions }
	return { exitCode, output: json ? jsonOf(busy, 2) : textOf(busyLines({ name, busy })) }
}

/** The result of a `ready` or `committed` lot: its hand-over (none for a simulated lot), worktree, branch, answers. */
function readyResultOf(params: {
	input: LotStateInput
	report: LotStateReport
	probe?: HandoverProbe
	cliPath?: string
}): ReadyResultJson {
	const { input } = params
	const { identity, registryEntry } = input
	let handover: ReadyResultJson['handover'] = null
	if (identity.simulated) handover = { simulated: true }
	else if (registryEntry)
		handover = resultHandoverOf({
			entry: registryEntry,
			probe: params.probe,
			cliPath: params.cliPath,
		})
	return {
		lot: identity.name,
		state: params.report.state,
		handover,
		worktree: identity.worktree,
		branch: identity.branch,
		questions: answeredQuestionsOf(input),
		simulated: identity.simulated,
	}
}

/**
 * The hand-over a registry entry names: its card recomputed as `handover show --json` does, its state read from
 * git (the registry's when the folder does not read), and the show and run lines.
 */
function resultHandoverOf(params: {
	entry: StoreEntry
	probe?: HandoverProbe
	cliPath?: string
}): ResultHandover {
	const { entry } = params
	const handover = readableHandoverOf(entry.folder)
	const lines = {
		show: NEXT_COMMANDS.show.replace('{handover}', entry.name),
		run: NEXT_COMMANDS.run.replace('{handover}', entry.name),
	}
	if (typeof handover === 'string')
		return { name: entry.name, folder: entry.folder, state: entry.state, card: null, ...lines }
	const card = shownHandoverCard({ handover, probe: params.probe, cliPath: params.cliPath })
	return {
		name: entry.name,
		folder: entry.folder,
		state: handoverState(handover),
		card: handoverCardData(card),
		...lines,
	}
}

/** The answered questions, in the order they were asked: id, text, the answer and who gave it. */
function answeredQuestionsOf(input: LotStateInput): ResultQuestion[] {
	return input.transitions.flatMap(function answeredOf(transition): ResultQuestion[] {
		const { question } = transition
		const answer = question && input.answers.find((each) => each.question === question.id)
		if (!question || !answer) return []
		return [{ id: question.id, text: question.text, answer: answer.answer, by: answer.by }]
	})
}

/** The result of a `failed` or `canceled` lot: the last transition's reason, time and position. */
function endedResultOf(params: { input: LotStateInput; report: LotStateReport }): EndedResultJson {
	const { input } = params
	const last = input.transitions.at(-1)
	const position = last?.position ?? null
	// canceled with no canceled transition: its hand-over's abandon is what ended it, at the marker's or entry's time
	if (params.report.state === 'canceled' && last?.state !== 'canceled')
		return {
			state: params.report.state,
			reason: RESULT_ABANDONED_REASON,
			at: input.abandonedMarker?.at ?? input.registryEntry?.written ?? last?.at ?? null,
			position,
		}
	return {
		state: params.report.state,
		reason: last?.cause.reason ?? null,
		at: last?.at ?? null,
		position,
	}
}

/**
 * The hand-over folder as `lot result` reads it: a folder whose records do not read (a missing file, or a
 * hand-edited `merges.json` that does not parse) is a reason, never thrown: the result shows no card for it.
 */
function readableHandoverOf(folder: string): HandoverFolder | string {
	try {
		return readHandoverFolder(folder)
	} catch (error) {
		if (!(error instanceof SyntaxError)) throw error
		return error.message
	}
}

/** The text form of a ready result: the hand-over, its show line, its run line while it is ready; the answers. */
function readyLines(ready: ReadyResultJson): string[] {
	const { handover } = ready
	const named = { name: ready.lot, state: ready.state }
	const head =
		handover === null
			? fill({ template: RESULT_TEXTS.noHandover, values: named })
			: 'simulated' in handover
				? fill({ template: RESULT_TEXTS.simulated, values: named })
				: fill({
						template: RESULT_TEXTS.handover,
						values: { ...named, handover: handover.name, handoverState: handover.state },
					})
	const commands =
		handover === null || 'simulated' in handover
			? []
			: [
					fill({ template: RESULT_TEXTS.show, values: { command: handover.show } }),
					...(ready.state === 'ready'
						? [fill({ template: RESULT_TEXTS.run, values: { command: handover.run } })]
						: []),
				]
	const answers = ready.questions.map((question) =>
		fill({
			template: RESULT_TEXTS.answered,
			values: {
				id: question.id,
				text: question.text,
				answer: question.answer,
				by: question.by,
			},
		}),
	)
	return [head, ...commands, ...answers]
}

/** The text form of a failed or canceled result: one line. */
function endedLine(params: { name: string; ended: EndedResultJson }): string {
	const { ended } = params
	return fill({
		template: RESULT_TEXTS.ended,
		values: {
			name: params.name,
			state: ended.state,
			at: ended.at ?? '',
			reason: ended.reason ?? '',
		},
	})
}

/** The text form of a lot still at work: its state, then each open question. */
function busyLines(params: { name: string; busy: BusyResultJson }): string[] {
	const { busy } = params
	return [
		fill({ template: RESULT_TEXTS.busy, values: { name: params.name, state: busy.state } }),
		...busy.questions.map((question) =>
			fill({
				template: RESULT_TEXTS.question,
				values: { id: question.id, text: question.text },
			}),
		),
	]
}

/**
 * `template` with each `{key}` replaced by its value in one pass: a value holding `{…}` (agent text) is never
 * replaced again.
 */
function fill(params: { template: string; values: Record<string, string> }): string {
	return params.template.replace(
		RESULT_PLACEHOLDER_PATTERN,
		(placeholder, key: string) => params.values[key] ?? placeholder,
	)
}
