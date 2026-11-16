/**
 * `dialecte plan mark <plan.md> <id> done --landed <sha> --by <who> --reason <text>`: a lot or fix entry landed outside
 * the lot store (a lot landed by hand, or stopped after its work landed in another lot) reads done once a person names
 * the commit origin's base branch holds. A real repository with a bare origin: the commit is checked against origin.
 */
import { join } from 'node:path'

import { lotJson, personJson, writePlanWithBlock } from '../../test/plan-command-workspace.ts'
import { createPlanWorkspace, writeRegistryEntry } from '../../test/plan-facts.ts'
import {
	cloneRepository,
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

/** `<root>/<name>`, a real repository on `main` with `files` committed as `message` and pushed to a bare origin. */
function repositoryWithOrigin(params: {
	root: string
	name: string
	files: Record<string, string>
	message: string
}): { path: string; landed: string } {
	const path = initializeRepository({ root: join(params.root, params.name) })
	const origin = join(temporaryFolder('dialecte-plan-origin-'), 'origin.git')
	git({ root: params.root, args: ['init', '-q', '--bare', '-b', 'main', origin] })
	git({ root: path, args: ['remote', 'add', 'origin', origin] })
	writeFiles({ root: path, files: params.files })
	git({ root: path, args: ['add', '-A'] })
	git({ root: path, args: ['commit', '-qm', params.message] })
	git({ root: path, args: ['push', '-q', '-u', 'origin', 'main'] })
	return { path, landed: git({ root: path, args: ['rev-parse', 'HEAD'] }).trim() }
}

/**
 * The plan workspace with `<root>/cli` and `<root>/core` real repositories pushed to bare origins. In `cli`: `landed`
 * (src/a/) and `unrelated` (README only) on origin's main, `local` on a branch origin never got. In `core`: `coreLanded`
 * (src/m/). The plan holds A (a lot, cli src/a/), F (a fix, cli src/a/), M (a lot over cli src/a/ and core src/m/) and
 * K0 (a person).
 */
function landedWorkspace() {
	const workspace = createPlanWorkspace()
	const cli = repositoryWithOrigin({
		root: workspace.root,
		name: 'cli',
		files: { 'src/a/a.ts': 'export const a = 1\n' },
		message: 'feat(a): a, landed by hand',
	})
	const core = repositoryWithOrigin({
		root: workspace.root,
		name: 'core',
		files: { 'src/m/m.ts': 'export const m = 1\n' },
		message: 'feat(m): m, landed by hand',
	})
	writeFiles({ root: cli.path, files: { 'README.md': 'readme\n' } })
	git({ root: cli.path, args: ['add', '-A'] })
	git({ root: cli.path, args: ['commit', '-qm', 'docs: unrelated'] })
	git({ root: cli.path, args: ['push', '-q', 'origin', 'main'] })
	const unrelated = git({ root: cli.path, args: ['rev-parse', 'HEAD'] }).trim()
	git({ root: cli.path, args: ['switch', '-q', '-c', 'feat/local'] })
	git({ root: cli.path, args: ['commit', '-q', '--allow-empty', '-m', 'feat: only here'] })
	const local = git({ root: cli.path, args: ['rev-parse', 'HEAD'] }).trim()
	git({ root: cli.path, args: ['switch', '-q', 'main'] })
	const commandWorkspace: CommandWorkspace = {
		...workspace,
		cli: cli.path,
		common: join(cli.path, '.git'),
	}
	writePlanWithBlock({
		workspace: commandWorkspace,
		repositories: { cli: '../cli', core: '../core' },
		lots: [
			lotJson('A'),
			{ ...lotJson('F'), kind: 'fix', scope: { cli: ['src/a/'] } },
			{ ...lotJson('M'), scope: { cli: ['src/a/'], core: ['src/m/'] } },
			personJson('K0'),
		],
	})
	return {
		workspace: commandWorkspace,
		landed: cli.landed,
		unrelated,
		local,
		coreLanded: core.landed,
		cliPath: cli.path,
	}
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
					landed: [{ commit: landed, repository: 'cli' }],
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
			expect(marksOf(workspace)).toMatchObject([{ id: 'F', landed: [{ commit: landed }] }])
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

		it('a commit pushed to origin by someone else since the last fetch -> origin fetched first: recorded', () => {
			const { workspace, cliPath } = landedWorkspace()
			const other = join(temporaryFolder('dialecte-plan-other-'), 'other')
			const origin = git({ root: cliPath, args: ['remote', 'get-url', 'origin'] }).trim()
			// the scratch identity: a CI machine has no git identity of its own
			cloneRepository({ origin, into: other })
			writeFiles({ root: other, files: { 'src/a/b.ts': 'export const b = 1\n' } })
			git({ root: other, args: ['add', '-A'] })
			git({ root: other, args: ['commit', '-qm', 'feat(a): b, by a colleague'] })
			git({ root: other, args: ['push', '-q', 'origin', 'main'] })
			const pushed = git({ root: other, args: ['rev-parse', 'HEAD'] }).trim()

			expect(
				runPlan(
					callOf(workspace, ...landedMark({ id: 'A', sha: pushed, reason: 'by a colleague' })),
				).exitCode,
			).toBe(0)
			expect(marksOf(workspace)).toMatchObject([{ id: 'A', landed: [{ commit: pushed }] }])
		})

		it('an entry over two repositories, one commit per repository named -> recorded with both', () => {
			const { workspace, landed, coreLanded } = landedWorkspace()

			const marked = runPlan(
				callOf(
					workspace,
					...['mark', 'plan.md', 'M', 'done', '--landed', `cli:${landed}`],
					...['--landed', `core:${coreLanded}`, '--by', 'tester', '--reason', 'landed by hand'],
				),
			)

			expect(marked.exitCode).toBe(0)
			expect(marksOf(workspace)).toMatchObject([
				{
					id: 'M',
					landed: [
						{ commit: landed, repository: 'cli' },
						{ commit: coreLanded, repository: 'core' },
					],
				},
			])
		})

		type RefusalRow = {
			name: string
			argv: (shas: {
				landed: string
				local: string
				unrelated: string
				coreLanded: string
			}) => string[]
			fragment: string
		}

		const REFUSAL_ROWS: RefusalRow[] = [
			{
				name: 'a commit origin main does not hold (a local branch only)',
				argv: ({ local }) => landedMark({ id: 'A', sha: local, reason: 'not landed' }),
				fragment: 'origin/main',
			},
			{
				name: 'a commit on origin main touching none of the entry scope (an unrelated one)',
				argv: ({ unrelated }) => landedMark({ id: 'A', sha: unrelated, reason: 'not this one' }),
				fragment: 'touches none of src/a',
			},
			{
				name: 'an entry over two repositories, one commit given',
				argv: ({ landed }) => landedMark({ id: 'M', sha: landed, reason: 'half of it' }),
				fragment: 'core',
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
			const { workspace, landed, local, unrelated, coreLanded } = landedWorkspace()

			const marked = runPlan(callOf(workspace, ...argv({ landed, local, unrelated, coreLanded })))

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
