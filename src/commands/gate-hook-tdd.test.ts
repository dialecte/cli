/**
 * `gate --hook` of a package declaring `dialecte.gate.hook`: the tdd receipts of the lot first (measured from the lot
 * base), then the declared steps; no test suite. Without a declared hook list, no tdd step.
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { runHookIn } from '../../test/gate-hook.ts'
import { countRuns, countingStep, createCounter } from '../../test/scratch-checks.ts'
import { git, writeFiles } from '../../test/scratch-repository.ts'
import { createVitestPackage } from '../../test/scratch-vitest-package.ts'
import { runTdd } from './tdd.ts'

import { describe, expect, it } from 'vitest'

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
			'FAIL  tdd  1 case(s) of the lot green before the production changed',
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
			'FAIL  tdd  1 case(s) of the lot green before the production changed',
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
