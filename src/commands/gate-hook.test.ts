/**
 * `gate --hook`: the test steps of `gate --full` for a commit hook, answered from a green `gate --full` record
 * of the tree being committed (the index's), else run. Counting steps prove whether a step ran.
 */
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { FAKE_VITEST } from '../../test/fake-vitest.constants.ts'
import {
	HOOK_GREEN_LINE,
	HOOK_MODE_REFUSAL,
	NOT_A_HOOK_STEP_LINE,
	NO_TEST_STEP_LINE,
	REPOSITORY_CLI_PATH,
	RUN_STEP_WITH_SUMMARY,
} from '../../test/gate-hook.constants.ts'
import {
	createHookPackage,
	createIndexFile,
	hookStepsOf,
	indexTreeOf,
	packageFilesOf,
	readFullRecord,
	reuseLineOf,
	runningLineOf,
} from '../../test/gate-hook.ts'
import { readRecordFile } from '../../test/gate-records.ts'
import {
	FAST_RECORD_FILE,
	FULL_RECORD_FILE,
	HOOK_RECORD_FILE,
	SCRATCH_REPOSITORY_TIMEOUT,
} from '../../test/scratch-checks.constants.ts'
import {
	countingStep,
	countRuns,
	createCounter,
	createGatePackage,
	runGateIn,
	seedFullGate,
} from '../../test/scratch-checks.ts'
import {
	createScratchRepository,
	git,
	initializeRepository,
	temporaryFolder,
	writeFiles,
} from '../../test/scratch-repository.ts'
import { readTreeRecords } from '../lib/gate-records/check-store.ts'
import { readStepCounts } from '../lib/gate/step-counts.ts'
import { HANDOVER_LOCK_FILE } from '../lib/handover/handover.constants.ts'
import { runGate } from './gate.ts'

import { describe, expect, it } from 'vitest'

import type { HookPackage, RunInsteadCase } from '../../test/gate-hook.types.ts'
import type { LiveOutput } from '../lib/progress/step-progress.types.ts'

/** A change staged in the worktree's own index. */
function stageChange(root: string): void {
	writeFiles({ root, files: { 'src/a.ts': 'export const staged = 1\n' } })
	git({ root, args: ['add', '--', 'src/a.ts'] })
}

describe(
	'gate --hook: a green gate --full of the committed tree answers',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it('a green gate --full of this tree → no step runs, exit 0, the one reuse line naming the record; the store is unchanged', async () => {
			const { root, testCounter, checkCounter } = createHookPackage()
			await seedFullGate(root)
			const record = readFullRecord(root)
			const tree = indexTreeOf({ root })

			const result = await runGateIn({ cwd: root, argv: ['--hook'] })

			expect(result).toEqual({ exitCode: 0, output: reuseLineOf({ tree, record }) })
			expect([countRuns(testCounter), countRuns(checkCounter)]).toEqual([1, 1])
			expect(readTreeRecords({ root, tree })).toEqual([record])
		})

		it('the working files changed after the gate, the index did not → still answered: the index is what is committed', async () => {
			const { root, testCounter } = createHookPackage()
			await seedFullGate(root)
			const record = readFullRecord(root)
			const tree = indexTreeOf({ root })
			writeFiles({ root, files: { 'src/a.ts': 'export const unstaged = 1\n' } })

			const result = await runGateIn({ cwd: root, argv: ['--hook'] })

			expect(result).toEqual({ exitCode: 0, output: reuseLineOf({ tree, record }) })
			expect(countRuns(testCounter)).toBe(1)
		})

		it('a hand-over holds the repository → the hook answers all the same', async () => {
			const { root, testCounter } = createHookPackage()
			await seedFullGate(root)
			const record = readFullRecord(root)
			const tree = indexTreeOf({ root })
			writeFileSync(join(root, '.git', HANDOVER_LOCK_FILE), '/plans/commit.sh\n')

			const result = await runGateIn({ cwd: root, argv: ['--hook'] })

			expect(result).toEqual({ exitCode: 0, output: reuseLineOf({ tree, record }) })
			expect(countRuns(testCounter)).toBe(1)
		})

		it('--no-reuse → the test step runs whatever the store holds', async () => {
			const { root, testCounter, checkCounter } = createHookPackage()
			await seedFullGate(root)

			const result = await runGateIn({ cwd: root, argv: ['--hook', '--no-reuse'] })

			expect(result.exitCode).toBe(0)
			expect(result.output).not.toContain('reused from')
			expect(result.output.split('\n').at(-1)).toBe(HOOK_GREEN_LINE)
			expect([countRuns(testCounter), countRuns(checkCounter)]).toEqual([2, 1])
		})
	},
)

