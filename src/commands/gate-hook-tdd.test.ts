/**
 * `gate --hook` of a package declaring `dialecte.gate.hook`: the tdd receipts of the lot first (measured from the lot
 * base), then the declared steps; no test suite. Without a declared hook list, no tdd step.
 */
import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { writeStoreLot } from '../../test/brief-workspace.ts'
import { runHookIn } from '../../test/gate-hook.ts'
import { createStartWorkspace, entriesOf } from '../../test/lot-start-workspace.ts'
import { countRuns, countingStep, createCounter } from '../../test/scratch-checks.ts'
import { cloneRepository, git, temporaryFolder, writeFiles } from '../../test/scratch-repository.ts'
import { VITEST_FOLDER } from '../../test/scratch-vitest-package.constants.ts'
import { createVitestPackage } from '../../test/scratch-vitest-package.ts'
import { readIdentity } from '../lib/store/identity.ts'
import { runGate } from './gate.ts'
import { runLot } from './lot.ts'
import { runTdd } from './tdd.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { GateStep } from '../lib/gate/gate-config.types.ts'

const STUB =
	"export function add(left: number, right: number): number {\n\tthrow new Error('not implemented: add')\n}\n"
const IMPLEMENTED =
	'export function add(left: number, right: number): number {\n\treturn left + right\n}\n'
const REFACTORED =
	'export function add(left: number, right: number): number {\n\treturn right + left\n}\n'
const BROKEN =
	'export function add(left: number, right: number): number {\n\treturn left - right\n}\n'
const ADD_TEST = [
	"import { add } from './add.ts'",
	"import { expect, it } from 'vitest'",
	"it('one plus two → three', () => { expect(add(1, 2)).toBe(3) })",
	'',
].join('\n')
const CASE = 'src/add.test.ts::one plus two → three'
const NEXT_STEPS =
	'the test station runs `dialecte tdd red`, the implement station `dialecte tdd green`'

/** The commit HEAD names in `root`. */
function headOf(root: string): string {
	return git({ root, args: ['rev-parse', 'HEAD'] }).trim()
}

/** The line under a stale failure: a plain green, measured from the lot base as the hook measures. */
const GREEN_AGAIN_LINE = 'run `dialecte tdd green` again'

/** A vitest package whose full gate and, when `declared`, hook list run one counting `check` step. */
function hookPackage(params: { declared: boolean }): { root: string; counter: string } {
	const counter = createCounter()
	const check: GateStep = countingStep({ counter, name: 'check' })
	const root = createVitestPackage({
		dialecte: { gate: { full: [check], ...(params.declared && { hook: [check] }) } },
	})
	return { root, counter }
}

function tdd(params: { root: string; argv: string[] }) {
	return runTdd({
		cwd: params.root,
		argv: params.argv,
		now: () => new Date('2026-11-17T12:00:00.000Z'),
	})
}

/** The test station's red, then the implement station's green, every file staged for the commit. */
async function redThenGreen(root: string): Promise<void> {
	writeFiles({ root, files: { 'src/add.ts': STUB, 'src/add.test.ts': ADD_TEST } })
	await tdd({ root, argv: ['red'] })
	writeFileSync(join(root, 'src/add.ts'), IMPLEMENTED)
	await tdd({ root, argv: ['green'] })
	git({ root, args: ['add', '-A'] })
}

