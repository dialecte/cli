/**
 * `gate --hook` runs every hook step of the full list (all but the scoped ones that count no tests) through the
 * cli: each step answered by the newest green record of the committed tree and install that ran it as it is now,
 * else run; every hook run records itself as a `hook-gate` record. Counting steps prove whether a step ran.
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
	HOOK_GREEN_LINE,
	HOOK_STEP_NAMES,
	REPOSITORY_CLI_PATH,
} from '../../test/gate-hook.constants.ts'
import {
	allReusedLinesOf,
	cloneRepository,
	commonGitDirOf,
	createHookPackage,
	hookRecordsOf,
	hookStepsOf,
	indexTreeOf,
	markStepSkipped,
	packageFilesOf,
	readFullRecord,
	runHookIn,
	runningLineOf,
	stepReusedLineOf,
	stripStepHashes,
} from '../../test/gate-hook.ts'
import { PACKAGES, ROOT_FIELDS_A, ROOT_FIELDS_B } from '../../test/install-key.constants.ts'
import {
	createScopedPackage,
	createScopedStep,
	readScopedRuns,
} from '../../test/scoped-gate-package.ts'
import { SCRATCH_REPOSITORY_TIMEOUT } from '../../test/scratch-checks.constants.ts'
import {
	countRuns,
	countingStep,
	createCounter,
	headOf,
	runGateIn,
	seedFullGate,
} from '../../test/scratch-checks.ts'
import { writeFiles } from '../../test/scratch-repository.ts'
import { hashGateCommand, readInstalledKey } from '../lib/gate-records/check-key.ts'
import { readTreeRecords } from '../lib/gate-records/check-store.ts'
import { INSTALLED_LOCK_FILE } from '../lib/gate-records/gate-records.constants.ts'
import { listHookSteps, resolveGateSteps } from '../lib/gate/gate-config.ts'

import { describe, expect, it } from 'vitest'

import type { HookPackage } from '../../test/gate-hook.types.ts'
import type { GateStep } from '../lib/gate/gate-config.types.ts'

const SHA256_HEX = /^[0-9a-f]{64}$/

const PACKAGE_ROOT = join(import.meta.dirname, '..', '..')

/** The runs of the `check` step, then of the `tests` step. */
function runsOf(hookPackage: HookPackage): [number, number] {
	return [countRuns(hookPackage.checkCounter), countRuns(hookPackage.testCounter)]
}

/** An installed lock of the given root fields and packages, as npm writes it. */
function installedLockOf(params: { root: object; packages: object }): Record<string, string> {
	return {
		[INSTALLED_LOCK_FILE]: `${JSON.stringify({ ...params.root, packages: params.packages }, null, 2)}\n`,
	}
}

