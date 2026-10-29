import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { createFakeClock } from '../../test/fake-clock.ts'
import { createScratchRepository, git, temporaryFolder } from '../../test/scratch-repository.ts'
import { runGate } from './gate.ts'

import { describe, expect, it } from 'vitest'

import type { GateStep } from '../lib/gate/gate-config.types.ts'

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

/** The hygiene note of a scratch repository made without `worktree add`. */
const NO_BASELINE_LINE =
	'ok    hygiene  no hygiene baseline (worktree not made by `dialecte worktree add`): the stash is not compared'

describe('runGate', { timeout: 30_000 }, () => {
	it('a step whose output says passed but exits non-zero → failed, the next step not run', () => {
		const root = packageWith({
			fast: [
				{ name: 'check', run: `printf ' Tests  4 passed (4)\\n'; exit 3` },
				{ name: 'tests', run: 'echo never', counts: 'tests' },
			],
		})

		const result = gate({ cwd: root, argv: [] })

		expect(result.exitCode).toBe(1)
		expect(result.output.split('\n').slice(0, 4)).toEqual([
			NO_BASELINE_LINE,
			'FAIL  check  exit 3  tests 4 passed / 4',
			'--    tests  not run: an earlier step failed',
			'gate --fast: failed at check',
		])
	})

	it('a docs build rewrote a declared generated file → restored byte-exact, even when the step fails', () => {
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

		const result = gate({ cwd: root, argv: ['--full'] })

		expect(readFileSync(join(root, 'doc/data/catalog.json')).equals(original)).toBe(true)
		expect(result.output.split('\n')[0]).toBe('FAIL  docs  exit 1  restored doc/data/catalog.json')
	})

	it('a test step that counts no test, or exits 0 with a failed test → failed', () => {
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

		expect(gate({ cwd: silent, argv: [] }).output.split('\n')[1]).toBe(
			'FAIL  tests  exit 0  no test ran',
		)
		expect(gate({ cwd: failing, argv: [] }).output.split('\n')[1]).toBe(
			'FAIL  tests  exit 0  tests 3 passed, 1 failed / 4  1 test(s) failed',
		)
	})

	it('an npm script the package lacks → skipped; the rest green → exit 0 with the counts', () => {
		const root = packageWith({
			scripts: { check: `printf 'Found 0 warnings and 0 errors.\n'` },
			fast: [
				{ name: 'check', run: 'npm run check' },
				{ name: 'skills', run: 'npm run skills:check' },
			],
		})

		expect(gate({ cwd: root, argv: [] })).toEqual({
			exitCode: 0,
			output: [
				NO_BASELINE_LINE,
				'ok    check  exit 0  0 error(s), 0 warning(s)',
				'skip  skills  no npm script "skills:check"',
				'gate --fast: green',
			].join('\n'),
		})
	})

	it('a hand-over script holds the repository → refused, no step run', () => {
		const root = packageWith({ fast: [{ name: 'check', run: 'touch ran' }] })
		writeFileSync(join(root, '.git/dialecte-handover.lock'), '/plans/commit.sh\n')

		const result = gate({ cwd: root, argv: [] })

		expect(result.exitCode).toBe(1)
		expect(result.output).toContain('held by the hand-over /plans/commit.sh')
		expect(result.output).toContain(`delete ${join(root, '.git/dialecte-handover.lock')}`)
		expect(existsSync(join(root, 'ran'))).toBe(false)
	})
})

describe('runGate: hygiene and the machine lock', { timeout: 30_000 }, () => {
	it('--fast with a staged file → hygiene fails first with how to look, no step run', () => {
		const root = packageWith({ fast: [{ name: 'check', run: 'touch ran' }] })
		writeFileSync(join(root, 'README.md'), 'changed\n')
		git({ root, args: ['add', 'README.md'] })

		const result = gate({ cwd: root, argv: [] })

		expect(result.exitCode).toBe(1)
		expect(result.output.split('\n')).toEqual([
			expect.stringMatching(/^FAIL  hygiene  1 file\(s\) staged: README\.md  no hygiene baseline/),
			'--    check  not run: an earlier step failed',
			'gate --fast: failed at hygiene',
			'--- last lines of hygiene ---',
			'look (read-only):',
			`  git -C '${root}' diff --cached --stat`,
		])
		expect(existsSync(join(root, 'ran'))).toBe(false)
	})

	it('--fast with a new file declared → no warning; not declared → a warning, still green', () => {
		const root = packageWith({ fast: [{ name: 'check', run: 'true' }] })
		writeFileSync(join(root, 'new.ts'), 'export {}\n')

		const declared = gate({ cwd: root, argv: ['--declare', 'new.ts'] })
		const undeclared = gate({ cwd: root, argv: [] })

		expect(declared.output.split('\n')[0]).toBe(NO_BASELINE_LINE)
		expect(undeclared.exitCode).toBe(0)
		expect(undeclared.output.split('\n')[0]).toContain(
			'warning: 1 new file(s) the change did not declare (--declare <path>): new.ts',
		)
	})

	it('--full while another live process holds the machine lock, --no-wait → refused naming it, no step run', () => {
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

		const result = gate({ cwd: root, argv: ['--full', '--no-wait'], lockPath, isAlive: () => true })

		expect(result.exitCode).toBe(1)
		expect(result.output.split('\n').slice(0, 2)).toEqual([
			'FAIL  machine lock  the machine lock is held (--no-wait): pid 1111 runs "dialecte gate --full in /elsewhere" since 2026-10-29T10:00:00.000Z',
			'--    build  not run: an earlier step failed',
		])
		expect(existsSync(join(root, 'ran'))).toBe(false)
	})

	it('--full → the lock held while the steps run (with this gate as holder), released after', () => {
		const lockPath = join(temporaryFolder('dialecte-gate-lock-'), 'heavy-run.lock')
		const root = packageWith({
			full: [{ name: 'build', run: `cat ${JSON.stringify(lockPath)} > seen.json` }],
		})

		expect(gate({ cwd: root, argv: ['--full'], lockPath }).exitCode).toBe(0)

		expect(JSON.parse(readFileSync(join(root, 'seen.json'), 'utf8'))).toMatchObject({
			pid: process.pid,
			command: `dialecte gate --full in ${root}`,
		})
		expect(existsSync(lockPath)).toBe(false)
	})

	it('--fast: a heavy step takes the lock, a light one does not', () => {
		const lockPath = join(temporaryFolder('dialecte-gate-lock-'), 'heavy-run.lock')
		const probe = `test -f ${JSON.stringify(lockPath)} && echo held || echo free`
		const root = packageWith({
			fast: [
				{ name: 'light', run: `{ ${probe}; } > light.txt` },
				{ name: 'browser', run: `{ ${probe}; } > browser.txt`, heavy: true },
			],
		})

		expect(gate({ cwd: root, argv: [], lockPath }).exitCode).toBe(0)

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

	it('the test step of a package running its tests in a browser → holds the machine lock; a node-only package → does not', () => {
		const lockPath = join(temporaryFolder('dialecte-gate-lock-'), 'heavy-run.lock')
		const browser = browserPackage({ lockPath, browser: true })
		const node = browserPackage({ lockPath, browser: false })

		expect(gate({ cwd: browser, argv: [], lockPath }).exitCode).toBe(0)
		expect(gate({ cwd: node, argv: [], lockPath }).exitCode).toBe(0)

		expect(readFileSync(join(browser, 'tests.txt'), 'utf8').trim()).toBe('held')
		expect(readFileSync(join(node, 'tests.txt'), 'utf8').trim()).toBe('free')
	})
})