describe(
	'gate --hook: the key is the tree of the index being committed',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it('the index file given names HEAD, the worktree index holds a staged change → answered from the given index; without it the tests run', async () => {
			const { root, testCounter } = createHookPackage()
			await seedFullGate(root)
			const record = readFullRecord(root)
			const headTree = indexTreeOf({ root })
			const alternative = join(temporaryFolder('dialecte-index-'), 'index')
			createIndexFile({ root, path: alternative })
			stageChange(root)

			const given = await runGateIn({ cwd: root, argv: ['--hook'], indexFile: alternative })
			const countAfterGiven = countRuns(testCounter)
			const own = await runGateIn({ cwd: root, argv: ['--hook'] })

			expect(given).toEqual({ exitCode: 0, output: reuseLineOf({ tree: headTree, record }) })
			expect(countAfterGiven).toBe(1)
			expect(own.output.split('\n')[0]).toBe(runningLineOf(indexTreeOf({ root })))
			expect(own.output.split('\n')[0]).toContain('no green gate --full or --release of tree')
			expect(countRuns(testCounter)).toBe(2)
		})

		it('a relative index file is resolved against the folder the hook runs in', async () => {
			const { root, testCounter } = createHookPackage()
			await seedFullGate(root)
			const record = readFullRecord(root)
			const headTree = indexTreeOf({ root })
			createIndexFile({ root, path: 'scratch.index' })
			stageChange(root)

			const result = await runGateIn({ cwd: root, argv: ['--hook'], indexFile: 'scratch.index' })

			expect(result).toEqual({ exitCode: 0, output: reuseLineOf({ tree: headTree, record }) })
			expect(countRuns(testCounter)).toBe(1)
		})

		it('a merge in progress whose tree is the gated tip tree → answered from the store, no step runs', async () => {
			const { root, testCounter } = createHookPackage()
			git({ root, args: ['checkout', '-q', '-b', 'feat/x'] })
			writeFiles({ root, files: { 'src/b.ts': 'export {}\n' } })
			git({ root, args: ['add', '--', 'src/b.ts'] })
			git({ root, args: ['commit', '-q', '-m', 'feat: b'] })
			await seedFullGate(root)
			const record = readFullRecord(root)
			const tipTree = git({ root, args: ['rev-parse', 'feat/x^{tree}'] }).trim()
			git({ root, args: ['checkout', '-q', 'main'] })
			git({ root, args: ['merge', '-q', '--no-ff', '--no-commit', 'feat/x'] })

			const result = await runGateIn({ cwd: root, argv: ['--hook'] })

			expect(indexTreeOf({ root })).toBe(tipTree)
			expect(result).toEqual({ exitCode: 0, output: reuseLineOf({ tree: tipTree, record }) })
			expect(countRuns(testCounter)).toBe(1)
		})

		it('the cli process started with GIT_INDEX_FILE relative → resolved against its folder, the gated tree answers', async () => {
			const { root, testCounter } = createHookPackage()
			await seedFullGate(root)
			const record = readFullRecord(root)
			const headTree = indexTreeOf({ root })
			createIndexFile({ root, path: 'scratch.index' })
			stageChange(root)

			const result = spawnSync('node', [REPOSITORY_CLI_PATH, 'gate', '--hook'], {
				cwd: root,
				encoding: 'utf8',
				env: { ...process.env, GIT_INDEX_FILE: 'scratch.index' },
			})

			expect(result.status).toBe(0)
			expect(result.stdout).toContain(reuseLineOf({ tree: headTree, record }))
			expect(countRuns(testCounter)).toBe(1)
		})
	},
)

