/**
 * `dialecte plan check <plan.md>` and `dialecte plan mark <plan.md> <id> done --by <who>` (33N section 3, case 23):
 * the block's faults all at once, and a person's mark on a person entry, per machine, in the state folder.
 */
import {
	createCommandWorkspace,
	lotJson,
	personJson,
	writePlanWithBlock,
} from '../../test/plan-command-workspace.ts'
import { writeRecordFile } from '../../test/store-records.ts'
import { readPlanMarks } from '../lib/plan/plan-marks.ts'
import { runPlan } from './plan.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { CommandWorkspace } from '../../test/plan-command-workspace.types.ts'
import type { CommandResult } from '../lib/command-result.types.ts'
import type { PlanSeams, RunPlanParams } from './plan.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

const NOW = new Date('2026-11-10T10:06:30.000Z')
const QUIET = { load: 1, cores: 12, available: 8 * 1024 ** 3, source: 'vm_stat' } as const

function seamsOf(workspace: CommandWorkspace): PlanSeams {
	return {
		machine: QUIET,
		check: { isAlive: () => false, startTimeOf: () => undefined },
		state: { environment: { XDG_STATE_HOME: workspace.state } },
		now: NOW,
	}
}

/**
 * The arguments of `runPlan` for `plan <argv>`: every case calls `runPlan` itself, inside its `expect`, so a stub's
 * refusal is read as an assertion failure.
 */
function callOf(workspace: CommandWorkspace, ...argv: string[]): RunPlanParams {
	return { cwd: workspace.planFolder, argv, seams: seamsOf(workspace) }
}

/** What a case reads of a result: the view applied to it. */
function viewOf<View>(result: CommandResult, view: (result: CommandResult) => View): View {
	return view(result)
}

/** A result's JSON output. */
function jsonOf<Json>(result: CommandResult): Json {
	return JSON.parse(result.output) as Json
}

/** A (a lot) and B (a lot waiting for the person's K0) and K0 (a person entry). */
function writeMarkPlan(workspace: CommandWorkspace): void {
	writePlanWithBlock({
		workspace,
		lots: [lotJson('A'), personJson('K0'), lotJson('B', { dependsOn: ['K0'] })],
	})
}

function marksOf(workspace: CommandWorkspace) {
	return readPlanMarks({ planPath: workspace.planPath, location: seamsOf(workspace).state })
}

