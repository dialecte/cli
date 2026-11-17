/**
 * `dialecte plan mark <plan.md> <id> superseded --by <who> --reason <text> [--replaced-by <id>...]`: an entry
 * replaced by others is closed by a mark; `plan next` reads it done and nothing waits on it.
 */
import {
	createCommandWorkspace,
	lotJson,
	writePlanWithBlock,
} from '../../test/plan-command-workspace.ts'
import { readPlanMarks } from '../lib/plan/plan-marks.ts'
import { runPlan } from './plan.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { CommandWorkspace } from '../../test/plan-command-workspace.types.ts'
import type { CommandResult } from '../lib/command-result.types.ts'
import type { PlanSeams, RunPlanParams } from './plan.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

const NOW = new Date('2026-11-17T10:00:00.000Z')
const QUIET = { load: 1, cores: 12, available: 8 * 1024 ** 3, source: 'vm_stat' } as const

function seamsOf(workspace: CommandWorkspace): PlanSeams {
	return {
		machine: QUIET,
		check: { isAlive: () => false, startTimeOf: () => undefined },
		state: { environment: { XDG_STATE_HOME: workspace.state } },
		now: NOW,
	}
}

function callOf(workspace: CommandWorkspace, ...argv: string[]): RunPlanParams {
	return { cwd: workspace.planFolder, argv, seams: seamsOf(workspace) }
}

/** What a case reads of a result: the view applied to it. */
function viewOf<View>(result: CommandResult, view: (result: CommandResult) => View): View {
	return view(result)
}

type NextJson = {
	counts: { done: number; ready: number; waiting: number }
	entries: Array<{ id: string; state: string; realizedBy: { kind: string; name: string } | null }>
	proposals: Array<{ id: string }>
}

/** A (replaced by A2 and A3), A2, A3, and B waiting for A. */
function writeSupersededPlan(workspace: CommandWorkspace): void {
	writePlanWithBlock({
		workspace,
		lots: [lotJson('A'), lotJson('A2'), lotJson('A3'), lotJson('B', { dependsOn: ['A'] })],
	})
}

function marksOf(workspace: CommandWorkspace) {
	return readPlanMarks({ planPath: workspace.planPath, location: seamsOf(workspace).state })
}

const SUPERSEDE = [
	'mark',
	'plan.md',
	'A',
	'superseded',
	'--by',
	'tester',
	'--reason',
	'split in two',
	'--replaced-by',
	'A2',
	'--replaced-by',
	'A3',
]

describe('plan mark superseded', () => {
	it('recorded: exit 0, one mark { state: superseded, replacedBy }', () => {
		const workspace = createCommandWorkspace()
		writeSupersededPlan(workspace)

		expect(
			viewOf(runPlan(callOf(workspace, ...SUPERSEDE)), (result) => ({
				exitCode: result.exitCode,
				recorded: /A superseded - recorded/.test(result.output),
				marks: marksOf(workspace),
			})),
		).toMatchObject({
			exitCode: 0,
			recorded: true,
			marks: [
				{
					id: 'A',
					state: 'superseded',
					by: 'tester',
					reason: 'split in two',
					replacedBy: ['A2', 'A3'],
					at: NOW.toISOString(),
				},
			],
		})
	})

	it('no --replaced-by: recorded with an empty replacedBy', () => {
		const workspace = createCommandWorkspace()
		writeSupersededPlan(workspace)

		expect(
			viewOf(
				runPlan(
					callOf(
						workspace,
						'mark',
						'plan.md',
						'A',
						'superseded',
						'--by',
						'tester',
						'--reason',
						'dropped',
					),
				),
				(result) => ({ exitCode: result.exitCode, marks: marksOf(workspace) }),
			),
		).toMatchObject({ exitCode: 0, marks: [{ id: 'A', state: 'superseded', replacedBy: [] }] })
	})

	it('again: already, exit 0, nothing added', () => {
		const workspace = createCommandWorkspace()
		writeSupersededPlan(workspace)
		expect(runPlan(callOf(workspace, ...SUPERSEDE)).exitCode).toBe(0)

		expect(
			viewOf(runPlan(callOf(workspace, ...SUPERSEDE)), (result) => ({
				exitCode: result.exitCode,
				already: /already/.test(result.output),
				marks: marksOf(workspace).length,
			})),
		).toEqual({ exitCode: 0, already: true, marks: 1 })
	})

	it('then plan next reads A done by superseded, B no longer waiting on it', () => {
		const workspace = createCommandWorkspace()
		writeSupersededPlan(workspace)
		expect(runPlan(callOf(workspace, ...SUPERSEDE)).exitCode).toBe(0)

		expect(
			viewOf(runPlan(callOf(workspace, 'next', 'plan.md', '--json')), (result) => {
				const json = JSON.parse(result.output) as NextJson
				return {
					a: json.entries.find((entry) => entry.id === 'A'),
					proposed: json.proposals.map((proposal) => proposal.id).sort(),
					counts: json.counts,
				}
			}),
		).toMatchObject({
			a: { state: 'done', realizedBy: { kind: 'superseded', name: 'tester' } },
			proposed: ['A2', 'A3', 'B'],
			counts: { done: 1, waiting: 0 },
		})
	})

	it('plan next --all lists A under done with what superseded it', () => {
		const workspace = createCommandWorkspace()
		writeSupersededPlan(workspace)
		expect(runPlan(callOf(workspace, ...SUPERSEDE)).exitCode).toBe(0)

		expect(runPlan(callOf(workspace, 'next', 'plan.md', '--all')).output).toContain(
			'A (superseded by A2, A3)',
		)
	})

	type RefusalRow = { name: string; argv: string[]; fragment: string }

	const REFUSAL_ROWS: RefusalRow[] = [
		{
			name: 'no --reason',
			argv: ['mark', 'plan.md', 'A', 'superseded', '--by', 'tester'],
			fragment: 'superseded needs --reason',
		},
		{
			name: 'a --replaced-by id the block does not hold',
			argv: [...SUPERSEDE.slice(0, 8), '--replaced-by', 'Nope1'],
			fragment: 'Nope1',
		},
		{
			name: 'the entry replaced by itself',
			argv: [...SUPERSEDE.slice(0, 8), '--replaced-by', 'A'],
			fragment: 'itself',
		},
		{
			name: '--landed with superseded',
			argv: [...SUPERSEDE, '--landed', 'abc1234'],
			fragment: '--landed is not for superseded',
		},
		{
			name: '--replaced-by with done',
			argv: ['mark', 'plan.md', 'A', 'done', '--by', 'tester', '--replaced-by', 'A2'],
			fragment: '--replaced-by is for superseded',
		},
	]

	it.each(REFUSAL_ROWS)('$name -> exit 2, nothing recorded', ({ argv, fragment }) => {
		const workspace = createCommandWorkspace()
		writeSupersededPlan(workspace)

		expect(
			viewOf(runPlan(callOf(workspace, ...argv)), (result) => ({
				exitCode: result.exitCode,
				says: result.output.includes(fragment),
				marks: marksOf(workspace),
			})),
		).toEqual({ exitCode: 2, says: true, marks: [] })
	})
})