const RUN_INSTEAD: RunInsteadCase[] = [
	{
		name: 'no record at all',
		setup: async () => undefined,
	},
	{
		name: 'a failed gate --full of the same state',
		requiresMissing: true,
		setup: async ({ root, requires }) => {
			const failed = await runGateIn({ cwd: root, argv: ['--full'] })
			expect(failed.exitCode).toBe(1)
			writeFileSync(requires, '')
		},
	},
	{
		name: 'a gate --fast of the same state (same steps, another mode)',
		setup: async ({ root }) => {
			const fast = await runGateIn({ cwd: root, argv: [] })
			expect(fast.exitCode).toBe(0)
		},
	},
	{
		name: 'the install changed since the gate (another lockHash)',
		setup: async ({ root }) => {
			await seedFullGate(root)
			writeFiles({ root, files: { 'node_modules/.package-lock.json': '{"packages":{}}\n' } })
		},
	},
	{
		name: 'a linked dependency changed since the gate',
		linked: true,
		setup: async ({ root }) => {
			await seedFullGate(root)
			writeFiles({ root: join(root, '..', 'dep'), files: { 'lib/a.js': 'one, and more\n' } })
		},
	},
	{
		name: 'the full steps changed since the gate (another command hash, the tree the same)',
		setup: async ({ root, checkCounter, testCounter, requires }) => {
			await seedFullGate(root)
			const steps = hookStepsOf({ checkCounter, testCounter, requires }).map((step) =>
				step.name === 'tests' ? { ...step, run: `${step.run} && true` } : step,
			)
			writeFiles({ root, files: { 'package.json': packageFilesOf({ steps })['package.json'] } })
		},
	},
	{
		name: "only the check step's command changed since the gate (the command hash covers every full step)",
		setup: async ({ root, checkCounter, testCounter, requires }) => {
			await seedFullGate(root)
			const steps = hookStepsOf({ checkCounter, testCounter, requires }).map((step) =>
				step.name === 'check' ? { ...step, run: `${step.run} && true` } : step,
			)
			writeFiles({ root, files: { 'package.json': packageFilesOf({ steps })['package.json'] } })
		},
	},
	{
		name: 'a change staged after the gate (another tree)',
		setup: async ({ root }) => {
			await seedFullGate(root)
			stageChange(root)
		},
	},
	{
		name: 'a gate of the working files, the index holds another tree',
		setup: async ({ root }) => {
			writeFiles({ root, files: { 'src/a.ts': 'export const unstaged = 1\n' } })
			await seedFullGate(root)
		},
	},
]