describe('plan check', () => {
	it('a valid block: exit 0 and one line naming the plan', () => {
		const workspace = createCommandWorkspace()
		writeMarkPlan(workspace)

		expect(
			viewOf(runPlan(callOf(workspace, 'check', 'plan.md')), (result) => ({
				exitCode: result.exitCode,
				oneLine: !result.output.trimEnd().includes('\n'),
				line: /^plan check: plan\.md - valid\b/.test(result.output),
			})),
		).toEqual({ exitCode: 0, oneLine: true, line: true })
	})

	it('--json valid: { plan, valid, faults }', () => {
		const workspace = createCommandWorkspace()
		writeMarkPlan(workspace)

		expect(
			viewOf(runPlan(callOf(workspace, 'check', 'plan.md', '--json')), (result) => ({
				exitCode: result.exitCode,
				...jsonOf<object>(result),
			})),
		).toMatchObject({ exitCode: 0, plan: 'plan.md', valid: true, faults: [] })
	})

	type FaultRow = {
		name: string
		setup: (workspace: CommandWorkspace) => void
		fragments: string[]
	}

	const FAULT_ROWS: FaultRow[] = [
		{
			name: 'two faults in two entries: both listed',
			setup: (workspace) => {
				writePlanWithBlock({
					workspace,
					lots: [lotJson('A', { dependOn: ['B'] }), lotJson('B', { kind: 'epic' })],
				})
			},
			fragments: ['lots[0].dependOn', 'lots[1].kind'],
		},
		{
			name: 'a repository that is not a git checkout, and a fault in an entry: both listed',
			setup: (workspace) => {
				writeRecordFile({ folder: workspace.root, name: 'plain/README.md', text: 'no git here\n' })
				writePlanWithBlock({
					workspace,
					lots: [lotJson('A', { kind: 'epic' })],
					repositories: { cli: '../plain' },
				})
			},
			fragments: ['repositories.cli', 'lots[0].kind'],
		},
		{
			name: 'two repository names resolving to one common folder (case 32)',
			setup: (workspace) => {
				writePlanWithBlock({
					workspace,
					lots: [lotJson('A')],
					repositories: { cli: '../cli', core: '../cli' },
				})
			},
			fragments: ['repositories.core'],
		},
		{
			name: 'no block: the two forms named',
			setup: (workspace) => {
				writeRecordFile({ folder: workspace.planFolder, name: 'plan.md', text: '# Plan\n' })
			},
			fragments: ['json dialecte-lots', 'plan.lots.json'],
		},
	]

	it.each(FAULT_ROWS)('$name -> exit 2, every fault in the text', ({ setup, fragments }) => {
		const workspace = createCommandWorkspace()
		setup(workspace)

		expect(
			viewOf(runPlan(callOf(workspace, 'check', 'plan.md')), (result) => ({
				exitCode: result.exitCode,
				missing: fragments.filter((fragment) => !result.output.includes(fragment)),
			})),
		).toEqual({ exitCode: 2, missing: [] })
	})

	it('--json with faults: valid false, each fault { at, detail }', () => {
		const workspace = createCommandWorkspace()
		writePlanWithBlock({
			workspace,
			lots: [lotJson('A', { dependOn: ['B'] }), lotJson('B', { kind: 'epic' })],
		})

		expect(
			viewOf(runPlan(callOf(workspace, 'check', 'plan.md', '--json')), (result) => {
				const json = jsonOf<{
					valid: boolean
					faults: Array<{ at: string; detail: string }>
				}>(result)
				return {
					exitCode: result.exitCode,
					valid: json.valid,
					ats: json.faults.map((fault) => fault.at).sort(),
					details: json.faults.every((fault) => fault.detail.length > 0),
				}
			}),
		).toEqual({
			exitCode: 2,
			valid: false,
			ats: ['lots[0].dependOn', 'lots[1].kind'],
			details: true,
		})
	})

	it('no plan given: the usage, exit 2', () => {
		const workspace = createCommandWorkspace()

		expect(
			viewOf(runPlan(callOf(workspace, 'check')), (result) => ({
				exitCode: result.exitCode,
				usage: result.output.includes('plan check <plan.md>'),
			})),
		).toEqual({ exitCode: 2, usage: true })
	})
})

/** The result of a call, or what it threw: a throw out of `runPlan` fails the case on its assertion. */
function outcomeOf(call: RunPlanParams): CommandResult | { threw: string } {
	try {
		return runPlan(call)
	} catch (error) {
		return { threw: (error as Error).message }
	}
}

