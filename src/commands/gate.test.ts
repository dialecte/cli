import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { createFakeClock } from '../../test/fake-clock.ts'
import { ISO_TIME_PATTERN, SHA256_PATTERN } from '../../test/gate-records.constants.ts'
import { readRecordFile } from '../../test/gate-records.ts'
import {
	createScratchRepository,
	git,
	temporaryFolder,
	writeFiles,
} from '../../test/scratch-repository.ts'
import { createVitestPackage } from '../../test/scratch-vitest-package.ts'
import { runGate } from './gate.ts'
import { runTdd } from './tdd.ts'

import { describe, expect, it } from 'vitest'

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

/** The gate in `root`, its machine lock in a folder of the test's own: never the user's cache. */
function gate(params: {
	cwd: string
	argv: string[]
	lines?: string[]
	isAlive?: (pid: number) => boolean
	lockPath?: string
}) {
	return runGate({
		cwd: params.cwd,
		argv: params.argv,
		machineLock: {
			path: params.lockPath ?? join(temporaryFolder('dialecte-gate-lock-'), 'heavy-run.lock'),
			clock: createFakeClock(),
			write: (line) => params.lines?.push(line),
			isAlive: params.isAlive,
		},
	})
}

/** The tdd line of a package that does not test with vitest. */
const NO_VITEST_LINE = 'skip  tdd  the package does not test with vitest'

/** The hygiene note of a scratch repository made without `worktree add`. */
const NO_BASELINE_LINE =
	'ok    hygiene  no hygiene baseline (worktree not made by `dialecte worktree add`): the stash is not compared'

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
		expect(result.output).toContain('held by the hand-over /plans/commit.sh')
		expect(result.output).toContain(`delete ${join(root, '.git/dialecte-handover.lock')}`)
		expect(existsSync(join(root, 'ran'))).toBe(false)
	})
})

describe('runGate: hygiene and the machine lock', { timeout: 30_000 }, () => {
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

	it('--full while another live process holds the machine lock, --no-wait → refused naming it, no step run', async () => {
		const root = packageWith({ full: [{ name: 'build', run: 'touch ran' }] })
		const lockPath = join(temporaryFolder('dialecte-gate-lock-'), 'heavy-run.lock')
		writeFileSync(
			lockPath,
			JSON.stringify({
				pid: 1111,
				command: 'dialecte gate --full in /elsewhere',
				startedAt: '2026-10-29T10:00:00.000Z',
			}),
		)

		const result = await gate({
			cwd: root,
			argv: ['--full', '--no-wait'],
			lockPath,
			isAlive: () => true,
		})

		expect(result.exitCode).toBe(1)
		expect(result.output.split('\n').slice(0, 2)).toEqual([
			'FAIL  machine lock  the machine lock is held (--no-wait): pid 1111 runs "dialecte gate --full in /elsewhere" since 2026-10-29T10:00:00.000Z',
			'--    tdd  not run: an earlier step failed',
		])
		expect(existsSync(join(root, 'ran'))).toBe(false)
	})

	it('--full → the lock held while the steps run (with this gate as holder), released after', async () => {
		const lockPath = join(temporaryFolder('dialecte-gate-lock-'), 'heavy-run.lock')
		const root = packageWith({
			full: [{ name: 'build', run: `cat ${JSON.stringify(lockPath)} > seen.json` }],
		})

		const result = await gate({ cwd: root, argv: ['--full'], lockPath })
		expect(result.exitCode).toBe(0)

		expect(JSON.parse(readFileSync(join(root, 'seen.json'), 'utf8'))).toMatchObject({
			pid: process.pid,
			command: `dialecte gate --full in ${root}`,
		})
		expect(existsSync(lockPath)).toBe(false)
	})

	it('--fast: a heavy step takes the lock, a light one does not', async () => {
		const lockPath = join(temporaryFolder('dialecte-gate-lock-'), 'heavy-run.lock')
		const probe = `test -f ${JSON.stringify(lockPath)} && echo held || echo free`
		const root = packageWith({
			fast: [
				{ name: 'light', run: `{ ${probe}; } > light.txt` },
				{ name: 'browser', run: `{ ${probe}; } > browser.txt`, heavy: true },
			],
		})

		const result = await gate({ cwd: root, argv: [], lockPath })
		expect(result.exitCode).toBe(0)

		expect(readFileSync(join(root, 'light.txt'), 'utf8').trim()).toBe('free')
		expect(readFileSync(join(root, 'browser.txt'), 'utf8').trim()).toBe('held')
	})
})