describe('gate --hook: the tdd receipts of the commit', { timeout: 240_000 }, () => {
	it('the cases red then green, the working files the commit → ok tdd, then the declared step', async () => {
		const { root, counter } = hookPackage({ declared: true })
		await redThenGreen(root)

		const result = await runHookIn({ cwd: root })

		expect(result.exitCode).toBe(0)
		const lines = result.output.split('\n')
		expect(lines[0]).toBe('ok    tdd  1 case(s) of the change: 1 red then green')
		expect(lines.at(-1)).toBe('gate --hook: green')
		expect(countRuns(counter)).toBe(1)
	})

	it('a production file changed after the green → FAIL tdd naming the stale case, no declared step', async () => {
		const { root, counter } = hookPackage({ declared: true })
		await redThenGreen(root)
		writeFileSync(join(root, 'src/add.ts'), REFACTORED)
		git({ root, args: ['add', '-A'] })

		const result = await runHookIn({ cwd: root })

		expect(result.exitCode).toBe(1)
		expect(result.output.split('\n')).toEqual([
			'FAIL  tdd  1 case(s) of the lot not proven at the production committed',
			'gate --hook: failed at tdd',
			'--- last lines of tdd ---',
			`stale  ${CASE}`,
			GREEN_AGAIN_LINE,
		])
		expect(countRuns(counter)).toBe(0)
	})

	it('tdd green run again after that change → the hook passes', async () => {
		const { root, counter } = hookPackage({ declared: true })
		await redThenGreen(root)
		writeFileSync(join(root, 'src/add.ts'), REFACTORED)
		await tdd({ root, argv: ['green'] })
		git({ root, args: ['add', '-A'] })

		const result = await runHookIn({ cwd: root })

		expect(result.exitCode).toBe(0)
		expect(result.output.split('\n')[0]).toBe(
			'ok    tdd  1 case(s) of the change: 1 red then green',
		)
		expect(countRuns(counter)).toBe(1)
	})

	it('a staged test file never proven red → FAIL tdd: test code changed outside tdd red', async () => {
		const { root, counter } = hookPackage({ declared: true })
		writeFiles({ root, files: { 'src/add.ts': IMPLEMENTED, 'src/add.test.ts': ADD_TEST } })
		git({ root, args: ['add', '-A'] })

		const result = await runHookIn({ cwd: root })

		expect(result.exitCode).toBe(1)
		expect(result.output.split('\n')).toEqual([
			'FAIL  tdd  test code changed outside tdd red: src/add.test.ts',
			'gate --hook: failed at tdd',
			'--- last lines of tdd ---',
			`missing receipt  ${CASE}`,
			NEXT_STEPS,
		])
		expect(countRuns(counter)).toBe(0)
	})

	it('no declared hook list → no tdd step: a test file never proven red commits on the steps', async () => {
		const { root, counter } = hookPackage({ declared: false })
		writeFiles({ root, files: { 'src/add.ts': IMPLEMENTED, 'src/add.test.ts': ADD_TEST } })
		git({ root, args: ['add', '-A'] })

		const result = await runHookIn({ cwd: root })

		expect(result.exitCode).toBe(0)
		expect(result.output).not.toContain('tdd')
		expect(countRuns(counter)).toBe(1)
	})
})

describe('gate --hook: the cases of the whole lot', { timeout: 240_000 }, () => {
	/** A package on main, a lot branch cut from it with one commit: tests and code, red then green. */
	async function lotWithGreenCommit(): Promise<{ root: string; counter: string; base: string }> {
		const { root, counter } = hookPackage({ declared: true })
		const base = headOf(root)
		git({ root, args: ['checkout', '-q', '-b', 'lot'] })
		await redThenGreen(root)
		git({ root, args: ['commit', '-q', '--no-verify', '-m', 'tests and code'] })
		return { root, counter, base }
	}

	it('a production-only commit after a green commit (a refactor breaking add) → FAIL tdd naming the lot case, measured from the lot base', async () => {
		const { root, counter } = await lotWithGreenCommit()
		writeFileSync(join(root, 'src/add.ts'), BROKEN)
		git({ root, args: ['add', '-A'] })

		const result = await runHookIn({ cwd: root })

		expect(result.exitCode).toBe(1)
		expect(result.output.split('\n')).toEqual([
			'FAIL  tdd  1 case(s) of the lot not proven at the production committed',
			'gate --hook: failed at tdd',
			'--- last lines of tdd ---',
			`stale  ${CASE}`,
			GREEN_AGAIN_LINE,
		])
		expect(countRuns(counter)).toBe(0)
	})

	it('a production-only commit after a green commit, tdd green over the lot run again → the hook passes', async () => {
		const { root, counter, base } = await lotWithGreenCommit()
		writeFileSync(join(root, 'src/add.ts'), REFACTORED)
		await tdd({ root, argv: ['green', '--base', base] })
		git({ root, args: ['add', '-A'] })

		const result = await runHookIn({ cwd: root })

		expect(result.exitCode).toBe(0)
		expect(result.output.split('\n')[0]).toBe(
			'ok    tdd  1 case(s) of the change: 1 red then green',
		)
		expect(countRuns(counter)).toBe(1)
	})
})

