import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { deadPid } from '../../test/dead-pid.ts'
import { FAKE_VITEST } from '../../test/fake-vitest.constants.ts'
import { ISO_TIME_PATTERN, SHA256_PATTERN } from '../../test/gate-records.constants.ts'
import { readRecordFile } from '../../test/gate-records.ts'
import {
	PERSON_WHO_RUNS_THE_REPOSITORY,
	RUN_THE_HANDOVER,
	TOUCH_THE_GIT_FOLDER,
} from '../../test/refusal-wording.constants.ts'
import {
	createScratchRepository,
	git,
	temporaryFolder,
	writeFiles,
} from '../../test/scratch-repository.ts'
import { createVitestPackage } from '../../test/scratch-vitest-package.ts'
import { HANDOVER_RUN_MARKER_FILE } from '../lib/handover/handover.constants.ts'
import { runGate } from './gate.ts'
import { runTdd } from './tdd.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { GateRecord } from '../lib/gate-records/gate-records.types.ts'
import type { GateStep } from '../lib/gate/gate-config.types.ts'
import type { GateMode } from '../lib/gate/gate.types.ts'

/** A package whose gate runs the given steps. */
function packageWith(params: {
	fast?: GateStep[]
	full?: GateStep[]
	generatedDocs?: string[]
	scripts?: Record<string, string>
	files?: Record<string, string>
}): string {
	return createScratchRepository({
		'package.json': JSON.stringify({
			name: 'demo',
			scripts: params.scripts ?? {},
			dialecte: {
				gate: { fast: params.fast, full: params.full },
				generatedDocs: params.generatedDocs,
			},
		}),
		...params.files,
	})
}

/** The gate in `root`. */
function gate(params: { cwd: string; argv: string[] }) {
	return runGate({ cwd: params.cwd, argv: params.argv })
}

/** The tdd line of a package that does not test with vitest. */
const NO_VITEST_LINE = 'skip  tdd  the package does not test with vitest'

/** The hygiene note of a scratch repository made without `worktree add`. */
const NO_BASELINE_LINE =
	'ok    hygiene  no hygiene baseline (worktree not made by `dialecte worktree add`): the stash is not compared'

afterEach(function forgetTheCacheFolder() {
	vi.unstubAllEnvs()
})