describe(
	'gate --hook: no green record of this state → only the test steps run',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		for (const scenario of RUN_INSTEAD)
			it(scenario.name, async () => {
				const hookPackage: HookPackage = createHookPackage({
					requiresMissing: scenario.requiresMissing,
					linked: scenario.linked,
				})
				await scenario.setup(hookPackage)
				const { root, testCounter, checkCounter } = hookPackage
				const testRunsBefore = countRuns(testCounter)
				const checkRunsBefore = countRuns(checkCounter)
				const tree = indexTreeOf({ root })

				const result = await runGateIn({ cwd: root, argv: ['--hook'] })

				const lines = result.output.split('\n')
				expect(result.exitCode).toBe(0)
				expect(lines[0]).toBe(runningLineOf(tree))
				expect(lines[0]).toContain('no green gate --full or --release of tree')
				expect(lines.at(-1)).toBe(HOOK_GREEN_LINE)
				expect(result.output).toMatch(RUN_STEP_WITH_SUMMARY)
				expect(result.output).not.toMatch(NOT_A_HOOK_STEP_LINE)
				expect(countRuns(testCounter) - testRunsBefore).toBe(1)
				expect(countRuns(checkCounter) - checkRunsBefore).toBe(0)
			})

		it('a failing test step → exit 1, the line naming it, the verdict failed at it', async () => {
			const { root, testCounter } = createHookPackage({ requiresMissing: true })
			const tree = indexTreeOf({ root })

			const result = await runGateIn({ cwd: root, argv: ['--hook'] })

			expect(result.exitCode).toBe(1)
			expect(result.output.split('\n')[0]).toBe(runningLineOf(tree))
			expect(result.output.split('\n')[0]).toContain('no green gate --full or --release of tree')
			expect(result.output).toMatch(/^FAIL +tests\b/m)
			expect(result.output).toMatch(/^gate --hook: failed at tests$/m)
			expect(countRuns(testCounter)).toBe(1)
		})

		it('a flaky test step → rerun serially on its failing files, exit 0, flagged flaky in parallel, green', async () => {
			const root = createGatePackage({
				full: [{ name: 'tests', run: 'sh ./vitest run', counts: 'tests' }],
				files: { vitest: FAKE_VITEST, mode: 'flaky', '.gitignore': 'node_modules\ncalls.txt\n' },
			})

			const result = await runGateIn({ cwd: root, argv: ['--hook'] })

			expect(result.exitCode).toBe(0)
			expect(result.output).toMatch(/^ok {4}tests .*flaky in parallel$/m)
			expect(result.output.split('\n').at(-1)).toBe(HOOK_GREEN_LINE)
			expect(readFileSync(join(root, 'calls.txt'), 'utf8').trim().split('\n')).toEqual([
				'run',
				'run src/c.test.ts src/a.test.ts src/b.test.ts --no-file-parallelism',
			])
		})

		it('a hand-over holds the repository → the tests run all the same', async () => {
			const { root, testCounter } = createHookPackage()
			writeFileSync(join(root, '.git', HANDOVER_LOCK_FILE), '/plans/commit.sh\n')

			const result = await runGateIn({ cwd: root, argv: ['--hook'] })

			expect(result.exitCode).toBe(0)
			expect(result.output.split('\n').at(-1)).toBe(HOOK_GREEN_LINE)
			expect(countRuns(testCounter)).toBe(1)
		})

		it('a run → no gate record in the worktree, nothing in the store', async () => {
			const { root } = createHookPackage()
			const tree = indexTreeOf({ root })

			const result = await runGateIn({ cwd: root, argv: ['--hook'] })

			expect(result.exitCode).toBe(0)
			expect(
				[FAST_RECORD_FILE, FULL_RECORD_FILE, HOOK_RECORD_FILE].map((name) =>
					readRecordFile({ root, name }),
				),
			).toEqual([undefined, undefined, undefined])
			expect(readTreeRecords({ root, tree })).toEqual([])
		})
	},
)

describe('gate --hook: its own arguments', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	for (const argv of [
		['--hook', '--fast'],
		['--hook', '--full'],
	])
		it(`${argv.join(' ')} → exit 2, the refusal, no step run`, async () => {
			const { root, testCounter, checkCounter } = createHookPackage()

			const result = await runGateIn({ cwd: root, argv })

			expect(result).toEqual({ exitCode: 2, output: HOOK_MODE_REFUSAL })
			expect([countRuns(testCounter), countRuns(checkCounter)]).toEqual([0, 0])
		})

	it('a package whose full gate has no test step → exit 0 and the line saying so, no step run', async () => {
		const { root, checkCounter } = createHookPackage({ withoutTestStep: true })

		const result = await runGateIn({ cwd: root, argv: ['--hook'] })

		expect(result).toEqual({ exitCode: 0, output: NO_TEST_STEP_LINE })
		expect(countRuns(checkCounter)).toBe(0)
	})
})