describe(
	'gate --hook: what the tdd step leaves alone or refuses up front',
	{ timeout: 240_000 },
	() => {
		it('a commit with no test change (docs, changes/, config) → ok tdd, the declared step runs', async () => {
			const { root, counter } = hookPackage({ declared: true })
			writeFiles({
				root,
				files: { 'README.md': '# demo\n', 'changes/demo.md': '### Added\n\n- demo\n' },
			})
			git({ root, args: ['add', '-A'] })

			const result = await runHookIn({ cwd: root })

			expect(result.exitCode).toBe(0)
			expect(result.output.split('\n')[0]).toBe(
				'ok    tdd  no test code new or changed since the base',
			)
			expect(countRuns(counter)).toBe(1)
		})

		it.each([
			{
				label: 'a production file edited and not staged',
				edit: (root: string) => writeFileSync(join(root, 'src/add.ts'), REFACTORED),
				paths: 'src/add.ts',
			},
			{
				label: 'an untracked production file',
				edit: (root: string) => writeFiles({ root, files: { 'src/extra.ts': 'export {}\n' } }),
				paths: 'src/extra.ts',
			},
			{
				label: 'a staged test file edited again in the working files',
				edit: (root: string) =>
					writeFileSync(join(root, 'src/add.test.ts'), `${ADD_TEST}// more\n`),
				paths: 'src/add.test.ts',
			},
		])('$label → FAIL tdd naming the paths, no declared step', async ({ edit, paths }) => {
			const { root, counter } = hookPackage({ declared: true })
			await redThenGreen(root)
			edit(root)

			const result = await runHookIn({ cwd: root })

			expect(result.exitCode).toBe(1)
			expect(result.output.split('\n')).toEqual([
				`FAIL  tdd  the working files are not the commit: ${paths}`,
				'gate --hook: failed at tdd',
				'--- last lines of tdd ---',
				'the receipts prove the working files: commit them, or set the rest aside (git stash push --keep-index --include-untracked)',
			])
			expect(countRuns(counter)).toBe(0)
		})

		it('a first commit (no HEAD yet) → tdd skipped with its reason, the declared step runs', async () => {
			const { root, counter } = hookPackage({ declared: true })
			git({ root, args: ['update-ref', '-d', 'HEAD'] })
			writeFiles({ root, files: { 'src/add.ts': IMPLEMENTED, 'src/add.test.ts': ADD_TEST } })
			git({ root, args: ['add', '-A'] })

			const result = await runHookIn({ cwd: root })

			expect(result.exitCode).toBe(0)
			expect(result.output.split('\n')[0]).toBe(
				'skip  tdd  a first commit: no receipt can be taken before one, CI runs the suite',
			)
			expect(countRuns(counter)).toBe(1)
		})

		it('a merge commit → tdd skipped with its reason, the declared step runs', async () => {
			const { root, counter } = hookPackage({ declared: true })
			git({ root, args: ['checkout', '-q', '-b', 'side'] })
			writeFiles({ root, files: { 'src/add.ts': IMPLEMENTED, 'src/add.test.ts': ADD_TEST } })
			git({ root, args: ['add', '-A'] })
			git({ root, args: ['commit', '-q', '--no-verify', '-m', 'side'] })
			git({ root, args: ['checkout', '-q', '-'] })
			git({ root, args: ['merge', '-q', '--no-ff', '--no-commit', 'side'] })

			const result = await runHookIn({ cwd: root })

			expect(result.exitCode).toBe(0)
			expect(result.output.split('\n')[0]).toBe(
				'skip  tdd  a merge commit: its cases were proven on their branches, CI runs the merged suite',
			)
			expect(countRuns(counter)).toBe(1)
		})
	},
)