describe('plan mark: a person entry only', () => {
	const MARK = ['mark', 'plan.md', 'K0', 'done', '--by', 'tester', '--reason', 'done on paper']

	it('recorded: exit 0, one mark in the state folder with who, why and when', () => {
		const workspace = createCommandWorkspace()
		writeMarkPlan(workspace)

		expect(
			viewOf(runPlan(callOf(workspace, ...MARK)), (result) => ({
				exitCode: result.exitCode,
				recorded: /recorded/.test(result.output),
				marks: marksOf(workspace),
			})),
		).toMatchObject({
			exitCode: 0,
			recorded: true,
			marks: [
				{ id: 'K0', state: 'done', by: 'tester', reason: 'done on paper', at: NOW.toISOString() },
			],
		})
	})

	it('again: already, exit 0, nothing added', () => {
		const workspace = createCommandWorkspace()
		writeMarkPlan(workspace)
		expect(runPlan(callOf(workspace, ...MARK)).exitCode).toBe(0)

		expect(
			viewOf(runPlan(callOf(workspace, ...MARK)), (result) => ({
				exitCode: result.exitCode,
				already: /already/.test(result.output),
				marks: marksOf(workspace).length,
			})),
		).toEqual({ exitCode: 0, already: true, marks: 1 })
	})

	it('no reason: recorded with none', () => {
		const workspace = createCommandWorkspace()
		writeMarkPlan(workspace)

		expect(
			viewOf(
				runPlan(callOf(workspace, 'mark', 'plan.md', 'K0', 'done', '--by', 'tester')),
				(result) => ({
					exitCode: result.exitCode,
					marks: marksOf(workspace),
				}),
			),
		).toMatchObject({ exitCode: 0, marks: [{ id: 'K0', by: 'tester', reason: null }] })
	})

	it('then plan next shows the person entry done by its mark, and what waited for it ready', () => {
		const workspace = createCommandWorkspace()
		writeMarkPlan(workspace)
		expect(
			jsonOf<{ proposals: Array<{ id: string }> }>(
				runPlan(callOf(workspace, 'next', 'plan.md', '--json')),
			).proposals.map((proposal) => proposal.id),
		).toEqual(['A'])
		expect(runPlan(callOf(workspace, ...MARK)).exitCode).toBe(0)

		expect(
			viewOf(runPlan(callOf(workspace, 'next', 'plan.md', '--json')), (result) => {
				const json = jsonOf<{
					counts: unknown
					entries: Array<{ id: string; state: string; realizedBy: { kind: string } | null }>
					proposals: Array<{ id: string }>
				}>(result)
				return {
					k0: json.entries.find((entry) => entry.id === 'K0'),
					proposed: json.proposals.map((proposal) => proposal.id),
					counts: json.counts,
				}
			}),
		).toMatchObject({
			k0: { state: 'done', realizedBy: { kind: 'mark' } },
			proposed: ['A', 'B'],
			counts: { done: 1, ready: 2, waiting: 0 },
		})
	})

	it('the text of plan next stops asking for the mark', () => {
		const workspace = createCommandWorkspace()
		writeMarkPlan(workspace)
		expect(runPlan(callOf(workspace, ...MARK)).exitCode).toBe(0)

		expect(runPlan(callOf(workspace, 'next', 'plan.md')).output).not.toContain('ready, no mark')
	})

	type RefusalRow = { name: string; argv: string[]; fragment: string }

	const REFUSAL_ROWS: RefusalRow[] = [
		{
			name: 'a lot entry: its state comes from records (case 23)',
			argv: ['mark', 'plan.md', 'A', 'done', '--by', 'tester'],
			fragment: 'person',
		},
		{
			name: 'an unknown id, named',
			argv: ['mark', 'plan.md', 'Nope1', 'done', '--by', 'tester'],
			fragment: 'Nope1',
		},
		{ name: 'no --by', argv: ['mark', 'plan.md', 'K0', 'done'], fragment: '--by' },
		{
			name: 'a state other than done',
			argv: ['mark', 'plan.md', 'K0', 'open', '--by', 'tester'],
			fragment: 'plan mark <plan.md>',
		},
		{ name: 'no id', argv: ['mark', 'plan.md'], fragment: 'plan mark <plan.md>' },
		{
			name: 'an empty --by',
			argv: ['mark', 'plan.md', 'K0', 'done', '--by', ''],
			fragment: '--by',
		},
	]

	it.each(REFUSAL_ROWS)('$name -> exit 2, nothing recorded', ({ argv, fragment }) => {
		const workspace = createCommandWorkspace()
		writeMarkPlan(workspace)

		expect(
			viewOf(runPlan(callOf(workspace, ...argv)), (result) => ({
				exitCode: result.exitCode,
				says: result.output.includes(fragment),
				marks: marksOf(workspace),
			})),
		).toEqual({ exitCode: 2, says: true, marks: [] })
	})

	it('a plan with no block: exit 2, nothing recorded', () => {
		const workspace = createCommandWorkspace()
		writeRecordFile({ folder: workspace.planFolder, name: 'plan.md', text: '# Plan\n' })

		expect(
			viewOf(runPlan(callOf(workspace, ...MARK)), (result) => ({
				exitCode: result.exitCode,
				marks: marksOf(workspace),
			})),
		).toEqual({ exitCode: 2, marks: [] })
	})

	it('<state>/dialecte/plans a file: exit 2 with the reason, nothing written, no throw', () => {
		const workspace = createCommandWorkspace()
		writeMarkPlan(workspace)
		const plans = writeRecordFile({
			folder: `${workspace.state}/dialecte`,
			name: 'plans',
			text: 'not a folder',
		})
		const outcome = outcomeOf(callOf(workspace, ...MARK))

		expect(
			'threw' in outcome
				? outcome
				: {
						exitCode: outcome.exitCode,
						says: outcome.output.includes(plans) && /cannot be written/.test(outcome.output),
						marks: marksOf(workspace),
					},
		).toEqual({ exitCode: 2, says: true, marks: [] })
	})
})