describe('runGate', { timeout: 30_000 }, () => {
	it('a step whose output says passed but exits non-zero → failed, the next step not run', async () => {
		const root = packageWith({
			fast: [
				{ name: 'check', run: `printf ' Tests  4 passed (4)\\n'; exit 3` },
				{ name: 'tests', run: 'echo never', counts: 'tests' },
			],
		})

		const result = await gate({ cwd: root, argv: [] })

		expect(result.exitCode).toBe(1)
		expect(result.output.split('\n').slice(0, 5)).toEqual([
			NO_BASELINE_LINE,
			NO_VITEST_LINE,
			'FAIL  check  exit 3  tests 4 passed / 4',
			'--    tests  not run: an earlier step failed',
			'gate --fast: failed at check',
		])
	})

	it('a docs build rewrote a declared generated file → restored byte-exact, even when the step fails', async () => {
		const original = Buffer.from([0x7b, 0x0a, 0x09, 0x22, 0xe2, 0x9c, 0x93, 0x22, 0x0d, 0x0a, 0x7d])
		const root = packageWith({
			full: [
				{
					name: 'docs',
					run: 'printf rewritten > doc/data/catalog.json; exit 1',
					restoresGeneratedDocs: true,
				},
			],
			generatedDocs: ['doc/data/catalog.json'],
			files: { 'doc/data/catalog.json': 'x' },
		})
		writeFileSync(join(root, 'doc/data/catalog.json'), original)

		const result = await gate({ cwd: root, argv: ['--full'] })

		expect(readFileSync(join(root, 'doc/data/catalog.json')).equals(original)).toBe(true)
		expect(result.output.split('\n').slice(0, 2)).toEqual([
			NO_VITEST_LINE,
			'FAIL  docs  exit 1  restored doc/data/catalog.json',
		])
	})

	it('a test step that counts no test, or exits 0 with a failed test → failed', async () => {
		const silent = packageWith({
			fast: [
				{
					name: 'tests',
					run: `printf 'No test files found, exiting with code 0\n'`,
					counts: 'tests',
				},
			],
		})
		const failing = packageWith({
			fast: [{ name: 'tests', run: `printf ' Tests  1 failed | 3 passed (4)\n'`, counts: 'tests' }],
		})

		const silentResult = await gate({ cwd: silent, argv: [] })
		expect(silentResult.output.split('\n')[2]).toBe('FAIL  tests  exit 0  no test ran')
		const failingResult = await gate({ cwd: failing, argv: [] })
		expect(failingResult.output.split('\n')[2]).toBe(
			'FAIL  tests  exit 0  tests 3 passed, 1 failed / 4  1 test(s) failed',
		)
	})

	it('a test step failing in parallel, passing on its serial rerun → ok, both runs on its line, each file flaky under it, the record flagged', async () => {
		const root = packageWith({
			fast: [{ name: 'tests', run: 'sh ./vitest run', counts: 'tests' }],
			files: { '.gitignore': 'calls.txt\n', vitest: FAKE_VITEST, mode: 'flaky' },
		})

		const result = await gate({ cwd: root, argv: [] })

		expect(result.exitCode).toBe(0)
		expect(result.output.split('\n').slice(2)).toEqual([
			'ok    tests  exit 1  tests 40 passed, 2 failed / 42, files 10  serial rerun of 3 file(s): exit 0, tests 3 passed / 3, files 2  flaky in parallel',
			'        flaky  src/c.test.ts',
			'        flaky  src/a.test.ts',
			'        flaky  src/b.test.ts',
			'gate --fast: green',
		])
		expect(
			readRecordFile<GateRecord>({ root, name: 'dialecte-gate-fast.json' })?.steps,
		).toContainEqual(
			expect.objectContaining({ name: 'tests', status: 'passed', note: 'flaky in parallel' }),
		)
	})

	it('--json on a step rerun serially → the step carries its rerun: files, the files still failing, status, exit code, counts', async () => {
		const root = packageWith({
			fast: [{ name: 'tests', run: 'sh ./vitest run', counts: 'tests' }],
			files: { '.gitignore': 'calls.txt\n', vitest: FAKE_VITEST, mode: 'broken' },
		})

		const result = await gate({ cwd: root, argv: ['--json'] })

		const steps = (JSON.parse(result.output) as { steps: { step: GateStep }[] }).steps
		expect(steps.find((entry) => entry.step.name === 'tests')).toMatchObject({
			status: 'failed',
			rerun: {
				files: ['src/c.test.ts', 'src/a.test.ts', 'src/b.test.ts'],
				failing: ['src/a.test.ts'],
				status: 'failed',
				exitCode: 1,
				counts: { tests: { passed: 2, failed: 1, skipped: 0, total: 3 } },
			},
		})
	})

	it('a test step failing in parallel and on its serial rerun → FAIL as a real failure, the files still failing named, the serial run’s tail', async () => {
		const root = packageWith({
			fast: [{ name: 'tests', run: 'sh ./vitest run', counts: 'tests' }],
			files: { '.gitignore': 'calls.txt\n', vitest: FAKE_VITEST, mode: 'broken' },
		})

		const result = await gate({ cwd: root, argv: [] })

		expect(result.exitCode).toBe(1)
		expect(result.output.split('\n').slice(2, 8)).toEqual([
			'FAIL  tests  exit 1  tests 40 passed, 2 failed / 42, files 10  serial rerun of 3 file(s): exit 1, tests 2 passed, 1 failed / 3, files 2  real failure: exit 1',
			'        flaky  src/c.test.ts',
			'        failed  src/a.test.ts',
			'        flaky  src/b.test.ts',
			'gate --fast: failed at tests',
			'--- last lines of tests ---',
		])
		expect(result.output).toContain('the serial run failed here')
	})

	it('an npm script the package lacks → skipped; the rest green → exit 0 with the counts', async () => {
		const root = packageWith({
			scripts: { check: `printf 'Found 0 warnings and 0 errors.\n'` },
			fast: [
				{ name: 'check', run: 'npm run check' },
				{ name: 'skills', run: 'npm run skills:check' },
			],
		})

		const result = await gate({ cwd: root, argv: [] })
		expect(result).toEqual({
			exitCode: 0,
			output: [
				NO_BASELINE_LINE,
				NO_VITEST_LINE,
				'ok    check  exit 0  0 error(s), 0 warning(s)',
				'skip  skills  no npm script "skills:check"',
				'gate --fast: green',
			].join('\n'),
		})
	})

	it('a hand-over script holds the repository → refused, no step run', async () => {
		const root = packageWith({ fast: [{ name: 'check', run: 'touch ran' }] })
		writeFileSync(join(root, '.git/dialecte-handover.lock'), '/plans/commit.sh\n')

		const result = await gate({ cwd: root, argv: [] })

		expect(result.exitCode).toBe(1)
		expect(result.output).toContain('/plans/commit.sh')
		expect(result.output).toContain(join(root, '.git/dialecte-handover.lock'))
		expect(result.output).toMatch(RUN_THE_HANDOVER)
		expect(result.output).toContain(PERSON_WHO_RUNS_THE_REPOSITORY)
		expect(result.output).not.toMatch(TOUCH_THE_GIT_FOLDER)
		expect(existsSync(join(root, 'ran'))).toBe(false)
	})
})