describe(
	'gate --hook: every closed case proven at the production committed',
	{ timeout: 240_000 },
	() => {
		/** Fails the base's first case on its assertion, production untouched. */
		const FAIL_VARIABLE = 'GATE_HOOK_TDD_FAIL'
		/** Fails the base's first case on an error of its own, outside any assertion. */
		const THROW_VARIABLE = 'GATE_HOOK_TDD_THROW'
		const ONE_PROJECT_CONFIG = [
			"import { defineConfig } from 'vitest/config'",
			"export default defineConfig({ test: { projects: [{ test: { name: 'unit', include: ['src/**/*.test.ts'] } }] } })",
			'',
		].join('\n')
		const BASE_TEST = [
			"import { add } from './add.ts'",
			"import { expect, it } from 'vitest'",
			`it('one plus two → three', () => { if (process.env.${THROW_VARIABLE}) throw new Error('boom'); expect(process.env.${FAIL_VARIABLE} ? 0 : add(1, 2)).toBe(3) })`,
			"it('zero plus zero → zero', () => { expect(add(0, 0)).toBe(0) })",
			'',
		].join('\n')
		const REVISED_TEST = BASE_TEST.replace(
			'expect(add(0, 0)).toBe(0) })',
			'expect(add(0, 0)).toBe(0); expect(add(0, 1)).toBe(1) })',
		)
		const ACCEPTED_TEXT = "it('two plus two → four', () => { expect(add(2, 2)).toBe(4) })\n"
		const SUB_STUB =
			"export function sub(left: number, right: number): number {\n\tthrow new Error('not implemented: sub')\n}\n"
		const SUB =
			'export function sub(left: number, right: number): number {\n\treturn left - right\n}\n'
		const SUB_TEXT = "it('three minus one → two', () => { expect(sub(3, 1)).toBe(2) })\n"
		/** The label of a case of `src/add.test.ts` in the one project. */
		function unitCase(name: string): string {
			return `src/add.test.ts::${name} [unit]`
		}
		const UNCHANGED = unitCase('one plus two → three')
		const REVISED = unitCase('zero plus zero → zero')
		const ACCEPTED = unitCase('two plus two → four')
		/** The first line of the hook's tdd failure for `count` cases not proven. */
		function staleReason(count: number): string {
			return `FAIL  tdd  ${count} case(s) of the lot not proven at the production committed`
		}

		/** A package on main holding `add`, its two cases and `files`, its full gate and hook running one counting step. */
		function basePackage(files: Record<string, string> = {}): string {
			const check: GateStep = countingStep({ counter: createCounter(), name: 'check' })
			return createVitestPackage({
				dialecte: { gate: { full: [check], hook: [check] } },
				files: { 'src/add.ts': IMPLEMENTED, 'src/add.test.ts': BASE_TEST, ...files },
			})
		}

		/** A lot holding an unchanged, a revised and an accepted case of one project, proven by one red at the base's production. */
		async function testOnlyLot(): Promise<string> {
			const root = basePackage({ 'vitest.config.ts': ONE_PROJECT_CONFIG })
			writeFiles({
				root,
				files: {
					'src/add.test.ts': `${REVISED_TEST}${ACCEPTED_TEXT}`,
					'.dialecte/lot.json': JSON.stringify({
						revised: [{ case: REVISED, reason: 'the review asked for one more' }],
						accept: [{ case: ACCEPTED, reason: 'add answers it already' }],
					}),
				},
			})
			await tdd({ root, argv: ['red'] })
			return root
		}

		afterEach(() => {
			vi.unstubAllEnvs()
		})

		it('an unchanged, a revised and an accepted case proven before a production change → FAIL tdd naming each stale', async () => {
			const root = await testOnlyLot()
			writeFileSync(join(root, 'src/add.ts'), REFACTORED)
			git({ root, args: ['add', '-A'] })

			const result = await runHookIn({ cwd: root })

			expect(result.output.split('\n')).toEqual([
				staleReason(3),
				'gate --hook: failed at tdd',
				'--- last lines of tdd ---',
				`stale  ${UNCHANGED}`,
				`stale  ${REVISED}`,
				`stale  ${ACCEPTED}`,
				GREEN_AGAIN_LINE,
			])
		})

		it('the same, tdd green run after the production change → the hook passes', async () => {
			const root = await testOnlyLot()
			writeFileSync(join(root, 'src/add.ts'), REFACTORED)
			await tdd({ root, argv: ['green'] })
			git({ root, args: ['add', '-A'] })

			const result = await runHookIn({ cwd: root })

			expect({ exitCode: result.exitCode, first: result.output.split('\n')[0] }).toEqual({
				exitCode: 0,
				first: 'ok    tdd  3 case(s) of the change: 1 unchanged, 1 accepted, 1 revised',
			})
		})

		it('a green naming one case → the cases it did not name stay stale', async () => {
			const root = await testOnlyLot()
			writeFileSync(join(root, 'src/add.ts'), REFACTORED)
			await tdd({ root, argv: ['green', 'src/add.test.ts::one plus two → three'] })
			git({ root, args: ['add', '-A'] })

			const result = await runHookIn({ cwd: root })

			expect(result.output.split('\n')).toEqual([
				staleReason(2),
				'gate --hook: failed at tdd',
				'--- last lines of tdd ---',
				`stale  ${REVISED}`,
				`stale  ${ACCEPTED}`,
				GREEN_AGAIN_LINE,
			])
		})

		it('a case refused at green at the production committed → FAIL tdd: its last run refused; a passing green clears it', async () => {
			const root = await testOnlyLot()
			writeFileSync(join(root, 'src/add.ts'), REFACTORED)
			vi.stubEnv(FAIL_VARIABLE, '1')
			await tdd({ root, argv: ['green'] })
			vi.unstubAllEnvs()
			git({ root, args: ['add', '-A'] })

			const refused = await runHookIn({ cwd: root })
			await tdd({ root, argv: ['green'] })
			const cleared = await runHookIn({ cwd: root })

			expect({ refused: refused.output.split('\n'), cleared: cleared.exitCode }).toEqual({
				refused: [
					staleReason(1),
					'gate --hook: failed at tdd',
					'--- last lines of tdd ---',
					`refused  ${UNCHANGED}  its last run refused`,
					GREEN_AGAIN_LINE,
				],
				cleared: 0,
			})
		})

		it('a case red refused (an error of its own) while it keeps its unchanged proof → FAIL tdd: its last run refused', async () => {
			const root = await testOnlyLot()
			vi.stubEnv(THROW_VARIABLE, '1')
			await tdd({ root, argv: ['red'] })
			vi.unstubAllEnvs()
			git({ root, args: ['add', '-A'] })

			const result = await runHookIn({ cwd: root })

			expect(result.output.split('\n')).toEqual([
				staleReason(1),
				'gate --hook: failed at tdd',
				'--- last lines of tdd ---',
				`refused  ${UNCHANGED}  its last run refused`,
				GREEN_AGAIN_LINE,
			])
		})

		it('no production change since the red, no moved file → the hook passes without a green', async () => {
			const root = await testOnlyLot()
			git({ root, args: ['add', '-A'] })

			const result = await runHookIn({ cwd: root })

			expect(result.exitCode).toBe(0)
		})

		it('a case copied to a new file (its red refused it: nothing moved yet), then moved by a later red of its source alone → FAIL tdd: unproven, naming tdd red; a plain green leaves it so; its red clears it', async () => {
			const root = basePackage()
			const [imports, , first, second] = BASE_TEST.split('\n')
			writeFiles({
				root,
				files: {
					'src/more.test.ts': [
						imports,
						"import { sub } from './sub.ts'",
						"import { expect, it } from 'vitest'",
						second,
						SUB_TEXT,
					].join('\n'),
					'src/sub.ts': SUB_STUB,
				},
			})
			await tdd({ root, argv: ['red'] })
			writeFiles({
				root,
				files: {
					'src/add.test.ts': [imports, "import { expect, it } from 'vitest'", first, ''].join('\n'),
				},
			})
			await tdd({ root, argv: ['red', 'src/add.test.ts'] })
			writeFileSync(join(root, 'src/sub.ts'), SUB)
			await tdd({ root, argv: ['green'] })
			git({ root, args: ['add', '-A'] })

			const unproven = await runHookIn({ cwd: root })
			await tdd({ root, argv: ['red'] })
			const cleared = await runHookIn({ cwd: root })

			expect({ unproven: unproven.output.split('\n'), cleared: cleared.exitCode }).toEqual({
				unproven: [
					staleReason(1),
					'gate --hook: failed at tdd',
					'--- last lines of tdd ---',
					'unproven  src/more.test.ts::zero plus zero → zero  run dialecte tdd red',
				],
				cleared: 0,
			})
		})

		it('a production file no case depends on, changed after the green → every case of the lot stale; one green clears them', async () => {
			const root = basePackage()
			writeFiles({
				root,
				files: {
					'src/add.test.ts': `${BASE_TEST}import { sub } from './sub.ts'\n${SUB_TEXT}`,
					'src/sub.ts': SUB_STUB,
				},
			})
			await tdd({ root, argv: ['red'] })
			writeFileSync(join(root, 'src/sub.ts'), SUB)
			await tdd({ root, argv: ['green'] })
			writeFiles({ root, files: { 'src/other.ts': 'export const other = 1\n' } })
			git({ root, args: ['add', '-A'] })

			const stale = await runHookIn({ cwd: root })
			await tdd({ root, argv: ['green'] })
			const cleared = await runHookIn({ cwd: root })

			expect({ stale: stale.output.split('\n'), cleared: cleared.exitCode }).toEqual({
				stale: [
					staleReason(3),
					'gate --hook: failed at tdd',
					'--- last lines of tdd ---',
					'stale  src/add.test.ts::one plus two → three',
					'stale  src/add.test.ts::zero plus zero → zero',
					'stale  src/add.test.ts::three minus one → two',
					GREEN_AGAIN_LINE,
				],
				cleared: 0,
			})
		})

		it('a lot whose only test change is a file moved with its bytes, production changed → its cases stale until one green; gate --full lists them', async () => {
			const root = basePackage()
			git({ root, args: ['mv', 'src/add.test.ts', 'src/sum.test.ts'] })
			writeFileSync(join(root, 'src/add.ts'), REFACTORED)
			git({ root, args: ['add', '-A'] })

			const stale = await runHookIn({ cwd: root })
			const full = await runGate({ cwd: root, argv: ['--full', '--declare', 'src/'] })
			await tdd({ root, argv: ['green'] })
			const cleared = await runHookIn({ cwd: root })

			expect({
				stale: stale.output.split('\n'),
				full: full.output.split('\n').find((line) => /^(ok|FAIL) +tdd /.test(line)),
				cleared: cleared.exitCode,
			}).toEqual({
				stale: [
					staleReason(2),
					'gate --hook: failed at tdd',
					'--- last lines of tdd ---',
					'stale  src/sum.test.ts::one plus two → three',
					'stale  src/sum.test.ts::zero plus zero → zero',
					GREEN_AGAIN_LINE,
				],
				full: 'ok    tdd  2 case(s) of the change: 2 unchanged',
				cleared: 0,
			})
		})

		it('a second step adding only an accepted case, no production change → the unchanged case of that file is stale; one green clears it', async () => {
			const root = basePackage()
			const second = "it('three plus three → six', () => { expect(add(3, 3)).toBe(6) })\n"
			writeFiles({
				root,
				files: {
					'src/add.test.ts': `${BASE_TEST}${ACCEPTED_TEXT}`,
					'.dialecte/lot.json': JSON.stringify({
						accept: [{ case: 'src/add.test.ts::two plus two → four', reason: 'add answers it' }],
					}),
				},
			})
			await tdd({ root, argv: ['red'] })
			writeFiles({
				root,
				files: {
					'src/add.test.ts': `${BASE_TEST}${ACCEPTED_TEXT}${second}`,
					'.dialecte/lot.json': JSON.stringify({
						accept: [
							{ case: 'src/add.test.ts::two plus two → four', reason: 'add answers it' },
							{ case: 'src/add.test.ts::three plus three → six', reason: 'add answers it' },
						],
					}),
				},
			})
			await tdd({ root, argv: ['red'] })
			git({ root, args: ['add', '-A'] })

			const stale = await runHookIn({ cwd: root })
			await tdd({ root, argv: ['green'] })
			const cleared = await runHookIn({ cwd: root })

			expect({ stale: stale.output.split('\n'), cleared: cleared.exitCode }).toEqual({
				stale: [
					staleReason(2),
					'gate --hook: failed at tdd',
					'--- last lines of tdd ---',
					'stale  src/add.test.ts::one plus two → three',
					'stale  src/add.test.ts::zero plus zero → zero',
					GREEN_AGAIN_LINE,
				],
				cleared: 0,
			})
		})
	},
)