describe('listHookSteps', () => {
	it('a full list of check, skills, build, tests, a scoped step counting no tests and a scoped test step → all but the scoped step counting no tests, in list order', () => {
		const steps: GateStep[] = [
			{ name: 'check', run: 'npm run check' },
			{ name: 'skills', run: 'npm run skills:check' },
			{ name: 'build', run: 'npm run build' },
			{ name: 'tests', run: 'npm test', counts: 'tests' },
			{ name: 'rules', run: 'dialecte rules', scoped: true },
			{ name: 'scoped tests', run: 'dialecte scoped', counts: 'tests', scoped: true },
		]

		expect(listHookSteps(steps).map((step) => step.name)).toEqual([
			'check',
			'skills',
			'build',
			'tests',
			'scoped tests',
		])
	})

	it("the cli's own package.json full list → check, skills, build, tests", () => {
		const packageJson = JSON.parse(readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8'))

		expect(
			listHookSteps(resolveGateSteps({ packageJson, mode: 'full' })).map((step) => step.name),
		).toEqual(['check', 'skills', 'build', 'tests'])
	})
})

describe(
	'gate --hook: every hook step is answered by the record of a run that ran it',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it('a hook after a hook that ran → every step reused from that hook-gate record, no green line, no step runs', async () => {
			const hookPackage = createHookPackage()
			const { root } = hookPackage
			const first = await runHookIn({ cwd: root })
			expect(first.exitCode).toBe(0)
			const firstRecords = hookRecordsOf({ root, tree: indexTreeOf({ root }) })
			expect(firstRecords).toHaveLength(1)
			const [firstRecord] = firstRecords

			const second = await runHookIn({ cwd: root })

			expect(second).toEqual({
				exitCode: 0,
				output: allReusedLinesOf({ record: firstRecord }).join('\n'),
			})
			expect(runsOf(hookPackage)).toEqual([1, 1])
		})

		it('a hook after a hook that itself reused gate --full → the lines name full and the time and HEAD of the run that ran the steps, the second record holds that origin on each step, no step runs', async () => {
			const hookPackage = createHookPackage()
			const { root } = hookPackage
			await seedFullGate(root)
			const full = readFullRecord(root)
			await runHookIn({ cwd: root })

			const second = await runHookIn({ cwd: root })

			const origin = `${full.at} \\(HEAD ${full.head.slice(0, 12)}\\)`
			expect(second.exitCode).toBe(0)
			expect(second.output.split('\n')).toEqual(
				HOOK_STEP_NAMES.map((step) =>
					expect.stringMatching(new RegExp(`^gate --hook: reused ${step} from full ${origin}$`)),
				),
			)
			expect(
				hookRecordsOf({ root, tree: indexTreeOf({ root }) })
					.flatMap((record) => record.steps)
					.map((step) => step.reused),
			).toEqual(Array(2).fill({ at: full.at, head: full.head, mode: 'full' }))
			expect(runsOf(hookPackage)).toEqual([1, 1])
		})

		it.each<{ label: string; argv: string[]; mode: string }>([
			{ label: 'gate --fast', argv: [], mode: 'fast' },
			{ label: 'gate --release', argv: ['--release'], mode: 'release' },
		])('a green $label of this tree answers every step, the lines name $mode', async (scenario) => {
			const hookPackage = createHookPackage()
			const { root } = hookPackage
			const gate = await runGateIn({ cwd: root, argv: scenario.argv })
			expect(gate.exitCode).toBe(0)
			const records = readTreeRecords({ root, tree: indexTreeOf({ root }) }).filter(
				(stored) => stored.mode === scenario.mode,
			)
			expect(records).toHaveLength(1)

			const result = await runHookIn({ cwd: root })

			expect(result).toEqual({
				exitCode: 0,
				output: allReusedLinesOf({ record: records[0] }).join('\n'),
			})
			expect(runsOf(hookPackage)).toEqual([1, 1])
		})

		it('the same packages installed with another root version and name since the gate → the same install: every step answered', async () => {
			const hookPackage = createHookPackage()
			const { root } = hookPackage
			writeFiles({ root, files: installedLockOf({ root: ROOT_FIELDS_A, packages: PACKAGES }) })
			await seedFullGate(root)
			const record = readFullRecord(root)
			writeFiles({
				root,
				files: installedLockOf({
					root: { ...ROOT_FIELDS_B, version: '9.9.9' },
					packages: PACKAGES,
				}),
			})

			const result = await runHookIn({ cwd: root })

			expect(result).toEqual({ exitCode: 0, output: allReusedLinesOf({ record }).join('\n') })
			expect(runsOf(hookPackage)).toEqual([1, 1])
		})

		it('a hook that failed at tests, then the cause removed → the next hook runs both again: a failed hook-gate record answers nothing', async () => {
			const hookPackage = createHookPackage({ requiresMissing: true })
			const { root, requires } = hookPackage
			const failed = await runHookIn({ cwd: root })
			expect(failed.exitCode).toBe(1)
			writeFiles({ root: join(requires, '..'), files: { ok: '' } })

			const result = await runHookIn({ cwd: root })

			expect(result.exitCode).toBe(0)
			expect(result.output).not.toContain('gate --hook: reused')
			expect(runsOf(hookPackage)).toEqual([2, 2])
		})
	},
)