describe('gate --hook: review round 1 fixes', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('a package in a subfolder of its repository, the relative index path git hands the hook (.git/index) → resolved against the worktree top, the gated tree answers', async () => {
		const testCounter = createCounter()
		const files = packageFilesOf({
			steps: [countingStep({ counter: testCounter, name: 'tests' })],
		})
		const top = initializeRepository({
			root: temporaryFolder('dialecte-subfolder-'),
			files: Object.fromEntries(Object.entries(files).map(([path, text]) => [`pkg/${path}`, text])),
		})
		const root = join(top, 'pkg')
		await seedFullGate(root)
		const record = readFullRecord(root)

		await expect(
			runGateIn({ cwd: root, argv: ['--hook'], indexFile: '.git/index' }),
		).resolves.toEqual({
			exitCode: 0,
			output: reuseLineOf({ tree: indexTreeOf({ root: top }), record }),
		})
		expect(countRuns(testCounter)).toBe(1)
	})

	it('two test steps of 4 and 2 tests run → one vitest summary line of their sum, 6, the count the hook reader takes', async () => {
		const testCounter = createCounter()
		const root = createScratchRepository(
			packageFilesOf({
				steps: [
					countingStep({ counter: testCounter, name: 'tests' }),
					{
						name: 'browser tests',
						run: `printf '%s\\n' '      Tests  2 passed (2)'`,
						counts: 'tests',
					},
				],
			}),
		)

		const result = await runGateIn({ cwd: root, argv: ['--hook'] })

		expect(result.exitCode).toBe(0)
		expect(result.output.split('\n').filter((line) => /^\s*Tests\s/.test(line))).toEqual([
			'      Tests  6 passed (6)',
		])
		expect(readStepCounts(result.output).tests).toEqual({
			passed: 6,
			failed: 0,
			skipped: 0,
			total: 6,
		})
	})

	it('on a terminal → the running line and the step lines go to the live output, the result holds only the verdict', async () => {
		const { root } = createHookPackage()
		const written: string[] = []
		const live: LiveOutput = {
			tty: true,
			columns: 80,
			writeLine: (line) => written.push(line),
			rewriteLines: () => undefined,
		}

		const result = await runGate({ cwd: root, argv: ['--hook'], live })

		expect(result).toEqual({ exitCode: 0, output: HOOK_GREEN_LINE })
		expect(written[0]).toBe(runningLineOf(indexTreeOf({ root })))
		expect(written[0]).toContain('no green gate --full or --release of tree')
		expect(written.some((line) => /^ok +tests\b/.test(line))).toBe(true)
	})
})

describe('gate --hook: review round 2 fixes', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('git variables the cli ignores (a relative GIT_DIR it reads as another repository from a package subfolder) → no reuse: the tests run, never a record of another index', async () => {
		const testCounter = createCounter()
		const files = packageFilesOf({
			steps: [countingStep({ counter: testCounter, name: 'tests' })],
		})
		const top = initializeRepository({
			root: temporaryFolder('dialecte-given-dir-'),
			files: Object.fromEntries(Object.entries(files).map(([path, text]) => [`pkg/${path}`, text])),
		})
		const root = join(top, 'pkg')
		await seedFullGate(root)

		const result = spawnSync('node', [REPOSITORY_CLI_PATH, 'gate', '--hook'], {
			cwd: root,
			encoding: 'utf8',
			env: { ...process.env, GIT_DIR: '.git', GIT_INDEX_FILE: '.git/index' },
		})

		expect(result.status).toBe(0)
		expect(result.stdout).not.toContain('reused from')
		expect(result.stdout.trim().split('\n').at(-1)).toBe(HOOK_GREEN_LINE)
		expect(countRuns(testCounter)).toBe(2)
	})
})