describe('gate --hook: a module mock refused at red', { timeout: 240_000 }, () => {
	/** CI runs the node project, which shares modules between files (forks, isolate false). */
	const SHARING_CONFIG = [
		"import { defineConfig } from 'vitest/config'",
		"export default defineConfig({ test: { projects: [{ test: { name: 'node', include: ['src/**/*.test.ts'], isolate: false, pool: 'forks' } }] } })",
		'',
	].join('\n')
	const NODE_WORKFLOW = [
		'name: _test',
		'',
		'on:',
		'  workflow_call:',
		'',
		'jobs:',
		'  test:',
		'    runs-on: ubuntu-24.04',
		'    steps:',
		'      - uses: actions/checkout@v6',
		'      - name: Run Tests',
		'        run: npx vitest run --project node',
		'',
	].join('\n')
	const MOCKING_TEST = [
		"import { add } from './add.ts'",
		"import { expect, it, vi } from 'vitest'",
		"vi.mock('./log.ts', () => ({ log: () => '' }))",
		"it('one plus two → three', () => { expect(add(1, 2)).toBe(3) })",
		'',
	].join('\n')

	it('a staged vi.mock file refused at red, production implemented → FAIL tdd: test code changed outside tdd red, no declared step', async () => {
		const counter = createCounter()
		const check: GateStep = countingStep({ counter, name: 'check' })
		const root = createVitestPackage({
			dialecte: { gate: { full: [check], hook: [check] } },
			files: {
				'vitest.config.ts': SHARING_CONFIG,
				'.github/workflows/_test.yml': NODE_WORKFLOW,
				'src/log.ts': 'export function log(message: string): string {\n\treturn message\n}\n',
			},
		})
		writeFiles({ root, files: { 'src/add.ts': STUB, 'src/add.test.ts': MOCKING_TEST } })
		const red = await tdd({ root, argv: ['red'] })
		writeFileSync(join(root, 'src/add.ts'), IMPLEMENTED)
		git({ root, args: ['add', '-A'] })

		const result = await runHookIn({ cwd: root })

		expect({
			redExitCode: red.exitCode,
			exitCode: result.exitCode,
			first: result.output.split('\n')[0],
			runs: countRuns(counter),
		}).toEqual({
			redExitCode: 1,
			exitCode: 1,
			first: 'FAIL  tdd  test code changed outside tdd red: src/add.test.ts',
			runs: 0,
		})
	})
})

