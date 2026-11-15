/**
 * Which of `gate --hook`'s steps a record answers: each step by the newest green record of the committed tree and
 * its lock that ran it as it is now (its step hash), any mode; a scoped step also by a run that checked everything
 * (recorded at the empty tree). When no step hash answers a test step, a green `--full` record of the whole key -
 * else a covering `--release` one - written by an older cli (no step hashes) answers the test steps while its whole key
 * still matches (in practice only with no lock: older clis keyed the installed lock, this one the tree's).
 */
import { findReusableRecord, originOfRecord } from '../gate-records/check-store.ts'
import { RELEASE_RECORD_MODE, SHORT_SHA_LENGTH } from '../gate-records/gate-records.constants.ts'
import { reusedResults } from '../gate-records/record-reuse.ts'
import { findStepAnswer, hashGateStep } from '../gate-records/step-reuse.ts'
import {
	GATE_HOOK_RELEASE_REUSED_LINE,
	GATE_HOOK_REUSED_LINE,
	GATE_HOOK_STEP_REUSED_LINE,
} from './gate-config.constants.ts'
import { listHookTestSteps } from './gate-config.ts'

import type { CheckKey, GateRecord, RecordOrigin } from '../gate-records/gate-records.types.ts'
import type { ModeCommandHashes } from '../gate-records/mode-command-hashes.types.ts'
import type { GateStep } from './gate-config.types.ts'
import type { StepResult } from './gate.types.ts'
import type { HookAnswerParams, HookAnswerPlace, HookAnswers } from './hook-gate.types.ts'

/** The hook steps a record answers, in list order, each with the run that really ran it and its line. */
export function answerHookSteps(params: HookAnswerParams): HookAnswers {
	const results: StepResult[] = []
	const origins = new Map<string, RecordOrigin>()
	const lines: string[] = []
	for (const step of params.steps) {
		const answer = findHookStepAnswer({ ...params, step })
		if (!answer) continue
		results.push(answer.result)
		origins.set(step.name, answer.origin)
		lines.push(renderStepReusedLine({ step: step.name, origin: answer.origin }))
	}
	const testSteps = listHookTestSteps(params.steps)
	const answeredTest = testSteps.some((step) => origins.has(step.name))
	const older = answeredTest ? undefined : findOlderCliAnswer(params)
	if (!older) return { results, origins, lines }
	const origin = { ...originOfRecord(older.record), mode: older.record.mode }
	const olderResults = reusedResults({ record: older.record, steps: testSteps }).filter((result) =>
		testSteps.some((step) => step.name === result.step.name),
	)
	for (const result of olderResults) origins.set(result.step.name, origin)
	const answered = [...results, ...olderResults]
	return {
		results: params.steps.flatMap((step) =>
			answered.filter((result) => result.step.name === step.name),
		),
		origins,
		lines: [...lines, older.line],
	}
}

/**
 * The answer of one step: its hash at the hook base, then, for a scoped step, at the empty tree; the result the
 * record holds, and the run that really ran it (the answering step's own origin when it was answered in turn).
 */
function findHookStepAnswer(
	params: HookAnswerParams & { step: GateStep },
): { result: StepResult; origin: RecordOrigin } | undefined {
	const { step } = params
	const stepHash = params.stepHashes.get(step.name)
	if (stepHash === undefined) return undefined
	const found =
		findStepAnswer({ ...placeOf(params), stepHash }) ??
		(step.scoped === true
			? findStepAnswer({
					...placeOf(params),
					stepHash: hashGateStep({ root: params.cwd, step, gateBase: params.emptyTree }),
				})
			: undefined)
	if (!found) return undefined
	const { record, recorded } = found
	const [result] = reusedResults({ record: { ...record, steps: [recorded] }, steps: [step] })
	return {
		result,
		origin: recorded.reused ?? { mode: record.mode, ...originOfRecord(record) },
	}
}

/** What `findStepAnswer` reads, from the hook's place. */
function placeOf(params: HookAnswerPlace): {
	root: string
	tree: string
	treeKey: HookAnswerPlace['treeKey']
	checkStore?: string
} {
	return {
		root: params.cwd,
		tree: params.tree,
		treeKey: params.treeKey,
		...(params.checkStore && { checkStore: params.checkStore }),
	}
}

/** `gate --hook: reused {step} from {mode} {at} (HEAD {head})`, naming the run that really ran the step. */
function renderStepReusedLine(params: { step: string; origin: RecordOrigin }): string {
	const { step, origin } = params
	return GATE_HOOK_STEP_REUSED_LINE.replace('{step}', step)
		.replace('{mode}', origin.mode ?? '')
		.replace('{at}', origin.at)
		.replace('{head}', origin.head.slice(0, SHORT_SHA_LENGTH))
}

/**
 * The green record of an older cli (no step hashes) answering the hook's test steps as a whole, with its line: a
 * `--full` record of the whole key, else a `--release` record of the same tree and install with the release
 * command hash when the release list covers `full`; undefined when none answers.
 */
function findOlderCliAnswer(
	params: HookAnswerPlace & { hashes: ModeCommandHashes },
): { line: string; record: GateRecord } | undefined {
	const { hashes } = params
	const key: CheckKey = { tree: params.tree, ...params.treeKey, commandHash: hashes.full }
	const full = findOlderCliRecord({ ...params, mode: 'full', key })
	if (full)
		return {
			line: renderOlderCliLine({ template: GATE_HOOK_REUSED_LINE, key, record: full }),
			record: full,
		}
	if (!hashes.releaseCoversFull) return undefined
	const release = findOlderCliRecord({
		...params,
		mode: RELEASE_RECORD_MODE,
		key: { ...key, commandHash: hashes.release },
	})
	return release
		? {
				line: renderOlderCliLine({ template: GATE_HOOK_RELEASE_REUSED_LINE, key, record: release }),
				record: release,
			}
		: undefined
}

/** The newest green record of `mode` and `key` when an older cli wrote it (none of its steps has a step hash). */
function findOlderCliRecord(
	params: HookAnswerPlace & { mode: GateRecord['mode']; key: CheckKey },
): GateRecord | undefined {
	const record = findReusableRecord({
		root: params.cwd,
		mode: params.mode,
		key: params.key,
		...(params.checkStore && { checkStore: params.checkStore }),
	})
	return record?.steps.every((step) => step.stepHash === undefined) ? record : undefined
}

/** The line of an older cli's record: the committed tree, then the time and short HEAD of the run it answers for. */
function renderOlderCliLine(params: {
	template: string
	key: CheckKey
	record: GateRecord
}): string {
	const { at, head } = originOfRecord(params.record)
	return params.template
		.replace('{tree}', params.key.tree.slice(0, SHORT_SHA_LENGTH))
		.replace('{at}', at)
		.replace('{head}', head.slice(0, SHORT_SHA_LENGTH))
}