/**
 * A hand-over folder whose lots file names `repository`, with its `commit.sh`, the lock of `root` naming
 * that script (as `handover <lots.json>` writes them); the run marker naming `runningPid` when given.
 */
function writtenHandover(params: {
	root: string
	repository: string
	lotsFile?: boolean
	runningPid?: number
}): string {
	const folder = temporaryFolder('dialecte-handover-')
	if (params.lotsFile !== false)
		writeFileSync(
			join(folder, 'lots.json'),
			JSON.stringify({
				repository: params.repository,
				branch: 'main',
				head: git({ root: params.root, args: ['rev-parse', 'HEAD'] }).trim(),
				lots: [{ paths: ['src/'], message: 'feat(read): read answers one' }],
			}),
		)
	writeFileSync(join(folder, 'commit.sh'), '#!/bin/sh\n')
	if (params.runningPid !== undefined)
		writeFileSync(
			join(folder, HANDOVER_RUN_MARKER_FILE),
			JSON.stringify({ pid: params.runningPid, startedAt: '2026-11-01T10:00:00.000Z' }),
		)
	writeFileSync(join(params.root, '.git/dialecte-handover.lock'), `${join(folder, 'commit.sh')}\n`)
	return folder
}

describe('runGate under a written hand-over', { timeout: 30_000 }, () => {
	it('the lock names a hand-over written for this repository (its lots file naming the real path) → the gate runs its steps and records them, one line naming the hand-over it runs under', async () => {
		const root = packageWith({ fast: [{ name: 'check', run: 'touch ran' }] })
		const folder = writtenHandover({ root, repository: realpathSync(root) })

		const result = await gate({ cwd: root, argv: [] })

		expect(result.exitCode).toBe(0)
		expect(existsSync(join(root, 'ran'))).toBe(true)
		expect(existsSync(join(root, '.git/dialecte-gate-fast.json'))).toBe(true)
		expect(result.output.split('\n').filter((line) => line.includes(folder))).toHaveLength(1)
	})

	it('the lock names a hand-over of another repository → refused naming the lock and the script holding it, nothing under .git to delete; no step run', async () => {
		const root = packageWith({ fast: [{ name: 'check', run: 'touch ran' }] })
		const other = createScratchRepository()
		const folder = writtenHandover({ root, repository: other })

		const result = await gate({ cwd: root, argv: [] })

		expect(result.exitCode).toBe(1)
		expect(result.output).toContain(join(folder, 'commit.sh'))
		expect(result.output).toContain(join(root, '.git/dialecte-handover.lock'))
		expect(result.output).toMatch(RUN_THE_HANDOVER)
		expect(result.output).toContain(PERSON_WHO_RUNS_THE_REPOSITORY)
		expect(result.output).not.toMatch(TOUCH_THE_GIT_FOLDER)
		expect(existsSync(join(root, 'ran'))).toBe(false)
	})

	it('the lock names a script whose folder holds no lots file → refused, no step run', async () => {
		const root = packageWith({ fast: [{ name: 'check', run: 'touch ran' }] })
		const folder = writtenHandover({ root, repository: root, lotsFile: false })

		const result = await gate({ cwd: root, argv: [] })

		expect(result.exitCode).toBe(1)
		expect(result.output).toContain(join(folder, 'commit.sh'))
		expect(result.output).toContain(PERSON_WHO_RUNS_THE_REPOSITORY)
		expect(result.output).not.toMatch(TOUCH_THE_GIT_FOLDER)
		expect(existsSync(join(root, 'ran'))).toBe(false)
	})

	it('a hand-over of this repository whose real run is in progress (its run marker naming a live process) → refused, no step run', async () => {
		const root = packageWith({ fast: [{ name: 'check', run: 'touch ran' }] })
		const folder = writtenHandover({ root, repository: root, runningPid: process.pid })

		const result = await gate({ cwd: root, argv: [] })

		expect(result.exitCode).toBe(1)
		expect(result.output).toContain(folder)
		expect(result.output).not.toMatch(TOUCH_THE_GIT_FOLDER)
		expect(existsSync(join(root, 'ran'))).toBe(false)
	})

	it('a hand-over whose run is in progress → the refusal names its run marker file in the hand-over folder (outside .git), so a person can judge a pid reused by another process', async () => {
		const root = packageWith({ fast: [{ name: 'check', run: 'touch ran' }] })
		const folder = writtenHandover({ root, repository: root, runningPid: process.pid })

		const result = await gate({ cwd: root, argv: [] })

		expect(result.exitCode).toBe(1)
		expect(result.output).toContain(join(folder, HANDOVER_RUN_MARKER_FILE))
	})

	it('a hand-over of this repository whose run marker names a process that is gone → not running: the gate runs its steps', async () => {
		const root = packageWith({ fast: [{ name: 'check', run: 'touch ran' }] })
		writtenHandover({ root, repository: root, runningPid: deadPid() })

		const result = await gate({ cwd: root, argv: [] })

		expect(result.exitCode).toBe(0)
		expect(existsSync(join(root, 'ran'))).toBe(true)
	})
})