const STACKED_NOW = new Date('2026-11-17T21:00:00.000Z')
const PARENT = '0005-repo-parent'
const PARENT_BRANCH = 'feat/parent'
/** A test file of one passing case named `name`. */
function passingTestOf(name: string): string {
	return `import { expect, it } from 'vitest'\nit('${name}', () => { expect(1).toBe(1) })\n`
}
const CHILD_STUB =
	"export function twice(value: number): number {\n\tthrow new Error('not implemented: twice')\n}\n"
const CHILD_IMPLEMENTED = 'export function twice(value: number): number {\n\treturn value * 2\n}\n'
const CHILD_TEST = [
	"import { twice } from './twice.ts'",
	"import { expect, it } from 'vitest'",
	"it('two twice → four', () => { expect(twice(2)).toBe(4) })",
	'',
].join('\n')

/**
 * A vitest package on main whose hook runs the tdd step and one counting `check`, an open parent lot on its own branch
 * adding a test file of one case, then a child started on it (`lot start --on`), its worktree linked to the cli's
 * vitest: the child's worktree and the repository.
 */
function stackedVitestChild(): { worktree: string; repository: string } {
	const start = createStartWorkspace()
	const { repository } = start
	const check: GateStep = countingStep({ counter: createCounter(), name: 'check' })
	writeFiles({
		root: repository,
		files: {
			'package.json': `${JSON.stringify({
				name: 'demo',
				type: 'module',
				devDependencies: { vitest: '^4.1.8' },
				dialecte: { gate: { full: [check], hook: [check] } },
			})}\n`,
			'.gitignore': 'node_modules\n',
		},
	})
	git({ root: repository, args: ['add', '-A'] })
	git({ root: repository, args: ['commit', '-q', '--no-verify', '-m', 'chore: a vitest package'] })
	git({ root: repository, args: ['checkout', '-q', '-b', PARENT_BRANCH] })
	writeFiles({ root: repository, files: { 'src/parent.test.ts': passingTestOf('parent case') } })
	git({ root: repository, args: ['add', '-A'] })
	git({ root: repository, args: ['commit', '-q', '--no-verify', '-m', 'feat: the parent case'] })
	git({ root: repository, args: ['checkout', '-q', 'main'] })
	writeStoreLot({
		workspace: start.workspace,
		name: PARENT,
		scope: ['src/parent.test.ts'],
		branch: PARENT_BRANCH,
		repository,
	})
	runLot({
		cwd: start.cwd,
		argv: ['start', start.workspace.briefPath, '--on', PARENT, '--json'],
		now: STACKED_NOW,
	})
	const [child] = entriesOf(start.store).filter((name) => name !== PARENT)
	const worktree =
		readIdentity({ lotFolder: join(start.store, child ?? 'none') })?.worktree ?? 'no-child-worktree'
	mkdirSync(join(worktree, 'node_modules', '.bin'), { recursive: true })
	symlinkSync(VITEST_FOLDER, join(worktree, 'node_modules', 'vitest'))
	symlinkSync(join('..', 'vitest', 'vitest.mjs'), join(worktree, 'node_modules', '.bin', 'vitest'))
	return { worktree, repository }
}

