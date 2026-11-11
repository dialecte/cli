/**
 * `dialecte plan next | check | mark`: what can start now in a plan's lot block, whether the block is valid, a
 * person's mark on a person entry (33N). Reads files only (no git process, no network); the one `vm_stat` of the
 * machine reading lives behind its seam; `plan mark` appends one line to the state folder.
 */
import { statSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { COMMAND_MAP } from '../lib/command-map/command-map.constants.ts'
import { readMachineLoad } from '../lib/heavy/machine-load.ts'
import { entryStates } from '../lib/plan/entry-state.ts'
import { readPlanBlock } from '../lib/plan/plan-block.ts'
import { readPlanHeavy } from '../lib/plan/plan-heavy.ts'
import { appendPlanMark, readPlanMarks } from '../lib/plan/plan-marks.ts'
import { LINE_BREAK_PATTERN, PLAN_MARKS_SEGMENTS } from '../lib/plan/plan.constants.ts'
import { proposePlan } from '../lib/plan/propose.ts'
import { readPlanFacts } from '../lib/plan/read-plan-facts.ts'
import { renderPlanNext } from '../lib/plan/render-plan-next.ts'
import { readArguments } from '../lib/review-rounds/round-arguments.ts'
import { stateFolder } from '../lib/store/state-folder.ts'
import {
	PLAN_CHECK_FLAGS,
	PLAN_COMMAND_NAME,
	PLAN_EXIT,
	PLAN_MARK_OPTIONS,
	PLAN_MARK_STATE,
	PLAN_NEXT_FLAGS,
	PLAN_VERBS,
} from './plan.constants.ts'

import type { CommandResult } from '../lib/command-result.types.ts'
import type { PlanBlock, PlanFault } from '../lib/plan/plan-block.types.ts'
import type { RoundArguments } from '../lib/review-rounds/review-rounds.types.ts'
import type { PlanSeams, RunPlanParams } from './plan.types.ts'

/** Runs `dialecte plan` in the current folder: an answer (exit 0 or 1) on stdout, a refusal (exit 2) on stderr. */
export async function run(argv: string[]): Promise<void> {
	const result = runPlan({ cwd: process.cwd(), argv })
	;(result.exitCode === PLAN_EXIT.refused ? console.error : console.log)(result.output)
	if (result.exitCode !== PLAN_EXIT.answered) process.exit(result.exitCode)
}

/**
 * `plan next <plan.md> [--json] [--all]`, `plan check <plan.md> [--json]`, `plan mark <plan.md> <id> done --by
 * <who> [--reason <text>]`: exit 0 answered (next: a lot or fix can start), 1 no lot can start, 2 usage, no block or
 * an invalid one, a repository that is not a git checkout, a mark refused.
 */
export function runPlan(params: RunPlanParams): CommandResult {
	const [verb, ...rest] = params.argv
	if (verb === PLAN_VERBS.next) return runNext({ ...params, argv: rest })
	if (verb === PLAN_VERBS.check) return runCheck({ ...params, argv: rest })
	if (verb === PLAN_VERBS.mark) return runMark({ ...params, argv: rest })
	return usageOf({ problem: verb === undefined ? 'a verb is needed' : `unknown verb ${verb}` })
}

/** `plan next`: the states, the proposals and the heavy advice of the plan's block. */
function runNext(params: RunPlanParams): CommandResult {
	const read = readArguments({ argv: params.argv, valueOptions: [], flags: PLAN_NEXT_FLAGS })
	if (typeof read === 'string') return usageOf({ problem: `next: ${read}` })
	if (read.words.length !== 1) return usageOf({ problem: 'next takes one plan file' })
	const plan = read.words[0]
	const json = read.flags.has('json')
	const loaded = loadBlock({ cwd: params.cwd, plan, verb: PLAN_VERBS.next, json })
	if ('refusal' in loaded) return loaded.refusal
	const seams: PlanSeams = params.seams ?? {}
	const { block, planPath } = loaded
	const facts = readPlanFacts({ block, planPath, stateLocation: seams.state })
	const states = entryStates({ block, facts })
	const machine = seams.machine ?? readMachineLoad()
	const heavy = readPlanHeavy({
		block,
		facts,
		states,
		machine,
		location: seams.state,
		check: seams.check,
	})
	return renderPlanNext({
		report: {
			plan,
			planPath,
			block,
			states,
			proposals: proposePlan({ block, facts, states, heavy }),
			heavy,
			machine,
			now: seams.now ?? new Date(),
			all: read.flags.has('all'),
		},
		json,
	})
}

/** `plan check`: one line when the block is valid, every fault otherwise. */
function runCheck(params: RunPlanParams): CommandResult {
	const read = readArguments({ argv: params.argv, valueOptions: [], flags: PLAN_CHECK_FLAGS })
	if (typeof read === 'string') return usageOf({ problem: `check: ${read}` })
	if (read.words.length !== 1) return usageOf({ problem: 'check takes one plan file' })
	const plan = read.words[0]
	const json = read.flags.has('json')
	const loaded = loadBlock({ cwd: params.cwd, plan, verb: PLAN_VERBS.check, json })
	if ('refusal' in loaded) return loaded.refusal
	const { block } = loaded
	const repositories = Object.keys(block.repositories)
	return {
		exitCode: PLAN_EXIT.answered,
		output: json
			? JSON.stringify({ plan, valid: true, faults: [] }, null, 2)
			: `${PLAN_COMMAND_NAME} check: ${plan} - valid (${String(block.lots.length)} entries, repositories ${repositories.join(', ')})`,
	}
}

/** `plan mark <plan.md> <id> done --by <who> [--reason <text>]`: a person entry only, once. */
function runMark(params: RunPlanParams): CommandResult {
	const read = readArguments({
		argv: params.argv,
		valueOptions: [PLAN_MARK_OPTIONS.by, PLAN_MARK_OPTIONS.reason],
	})
	if (typeof read === 'string') return usageOf({ problem: `mark: ${read}` })
	const [plan, id, state] = read.words
	if (read.words.length !== 3 || state !== PLAN_MARK_STATE)
		return usageOf({ problem: `mark takes a plan file, an id and ${PLAN_MARK_STATE}` })
	const optionFault = markOptionFaultOf({ read })
	if (optionFault !== undefined)
		return refusalOf({ text: `${PLAN_COMMAND_NAME} mark: ${optionFault}` })
	const loaded = loadBlock({ cwd: params.cwd, plan, verb: PLAN_VERBS.mark, json: false })
	if ('refusal' in loaded) return loaded.refusal
	const entry = loaded.block.lots.find((candidate) => candidate.id === id)
	if (entry === undefined)
		return refusalOf({ text: `${PLAN_COMMAND_NAME} mark: no entry ${id} in ${plan}` })
	if (entry.kind !== 'person')
		return refusalOf({
			text: `${PLAN_COMMAND_NAME} mark: ${id} is a ${entry.kind} entry; only a person entry takes a mark (its state comes from its records)`,
		})
	const location = params.seams?.state
	const by = read.values.get(PLAN_MARK_OPTIONS.by) as string
	if (readPlanMarks({ planPath: loaded.planPath, location }).some((mark) => mark.id === id))
		return {
			exitCode: PLAN_EXIT.answered,
			output: `${PLAN_COMMAND_NAME} mark: ${id} ${PLAN_MARK_STATE} - already recorded`,
		}
	try {
		appendPlanMark({
			planPath: loaded.planPath,
			id,
			by,
			reason: read.values.get(PLAN_MARK_OPTIONS.reason),
			location,
			now: params.seams?.now,
		})
	} catch (error) {
		return refusalOf({
			text: `${PLAN_COMMAND_NAME} mark: the marks file under ${join(stateFolder(location), ...PLAN_MARKS_SEGMENTS)} cannot be written: ${(error as Error).message}`,
		})
	}
	return {
		exitCode: PLAN_EXIT.answered,
		output: `${PLAN_COMMAND_NAME} mark: ${id} ${PLAN_MARK_STATE} - recorded (by ${by})`,
	}
}

/** What is wrong with `--by` and `--reason`: `--by` given, not empty, one line; `--reason` one line. */
function markOptionFaultOf(params: { read: RoundArguments }): string | undefined {
	const by = params.read.values.get(PLAN_MARK_OPTIONS.by)
	if (by === undefined || by.trim() === '') return '--by <who> is needed (not empty)'
	if (LINE_BREAK_PATTERN.test(by)) return '--by must be one line'
	const reason = params.read.values.get(PLAN_MARK_OPTIONS.reason)
	if (reason !== undefined && LINE_BREAK_PATTERN.test(reason)) return '--reason must be one line'
	return undefined
}

/** The plan's block and its absolute path, or the refusal: no plan file, no block, an invalid one. */
function loadBlock(params: {
	cwd: string
	plan: string
	verb: string
	json: boolean
}): { block: PlanBlock; planPath: string } | { refusal: CommandResult } {
	const planPath = resolve(params.cwd, params.plan)
	if (!isFile({ path: planPath }))
		return {
			refusal: faultsOf({
				...params,
				faults: [{ at: 'plan', detail: `${params.plan}: no such plan file` }],
			}),
		}
	const read = readPlanBlock({ planPath })
	if ('faults' in read) return { refusal: faultsOf({ ...params, faults: read.faults }) }
	return { block: read.block, planPath }
}

/** The refusal of a block: every fault, as text or as `{ plan, valid: false, faults }`; exit 2. */
function faultsOf(params: {
	plan: string
	verb: string
	json: boolean
	faults: PlanFault[]
}): CommandResult {
	const { plan, faults } = params
	if (params.json)
		return {
			exitCode: PLAN_EXIT.refused,
			output: JSON.stringify({ plan, valid: false, faults }, null, 2),
		}
	return refusalOf({
		text: [
			`${PLAN_COMMAND_NAME} ${params.verb}: ${plan} - ${String(faults.length)} fault${faults.length === 1 ? '' : 's'}`,
			...faults.map((fault) => `  ${fault.at}: ${fault.detail}`),
		].join('\n'),
	})
}

/** The usage of `plan` with what was wrong; exit 2. */
function usageOf(params: { problem: string }): CommandResult {
	return refusalOf({
		text: [
			`${PLAN_COMMAND_NAME}: ${params.problem}`,
			'usage:',
			...COMMAND_MAP.plan.usage.map((line) => `  ${line}`),
		].join('\n'),
	})
}

/** A refusal, exit 2. */
function refusalOf(params: { text: string }): CommandResult {
	return { exitCode: PLAN_EXIT.refused, output: params.text }
}

/** Whether the path is a file. */
function isFile(params: { path: string }): boolean {
	try {
		return statSync(params.path).isFile()
	} catch {
		return false
	}
}