describe('runGate: hygiene, no machine lock', { timeout: 30_000 }, () => {
	it('--fast with a staged file → hygiene fails first with how to look, no step run', async () => {
		const root = packageWith({ fast: [{ name: 'check', run: 'touch ran' }] })
		writeFileSync(join(root, 'README.md'), 'changed\n')
		git({ root, args: ['add', 'README.md'] })

		const result = await gate({ cwd: root, argv: [] })

		expect(result.exitCode).toBe(1)
		expect(result.output.split('\n')).toEqual([
			expect.stringMatching(/^FAIL  hygiene  1 file\(s\) staged: README\.md  no hygiene baseline/),
			'--    tdd  not run: an earlier step failed',
			'--    check  not run: an earlier step failed',
			'gate --fast: failed at hygiene',
			'--- last lines of hygiene ---',
			'look (read-only):',
			`  git -C '${root}' diff --cached --stat`,
		])
		expect(existsSync(join(root, 'ran'))).toBe(false)
	})

	it('--fast with a new file declared → no warning; not declared → a warning, still green', async () => {
		const root = packageWith({ fast: [{ name: 'check', run: 'true' }] })
		writeFileSync(join(root, 'new.ts'), 'export {}\n')

		const declared = await gate({ cwd: root, argv: ['--declare', 'new.ts'] })
		const undeclared = await gate({ cwd: root, argv: [] })

		expect(declared.output.split('\n')[0]).toBe(NO_BASELINE_LINE)
		expect(undeclared.exitCode).toBe(0)
		expect(undeclared.output.split('\n')[0]).toContain(
			'warning: 1 new file(s) the change did not declare (--declare <path>): new.ts',
		)
	})

	it('--full --no-wait, the old machine lock file of the cache folder held by a live process → the steps run: no gate takes a lock', async () => {
		const cache = temporaryFolder('dialecte-gate-cache-')
		writeFileSync(
			join(cache, 'heavy-run.lock'),
			JSON.stringify({
				pid: process.ppid,
				command: 'elsewhere',
				startedAt: '2026-10-29T10:00:00.000Z',
			}),
		)
		vi.stubEnv('DIALECTE_CACHE_DIR', cache)
		// a run under an older cli that still names a holder must not decide this case
		vi.stubEnv('DIALECTE_MACHINE_LOCK_HOLDER', undefined)
		const root = packageWith({
			full: [{ name: 'build', run: 'printf %s "$DIALECTE_MACHINE_LOCK_HOLDER" > ran' }],
		})

		const result = await gate({ cwd: root, argv: ['--full', '--no-wait'] })

		expect(result.exitCode).toBe(0)
		// no step runs as the holder of a lock
		expect(
			existsSync(join(root, 'ran')) ? readFileSync(join(root, 'ran'), 'utf8') : undefined,
		).toBe('')
	})

	it('a step → run with GIT_OPTIONAL_LOCKS=0, so a git status inside it never takes index.lock', async () => {
		const root = packageWith({
			fast: [{ name: 'locks', run: 'printf %s "$GIT_OPTIONAL_LOCKS" > locks.txt' }],
		})

		const result = await gate({ cwd: root, argv: [] })

		expect(result.exitCode).toBe(0)
		expect(readFileSync(join(root, 'locks.txt'), 'utf8')).toBe('0')
	})
})