/**
 * The repository's main pushed to a new bare origin, then `files` committed on origin's main from another clone (main
 * moving on there only), origin fetched: origin's main is ahead of the local one.
 */
function moveOriginMain(params: { repository: string; files: Record<string, string> }): void {
	const { repository } = params
	const folder = temporaryFolder('dialecte-stacked-origin-')
	const origin = join(folder, 'origin.git')
	git({ root: folder, args: ['init', '-q', '--bare', '-b', 'main', origin] })
	git({ root: repository, args: ['remote', 'add', 'origin', origin] })
	git({ root: repository, args: ['push', '-q', 'origin', 'main'] })
	const other = cloneRepository({ origin, into: join(folder, 'other') })
	writeFiles({ root: other, files: params.files })
	git({ root: other, args: ['add', '-A'] })
	git({ root: other, args: ['commit', '-qm', 'feat: main moves on'] })
	git({ root: other, args: ['push', '-q', 'origin', 'main'] })
	git({ root: repository, args: ['fetch', '-q', 'origin'] })
}

describe('gate --hook: the cases of a stacked lot', { timeout: 240_000 }, () => {
	it("a child of an open parent that merged origin's main, main and the parent each adding a test file, then its own case red then green → the hook's tdd step counts its own case only", async () => {
		const { worktree, repository } = stackedVitestChild()
		moveOriginMain({ repository, files: { 'src/main.test.ts': passingTestOf('main case') } })
		git({ root: worktree, args: ['fetch', '-q', 'origin'] })
		git({ root: worktree, args: ['merge', '--no-edit', '-q', 'origin/main'] })
		writeFiles({
			root: worktree,
			files: { 'src/dataflow/twice.ts': CHILD_STUB, 'src/dataflow/twice.test.ts': CHILD_TEST },
		})
		await tdd({ root: worktree, argv: ['red'] })
		writeFileSync(join(worktree, 'src/dataflow/twice.ts'), CHILD_IMPLEMENTED)
		await tdd({ root: worktree, argv: ['green'] })
		git({ root: worktree, args: ['add', '-A'] })

		const result = await runHookIn({ cwd: worktree })

		expect({
			tdd: result.output.split('\n').find((line) => /^(ok|FAIL|skip) +tdd /.test(line)),
			otherFiles: ['src/main.test.ts', 'src/parent.test.ts'].filter((file) =>
				result.output.includes(file),
			),
		}).toEqual({
			tdd: 'ok    tdd  1 case(s) of the change: 1 red then green',
			otherFiles: [],
		})
	})
})