describe('runGate: a package whose tests run in a browser', { timeout: 30_000 }, () => {
	/** A package shaped like core: its unit project runs in chromium through @vitest/browser-playwright. */
	function browserPackage(params: { lockPath: string; browser: boolean }): string {
		const probe = `test -f ${JSON.stringify(params.lockPath)} && echo held || echo free`
		return createScratchRepository({
			'package.json': JSON.stringify({
				name: 'demo',
				devDependencies: params.browser
					? { '@vitest/browser-playwright': '^4.1.10', vitest: '^4.1.8' }
					: { vitest: '^4.1.8' },
				dialecte: {
					gate: {
						fast: [
							{
								name: 'tests',
								run: `{ ${probe}; } > tests.txt; printf ' Tests  1 passed (1)\\n'`,
								counts: 'tests',
							},
						],
					},
				},
			}),
			'vitest.config.ts': params.browser
				? "export default { test: { projects: [{ test: { name: 'unit', browser: createBrowser() } }] } }\n"
				: "export default { test: { environment: 'node' } }\n",
		})
	}

	it('the test step of a package running its tests in a browser → holds the machine lock; a node-only package → does not', async () => {
		const lockPath = join(temporaryFolder('dialecte-gate-lock-'), 'heavy-run.lock')
		const browser = browserPackage({ lockPath, browser: true })
		const node = browserPackage({ lockPath, browser: false })

		const browserResult = await gate({ cwd: browser, argv: [], lockPath })
		expect(browserResult.exitCode).toBe(0)
		const nodeResult = await gate({ cwd: node, argv: [], lockPath })
		expect(nodeResult.exitCode).toBe(0)

		expect(readFileSync(join(browser, 'tests.txt'), 'utf8').trim()).toBe('held')
		expect(readFileSync(join(node, 'tests.txt'), 'utf8').trim()).toBe('free')
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

	it('a node-only package, the machine lock held by another live process → the tdd step does not take it', async () => {
		const root = await redThenGreen()
		const lockPath = join(temporaryFolder('dialecte-gate-lock-'), 'heavy-run.lock')
		writeFileSync(
			lockPath,
			JSON.stringify({ pid: 1111, command: 'elsewhere', startedAt: '2026-10-29T10:00:00.000Z' }),
		)

		const result = await gate({
			cwd: root,
			argv: ['--declare', 'src/', '--no-wait'],
			lockPath,
			isAlive: () => true,
		})

		expect(result.output.split('\n')[1]).toBe(
			'ok    tdd  1 case(s) of the change: 1 red then green',
		)
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

	it('a run refused at the hygiene or at the machine lock → nothing new recorded', async () => {
		const root = packageWith({
			fast: [{ name: 'check', run: 'true' }],
			full: [{ name: 'build', run: 'true' }],
		})
		await gate({ cwd: root, argv: [] })
		const recorded = readRecord({ root, mode: 'fast' })
		writeFileSync(join(root, 'README.md'), 'changed\n')
		git({ root, args: ['add', 'README.md'] })
		const lockPath = join(temporaryFolder('dialecte-gate-lock-'), 'heavy-run.lock')
		writeFileSync(
			lockPath,
			JSON.stringify({ pid: 1111, command: 'elsewhere', startedAt: '2026-10-29T10:00:00.000Z' }),
		)

		const hygiene = await gate({ cwd: root, argv: [] })
		const locked = await gate({
			cwd: root,
			argv: ['--full', '--no-wait'],
			lockPath,
			isAlive: () => true,
		})

		expect(recorded).toMatchObject({ mode: 'fast', steps: [{ name: 'tdd' }, { name: 'check' }] })
		expect([hygiene.exitCode, locked.exitCode]).toEqual([1, 1])
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