describe('runGate: a package whose tests run in a browser', { timeout: 30_000 }, () => {
	it('its test step, declared heavy, the old machine lock file held by a live process, --no-wait → the step runs', async () => {
		const cache = temporaryFolder('dialecte-gate-cache-')
		writeFileSync(
			join(cache, 'heavy-run.lock'),
			JSON.stringify({
				pid: process.ppid,
				command: 'elsewhere',
				startedAt: '2026-10-29T10:00:00.000Z',
			}),
		)
		vi.stubEnv('DIALECTE_CACHE_DIR', cache)
		// shaped like core: its unit project runs in chromium through @vitest/browser-playwright
		const root = createScratchRepository({
			'package.json': JSON.stringify({
				name: 'demo',
				devDependencies: { '@vitest/browser-playwright': '^4.1.10', vitest: '^4.1.8' },
				dialecte: {
					gate: {
						fast: [
							{
								name: 'tests',
								run: "touch ran; printf ' Tests  1 passed (1)\\n'",
								counts: 'tests',
								// a key of the old lock: ignored
								heavy: true,
							},
						],
					},
				},
			}),
			'vitest.config.ts':
				"export default { test: { projects: [{ test: { name: 'unit', browser: createBrowser() } }] } }\n",
		})

		const result = await gate({ cwd: root, argv: ['--no-wait'] })

		expect(result.exitCode).toBe(0)
		expect(existsSync(join(root, 'ran'))).toBe(true)
	})
})

