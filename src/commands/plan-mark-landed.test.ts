/**
 * `dialecte plan mark <plan.md> <id> done --landed <sha> --by <who> --reason <text>`: a lot or fix entry landed outside
 * the lot store (a lot landed by hand, or stopped after its work landed in another lot) reads done once a person names
 * the commit origin's base branch holds. A real repository with a bare origin: the commit is checked against origin.
 */
import { join } from 'node:path'

import { lotJson, personJson, writePlanWithBlock } from '../../test/plan-command-workspace.ts'
import { createPlanWorkspace, writeRegistryEntry } from '../../test/plan-facts.ts'
import {
	git,
	initializeRepository,
	temporaryFolder,
	writeFiles,
} from '../../test/scratch-repository.ts'
import { SCRATCH_GIT_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { readPlanMarks } from '../lib/plan/plan-marks.ts'
import { runPlan } from './plan.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { CommandWorkspace } from '../../test/plan-command-workspace.types.ts'
import type { PlanSeams, RunPlanParams } from './plan.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

const NOW = new Date('2026-11-17T10:00:00.000Z')
const QUIET = { load: 1, cores: 12, available: 8 * 1024 ** 3, source: 'vm_stat' } as const

/**
 * The plan workspace with `<root>/cli` a real repository on `main` pushed to a bare origin, one commit `landed` on
 * origin's main and one `local` on a branch origin never got; the plan holds A (a lot), F (a fix) and K0 (a person).
 */
function landedWorkspace() {
	const workspace = createPlanWorkspace()
	const cli = initializeRepository({ root: join(workspace.root, 'cli') })
	const origin = join(temporaryFolder('dialecte-plan-origin-'), 'origin.git')
	git({ root: workspace.root, args: ['init', '-q', '--bare', '-b', 'main', origin] })
	git({ root: cli, args: ['remote', 'add', 'origin', origin] })
	writeFiles({ root: cli, files: { 'src/a/a.ts': 'export const a = 1\n' } })
	git({ root: cli, args: ['add', '-A'] })
	git({ root: cli, args: ['commit', '-qm', 'feat(a): a, landed by hand'] })
	git({ root: cli, args: ['push', '-q', '-u', 'origin', 'main'] })
	const landed = git({ root: cli, args: ['rev-parse', 'HEAD'] }).trim()
	git({ root: cli, args: ['switch', '-q', '-c', 'feat/local'] })
	git({ root: cli, args: ['commit', '-q', '--allow-empty', '-m', 'feat: only here'] })
	const local = git({ root: cli, args: ['rev-parse', 'HEAD'] }).trim()
	git({ root: cli, args: ['switch', '-q', 'main'] })
	const commandWorkspace: CommandWorkspace = { ...workspace, cli, common: join(cli, '.git') }
	writePlanWithBlock({
		workspace: commandWorkspace,
		lots: [lotJson('A'), { ...lotJson('F'), kind: 'fix' }, personJson('K0')],
	})
	return { workspace: commandWorkspace, landed, local }
}

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

function marksOf(workspace: CommandWorkspace) {
	return readPlanMarks({ planPath: workspace.planPath, location: seamsOf(workspace).state })
}

/** `plan mark plan.md <id> done --landed <sha> --by tester --reason <reason>`. */
function landedMark(params: { id: string; sha: string; reason?: string }): string[] {
	return [
		'mark',
		'plan.md',
		params.id,
		'done',
		'--landed',
		params.sha,
		'--by',
		'tester',
		...(params.reason === undefined ? [] : ['--reason', params.reason]),
	]
}

describe(
	'plan mark --landed: a lot or fix entry landed outside the lot store',
	{ timeout: SCRATCH_GIT_CASE_TIMEOUT },
	() => {
		it('a lot entry, a commit origin main holds -> recorded with who, why and the commit; plan next reads it done by it', () => {
			const { workspace, landed } = landedWorkspace()

			const marked = runPlan(
				callOf(
					workspace,
					...landedMark({ id: 'A', sha: landed.slice(0, 8), reason: 'landed by hand (CI1)' }),
				),
			)

			expect(marked.exitCode).toBe(0)
			expect(marked.output).toContain('recorded')
			expect(marksOf(workspace)).toMatchObject([
				{
					id: 'A',
					state: 'done',
					by: 'tester',
					reason: 'landed by hand (CI1)',
					landed: { commit: landed, repository: 'cli' },
				},
			])
			const next = JSON.parse(runPlan(callOf(workspace, 'next', 'plan.md', '--json')).output) as {
				entries: Array<{
					id: string
					state: string
					realizedBy: { kind: string; name: string } | null
				}>
			}
			expect(next.entries.find((entry) => entry.id === 'A')).toMatchObject({
				state: 'done',
				realizedBy: { kind: 'landed', name: landed },
			})
		})

		it('a fix entry, a commit origin main holds -> recorded', () => {
			const { workspace, landed } = landedWorkspace()

			expect(
				runPlan(
					callOf(
						workspace,
						...landedMark({ id: 'F', sha: landed, reason: 'landed in another lot' }),
					),
				).exitCode,
			).toBe(0)
			expect(marksOf(workspace)).toMatchObject([{ id: 'F', landed: { commit: landed } }])
		})

		it('a lot entry its records already say done -> answered, nothing recorded', () => {
			const { workspace, landed } = landedWorkspace()
			writeRegistryEntry({
				common: workspace.common,
				name: '2026-11-04-feat-a',
				folder: join(workspace.root, 'handover-a'),
				branch: 'feat/a',
				state: 'committed',
			})

			const marked = runPlan(
				callOf(workspace, ...landedMark({ id: 'A', sha: landed, reason: 'landed' })),
			)

			expect(marked.exitCode).toBe(0)
			expect(marked.output).toContain('already done')
			expect(marksOf(workspace)).toEqual([])
		})

		type RefusalRow = {
			name: string
			argv: (shas: { landed: string; local: string }) => string[]
			fragment: string
		}

		const REFUSAL_ROWS: RefusalRow[] = [
			{
				name: 'a commit origin main does not hold (a local branch only)',
				argv: ({ local }) => landedMark({ id: 'A', sha: local, reason: 'not landed' }),
				fragment: 'origin/main',
			},
			{
				name: 'no such commit',
				argv: () => landedMark({ id: 'A', sha: 'deadbeef', reason: 'no commit' }),
				fragment: 'deadbeef',
			},
			{
				name: 'no --reason with --landed',
				argv: ({ landed }) => landedMark({ id: 'A', sha: landed }),
				fragment: '--reason',
			},
			{
				name: 'a person entry with --landed',
				argv: ({ landed }) => landedMark({ id: 'K0', sha: landed, reason: 'a person' }),
				fragment: 'person',
			},
			{
				name: 'a lot entry without --landed',
				argv: () => ['mark', 'plan.md', 'A', 'done', '--by', 'tester', '--reason', 'x'],
				fragment: '--landed',
			},
		]

		it.each(REFUSAL_ROWS)('$name -> exit 2, nothing recorded', ({ argv, fragment }) => {
			const { workspace, landed, local } = landedWorkspace()

			const marked = runPlan(callOf(workspace, ...argv({ landed, local })))

			expect({
				exitCode: marked.exitCode,
				says: marked.output.includes(fragment),
				marks: marksOf(workspace),
			}).toEqual({
				exitCode: 2,
				says: true,
				marks: [],
			})
		})
	},
)