describe(
	'gate --hook: a step is answered alone, the others run',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it('the tests step changed since the gate → the reused check line first, no running line, tests run with its usual line, green, one run of tests only', async () => {
			const hookPackage = createHookPackage()
			const { root, checkCounter, testCounter, requires } = hookPackage
			await seedFullGate(root)
			const record = readFullRecord(root)
			const steps = hookStepsOf({ checkCounter, testCounter, requires }).map((step) =>
				step.name === 'tests' ? { ...step, run: `${step.run} && true` } : step,
			)
			writeFiles({ root, files: { 'package.json': packageFilesOf({ steps })['package.json'] } })

			const result = await runHookIn({ cwd: root })

			const lines = result.output.split('\n')
			expect(result.exitCode).toBe(0)
			expect(lines[0]).toBe(stepReusedLineOf({ step: 'check', record }))
			expect(lines).not.toContain(runningLineOf({ tree: indexTreeOf({ root }) }))
			expect(result.output).toMatch(/^ok +tests\b/m)
			expect(lines.at(-1)).toBe(HOOK_GREEN_LINE)
			expect(runsOf(hookPackage)).toEqual([1, 2])
		})

		it('the check step changed since the gate → the reused tests line first, no running line, check runs with its usual line, green, one run of check only', async () => {
			const hookPackage = createHookPackage()
			const { root, checkCounter, testCounter, requires } = hookPackage
			await seedFullGate(root)
			const record = readFullRecord(root)
			const steps = hookStepsOf({ checkCounter, testCounter, requires }).map((step) =>
				step.name === 'check' ? { ...step, run: `${step.run} && true` } : step,
			)
			writeFiles({ root, files: { 'package.json': packageFilesOf({ steps })['package.json'] } })

			const result = await runHookIn({ cwd: root })

			const lines = result.output.split('\n')
			expect(result.exitCode).toBe(0)
			expect(lines[0]).toBe(stepReusedLineOf({ step: 'tests', record }))
			expect(lines).not.toContain(runningLineOf({ tree: indexTreeOf({ root }) }))
			expect(result.output).toMatch(/^ok +check\b/m)
			expect(lines.at(-1)).toBe(HOOK_GREEN_LINE)
			expect(runsOf(hookPackage)).toEqual([2, 1])
		})

		it('a green record whose tests step was skipped → that step is no answer and runs, check is answered', async () => {
			const hookPackage = createHookPackage()
			const { root } = hookPackage
			await seedFullGate(root)
			const record = readFullRecord(root)
			markStepSkipped({ root, tree: indexTreeOf({ root }), step: 'tests' })

			const result = await runHookIn({ cwd: root })

			const lines = result.output.split('\n')
			expect(result.exitCode).toBe(0)
			expect(lines[0]).toBe(stepReusedLineOf({ step: 'check', record }))
			expect(result.output).toMatch(/^ok +tests\b/m)
			expect(runsOf(hookPackage)).toEqual([1, 2])
		})

		it('a full list holding a scoped step that counts no tests, the gate run at another base than the hook → the unscoped steps answered, the scoped step never runs in the hook, the record hashes the hook steps only', async () => {
			const checkCounter = createCounter()
			const testCounter = createCounter()
			const bench = createScopedStep({ name: 'bench' })
			const check = countingStep({ counter: checkCounter, name: 'check' })
			const tests = countingStep({ counter: testCounter, name: 'tests' })
			const root = createScopedPackage({
				gate: {
					fast: [tests],
					full: [check, { name: bench.step.name, run: bench.step.run, scoped: true }, tests],
				},
			})
			const gate = await runGateIn({ cwd: root, argv: ['--full', '--base', headOf(root)] })
			expect(gate.exitCode).toBe(0)
			const record = readFullRecord(root)

			const result = await runHookIn({ cwd: root })

			expect(result).toEqual({
				exitCode: 0,
				output: allReusedLinesOf({ steps: ['check', 'tests'], record }).join('\n'),
			})
			expect([countRuns(checkCounter), countRuns(testCounter)]).toEqual([1, 1])
			expect(readScopedRuns(bench)).toHaveLength(1)
			expect(
				hookRecordsOf({ root, tree: indexTreeOf({ root }) }).map(
					(stored) => stored.key?.commandHash,
				),
			).toEqual([hashGateCommand({ steps: [check, tests] })])
		})
	},
)

describe(
	'gate --hook: a record of an older cli (no step hashes)',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it('a whole-key green full record without step hashes → the test steps answered as before (the existing reuse line), the other hook steps run', async () => {
			const hookPackage = createHookPackage()
			const { root } = hookPackage
			await seedFullGate(root)
			const tree = indexTreeOf({ root })
			stripStepHashes({ root, tree })

			const result = await runHookIn({ cwd: root })

			expect(result.exitCode).toBe(0)
			expect(result.output).toMatch(/^gate --hook: tests reused from gate --full green on tree /m)
			expect(result.output).toMatch(/^ok +check\b/m)
			expect(runsOf(hookPackage)).toEqual([2, 1])
		})
	},
)