describe('runGate: the tdd step', { timeout: 240_000 }, () => {
	const STUB =
		"export function add(left: number, right: number): number {\n\tthrow new Error('not implemented: add')\n}\n"
	const IMPLEMENTED =
		'export function add(left: number, right: number): number {\n\treturn left + right\n}\n'
	const ADD_TEST = [
		"import { add } from './add.ts'",
		"import { expect, it } from 'vitest'",
		"it('one plus two → three', () => { expect(add(1, 2)).toBe(3) })",
		'',
	].join('\n')

	/** A vitest package whose fast gate runs one light step after the tdd step. */
	function tddPackage(files: Record<string, string> = {}): string {
		return createVitestPackage({
			files,
			dialecte: { gate: { fast: [{ name: 'check', run: 'true' }] } },
		})
	}

	function tdd(params: { root: string; argv: string[] }) {
		return runTdd({
			cwd: params.root,
			argv: params.argv,
			now: () => new Date('2026-10-29T12:00:00.000Z'),
		})
	}

	/** A package where the test station proved the test red and the implement station made it green. */
	async function redThenGreen(): Promise<string> {
		const root = tddPackage()
		writeFiles({ root, files: { 'src/add.ts': STUB, 'src/add.test.ts': ADD_TEST } })
		await tdd({ root, argv: ['red'] })
		writeFileSync(join(root, 'src/add.ts'), IMPLEMENTED)
		await tdd({ root, argv: ['green'] })
		return root
	}

	it('a new test file never proven red → fails: test code changed outside tdd red, the cases listed', async () => {
		const root = tddPackage()
		writeFiles({ root, files: { 'src/add.ts': STUB, 'src/add.test.ts': ADD_TEST } })

		const result = await gate({ cwd: root, argv: ['--declare', 'src/'] })

		expect(result.exitCode).toBe(1)
		expect(result.output.split('\n')).toEqual([
			NO_BASELINE_LINE,
			'FAIL  tdd  test code changed outside tdd red: src/add.test.ts',
			'--    check  not run: an earlier step failed',
			'gate --fast: failed at tdd',
			'--- last lines of tdd ---',
			'missing receipt  src/add.test.ts::one plus two → three',
			'the test station runs `dialecte tdd red`, the implement station `dialecte tdd green`',
		])
	})

	it('red then green → ok with the count; the test file edited since, or a helper added → fails naming it', async () => {
		const green = await redThenGreen()
		const edited = await redThenGreen()
		writeFileSync(join(edited, 'src/add.test.ts'), ADD_TEST.replace('toBe(3)', 'toBe(4)'))
		const helper = await redThenGreen()
		writeFiles({ root: helper, files: { 'test/expected.ts': 'export const EXPECTED = 3\n' } })

		const passed = await gate({ cwd: green, argv: ['--declare', 'src/'] })

		expect(passed.exitCode).toBe(0)
		expect(passed.output.split('\n')[1]).toBe(
			'ok    tdd  1 case(s) of the change: 1 red then green',
		)
		const editedResult = await gate({ cwd: edited, argv: ['--declare', 'src/'] })
		expect(editedResult.output.split('\n')[1]).toBe(
			'FAIL  tdd  test code changed outside tdd red: src/add.test.ts',
		)
		const helperResult = await gate({
			cwd: helper,
			argv: ['--declare', 'src/', '--declare', 'test/'],
		})
		expect(helperResult.output.split('\n')[1]).toBe(
			'FAIL  tdd  test code changed outside tdd red: test/expected.ts',
		)
	})

	it('a test call of the base deleted → passes, the finding shown under the step', async () => {
		const root = tddPackage({
			'src/add.ts': IMPLEMENTED,
			'src/add.test.ts': ADD_TEST.replace(
				/\n$/,
				"\nit('zero plus zero → zero', () => { expect(add(0, 0)).toBe(0) })\n",
			),
		})
		writeFileSync(join(root, 'src/add.test.ts'), ADD_TEST)
		await tdd({ root, argv: ['red'] })

		const result = await gate({ cwd: root, argv: [] })

		expect(result.exitCode).toBe(0)
		expect(result.output.split('\n').slice(1, 3)).toEqual([
			'ok    tdd  1 case(s) of the change: 1 unchanged',
			'        deleted  src/add.test.ts  the test "zero plus zero → zero" of the base is gone',
		])
	})

	it('a case the lot accepts → counted and shown with its reason under the step', async () => {
		const root = tddPackage({ 'src/add.ts': IMPLEMENTED })
		writeFiles({
			root,
			files: {
				'src/add.test.ts': ADD_TEST,
				'.dialecte/lot.json': JSON.stringify({
					accept: [
						{
							case: 'src/add.test.ts::one plus two → three',
							reason: 'pins behaviour that already exists',
						},
					],
				}),
			},
		})
		await tdd({ root, argv: ['red'] })

		const result = await gate({ cwd: root, argv: ['--declare', 'src/'] })

		expect(result.exitCode).toBe(0)
		expect(result.output.split('\n').slice(1, 3)).toEqual([
			'ok    tdd  1 case(s) of the change: 1 accepted',
			'        accepted  src/add.test.ts::one plus two → three  pins behaviour that already exists',
		])
	})

	it('an acceptance naming no case of the change → reported as unused under the step', async () => {
		const root = await redThenGreen()
		mkdirSync(join(root, '.dialecte'))
		writeFileSync(
			join(root, '.dialecte/lot.json'),
			JSON.stringify({ accept: [{ case: 'src/add.test.ts::nope', reason: 'a typo' }] }),
		)

		const result = await gate({ cwd: root, argv: ['--declare', 'src/'] })

		expect(result.output.split('\n').slice(1, 3)).toEqual([
			'ok    tdd  1 case(s) of the change: 1 red then green',
			'        unused accept  src/add.test.ts::nope  no case of the change has that name (a typo)',
		])
	})

	it('an acceptance that is not { case, reason } → fails naming the expected shape', async () => {
		const root = tddPackage()
		mkdirSync(join(root, '.dialecte'))
		writeFileSync(join(root, '.dialecte/lot.json'), JSON.stringify({ accept: [{ case: 'x' }] }))

		const result = await gate({ cwd: root, argv: [] })
		expect(result.output.split('\n')[1]).toBe(
			'FAIL  tdd  .dialecte/lot.json: each "accept" entry must be { "case": "<file>::<name>", "reason": "<why>" }',
		)
	})

	it('no test file changed → ok with a note; --full runs the step too, first', async () => {
		const root = tddPackage()

		const fast = await gate({ cwd: root, argv: [] })
		const full = await gate({ cwd: root, argv: ['--full'] })

		expect(fast.output.split('\n')[1]).toBe('ok    tdd  no test code new or changed since the base')
		expect(full.output.split('\n')[0]).toBe('ok    tdd  no test code new or changed since the base')
	})

	it('the lot declared exempt → ok with the reason and what the change touches; the lot file not a new file to declare', async () => {
		const root = tddPackage({ 'src/add.ts': IMPLEMENTED })
		writeFiles({
			root,
			files: {
				'src/add.ts': IMPLEMENTED.replace('left + right', 'right + left'),
				'src/add.test.ts': ADD_TEST,
				'.dialecte/lot.json': JSON.stringify({ tdd: 'exempt: a rename only' }),
			},
		})

		const result = await gate({ cwd: root, argv: ['--declare', 'src/'] })

		expect(result.exitCode).toBe(0)
		expect(result.output.split('\n').slice(0, 2)).toEqual([
			NO_BASELINE_LINE,
			'ok    tdd  exempt: a rename only (1 production file(s), 1 test file(s) changed)',
		])
	})

	it('a lot file whose tdd is not "exempt: <reason>" → fails naming the expected shape', async () => {
		const root = tddPackage()
		mkdirSync(join(root, '.dialecte'))
		writeFileSync(join(root, '.dialecte/lot.json'), JSON.stringify({ tdd: 'skip' }))

		const result = await gate({ cwd: root, argv: [] })

		expect(result.exitCode).toBe(1)
		expect(result.output.split('\n')[1]).toBe(
			'FAIL  tdd  .dialecte/lot.json: "tdd" must be "exempt: <reason>", not "skip"',
		)
	})
})

describe('runGate: the record in the git folder', { timeout: 30_000 }, () => {
	/** The record of `mode` as the gate left it; undefined when there is none. */
	function readRecord(params: { root: string; mode: GateMode }): GateRecord | undefined {
		return readRecordFile<GateRecord>({
			root: params.root,
			name: `dialecte-gate-${params.mode}.json`,
		})
	}

	it('--fast green → dialecte-gate-fast.json: when, HEAD, the state hash, each step with its status, counts and reason; no full record', async () => {
		const root = packageWith({
			fast: [
				{ name: 'check', run: `printf ' Tests  1056 passed | 4 skipped (1060)\\n'` },
				{ name: 'skills', run: 'npm run skills:check' },
			],
		})

		const result = await gate({ cwd: root, argv: [] })

		expect(result.exitCode).toBe(0)
		expect(readRecord({ root, mode: 'fast' })).toMatchObject({
			mode: 'fast',
			at: expect.stringMatching(ISO_TIME_PATTERN),
			head: git({ root, args: ['rev-parse', 'HEAD'] }).trim(),
			stateHash: expect.stringMatching(SHA256_PATTERN),
			steps: [
				{ name: 'tdd', status: 'skipped', reason: 'the package does not test with vitest' },
				{
					name: 'check',
					status: 'passed',
					counts: { tests: { passed: 1056, failed: 0, skipped: 4, total: 1060 } },
				},
				{ name: 'skills', status: 'skipped', reason: 'no npm script "skills:check"' },
			],
		})
		expect(readRecord({ root, mode: 'full' })).toBeUndefined()
	})

	it("--full in a linked worktree → dialecte-gate-full.json in that worktree's git folder, none in the main checkout's", async () => {
		const main = packageWith({ full: [{ name: 'build', run: 'true' }] })
		const linked = join(temporaryFolder('dialecte-gate-linked-'), 'linked')
		git({ root: main, args: ['worktree', 'add', '-q', '-b', 'feature', linked] })

		const result = await gate({ cwd: linked, argv: ['--full'] })

		expect(result.exitCode).toBe(0)
		expect(readRecord({ root: linked, mode: 'full' })).toMatchObject({
			mode: 'full',
			steps: [{ name: 'tdd' }, { name: 'build', status: 'passed' }],
		})
		expect(readRecord({ root: main, mode: 'full' })).toBeUndefined()
	})

	it('the state hash: the same tree → the same hash; a changed or an untracked file edited → another; only .dialecte/ changed → the same', async () => {
		const root = packageWith({ fast: [{ name: 'check', run: 'true' }] })
		writeFiles({ root, files: { 'README.md': 'changed\n', 'new.ts': 'export {}\n' } })
		async function hashNow(): Promise<string | undefined> {
			await gate({ cwd: root, argv: [] })
			return readRecord({ root, mode: 'fast' })?.stateHash
		}

		const first = await hashNow()
		const again = await hashNow()
		writeFiles({ root, files: { 'README.md': 'changed again\n' } })
		const changedEdited = await hashNow()
		writeFiles({ root, files: { 'new.ts': 'export const edited = 1\n' } })
		const untrackedEdited = await hashNow()
		writeFiles({ root, files: { '.dialecte/lot.json': '{}\n' } })
		const lotFileWritten = await hashNow()

		expect(first).toEqual(expect.stringMatching(SHA256_PATTERN))
		expect(again).toBe(first)
		expect(new Set([first, changedEdited, untrackedEdited]).size).toBe(3)
		expect(lotFileWritten).toBe(untrackedEdited)
	})

	it('the changes committed → the same state hash, HEAD moved; a tracked file deleted → another hash', async () => {
		const root = packageWith({ fast: [{ name: 'check', run: 'true' }] })
		writeFiles({ root, files: { 'README.md': 'changed\n', 'new.ts': 'export {}\n' } })
		await gate({ cwd: root, argv: [] })
		const uncommitted = readRecord({ root, mode: 'fast' })
		git({ root, args: ['add', '-A'] })
		git({ root, args: ['commit', '-q', '-m', 'feat: the changes'] })
		await gate({ cwd: root, argv: [] })
		const committed = readRecord({ root, mode: 'fast' })
		rmSync(join(root, 'README.md'))
		await gate({ cwd: root, argv: [] })
		const deleted = readRecord({ root, mode: 'fast' })

		expect(uncommitted?.stateHash).toEqual(expect.stringMatching(SHA256_PATTERN))
		expect(committed?.head).not.toBe(uncommitted?.head)
		expect(committed?.stateHash).toBe(uncommitted?.stateHash)
		expect(deleted?.stateHash).not.toBe(committed?.stateHash)
	})

	it('a run refused at the hygiene → nothing new recorded', async () => {
		const root = packageWith({
			fast: [{ name: 'check', run: 'true' }],
			full: [{ name: 'build', run: 'true' }],
		})
		await gate({ cwd: root, argv: [] })
		const recorded = readRecord({ root, mode: 'fast' })
		writeFileSync(join(root, 'README.md'), 'changed\n')
		git({ root, args: ['add', 'README.md'] })

		const hygiene = await gate({ cwd: root, argv: [] })

		expect(recorded).toMatchObject({ mode: 'fast', steps: [{ name: 'tdd' }, { name: 'check' }] })
		expect(hygiene.exitCode).toBe(1)
		expect(readRecord({ root, mode: 'fast' })).toEqual(recorded)
		expect(readRecord({ root, mode: 'full' })).toBeUndefined()
	})

	it('a step failing → recorded failed with its reason, the steps after it not-run', async () => {
		const root = packageWith({
			fast: [
				{ name: 'check', run: 'exit 3' },
				{ name: 'tests', run: 'echo never', counts: 'tests' },
			],
		})

		const result = await gate({ cwd: root, argv: [] })

		expect(result.exitCode).toBe(1)
		expect(readRecord({ root, mode: 'fast' })?.steps).toMatchObject([
			{ name: 'tdd', status: 'skipped' },
			{ name: 'check', status: 'failed', reason: 'exit 3' },
			{ name: 'tests', status: 'not-run' },
		])
	})
})