describe(
	'gate --hook: every run writes a hook-gate record',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it('a hook that answered from gate --full → one hook-gate record: the index tree, the installed key, the hash of the hook steps, each step with its stepHash and the origin it was answered from, HEAD before the commit, no origin mark', async () => {
			const hookPackage = createHookPackage()
			const { root, checkCounter, testCounter, requires } = hookPackage
			await seedFullGate(root)
			const full = readFullRecord(root)
			const tree = indexTreeOf({ root })

			await runHookIn({ cwd: root })

			const records = hookRecordsOf({ root, tree })
			expect(records).toHaveLength(1)
			expect(records[0]).toMatchObject({
				mode: 'hook-gate',
				head: headOf(root),
				key: {
					tree,
					...readInstalledKey(root),
					commandHash: hashGateCommand({
						steps: hookStepsOf({ checkCounter, testCounter, requires }),
					}),
				},
				steps: HOOK_STEP_NAMES.map((name) => ({
					name,
					status: 'passed',
					reused: { at: full.at, head: full.head, mode: 'full' },
					stepHash: expect.stringMatching(SHA256_HEX),
				})),
			})
			expect(records[0].origin).toBeUndefined()
			expect(records[0].steps.map((step) => step.stepHash)).toEqual(
				full.steps.filter((step) => step.name !== 'tdd').map((step) => step.stepHash),
			)
		})

		it('a hook that ran its steps → its record holds them with their stepHash and no reused mark', async () => {
			const { root } = createHookPackage()
			const tree = indexTreeOf({ root })

			await runHookIn({ cwd: root })

			const records = hookRecordsOf({ root, tree })
			expect(records).toHaveLength(1)
			const [record] = records
			expect(record.steps.map((step) => step.name)).toEqual(HOOK_STEP_NAMES)
			expect(record.steps.map((step) => step.stepHash)).toEqual([
				expect.stringMatching(SHA256_HEX),
				expect.stringMatching(SHA256_HEX),
			])
			expect(record.steps.map((step) => step.reused)).toEqual([undefined, undefined])
		})

		it.each([
			{ label: '--no-reuse', argv: ['--no-reuse'], reusable: true },
			{ label: 'git variables naming another repository', argv: [], reusable: false },
		])(
			'$label with a green gate --full of the tree → nothing answered, one hook-gate record all the same',
			async (scenario) => {
				const hookPackage = createHookPackage()
				const { root } = hookPackage
				await seedFullGate(root)
				const tree = indexTreeOf({ root })

				const result = await runHookIn({
					cwd: root,
					argv: scenario.argv,
					reusable: scenario.reusable,
				})

				expect(result.exitCode).toBe(0)
				expect(runsOf(hookPackage)).toEqual([2, 2])
				expect(hookRecordsOf({ root, tree })).toHaveLength(1)
			},
		)
	},
)

describe(
	'gate --hook: given DIALECTE_CHECK_STORE (a rehearsal clone) it reads and writes that store',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it('a hook in a clone given the store of the repository → the record lands in that store marked as a rehearsal, none in the clone; a hook in another clone given the same store is answered by it', async () => {
			const hookPackage = createHookPackage()
			const { root } = hookPackage
			const store = commonGitDirOf(root)
			const tree = indexTreeOf({ root })
			const first = cloneRepository(root)
			const second = cloneRepository(root)

			const ran = await runHookIn({ cwd: first, checkStore: store })
			const [stored] = hookRecordsOf({ root, tree })
			const answered = await runHookIn({ cwd: second, checkStore: store })

			expect(ran.exitCode).toBe(0)
			expect(stored).toMatchObject({ mode: 'hook-gate', origin: 'rehearsal' })
			expect(readTreeRecords({ root: first, tree })).toEqual([])
			expect(answered).toEqual({
				exitCode: 0,
				output: allReusedLinesOf({ record: stored }).join('\n'),
			})
			expect(runsOf(hookPackage)).toEqual([1, 1])
		})

		it('a hook in a clone given a store holding a green gate --full of the tree → every step answered by it', async () => {
			const hookPackage = createHookPackage()
			const { root } = hookPackage
			await seedFullGate(root)
			const full = readFullRecord(root)
			const clone = cloneRepository(root)

			const result = await runHookIn({ cwd: clone, checkStore: commonGitDirOf(root) })

			expect(result).toEqual({ exitCode: 0, output: allReusedLinesOf({ record: full }).join('\n') })
			expect(runsOf(hookPackage)).toEqual([1, 1])
		})

		it('the cli process started with DIALECTE_CHECK_STORE in its environment → the record lands in that store marked as a rehearsal, none in the clone', () => {
			const { root } = createHookPackage()
			const tree = indexTreeOf({ root })
			const clone = cloneRepository(root)

			const result = spawnSync('node', [REPOSITORY_CLI_PATH, 'gate', '--hook'], {
				cwd: clone,
				encoding: 'utf8',
				env: { ...process.env, DIALECTE_CHECK_STORE: commonGitDirOf(root) },
			})

			expect(result.status).toBe(0)
			expect(hookRecordsOf({ root, tree })).toMatchObject([
				{ mode: 'hook-gate', origin: 'rehearsal' },
			])
			expect(readTreeRecords({ root: clone, tree })).toEqual([])
		})
	},
)
