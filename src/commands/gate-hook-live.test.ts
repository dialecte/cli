/**
 * `gate --hook` off a terminal (a commit hook under husky): the live lines and the result go to the same standard
 * output, so a line written live is never in the result again - every line is printed once.
 */
import { createHookPackage } from '../../test/gate-hook.ts'
import { countingStep, createCounter } from '../../test/scratch-checks.ts'
import { git, writeFiles } from '../../test/scratch-repository.ts'
import { createVitestPackage } from '../../test/scratch-vitest-package.ts'
import { runGate } from './gate.ts'

import { describe, expect, it } from 'vitest'

import type { LiveOutput } from '../lib/progress/step-progress.types.ts'

/** A vitest package whose full gate and hook list run one counting `check`, a docs change staged. */
function declaredHookPackage(): string {
	const check = countingStep({ counter: createCounter(), name: 'check' })
	const root = createVitestPackage({ dialecte: { gate: { full: [check], hook: [check] } } })
	writeFiles({ root, files: { 'README.md': '# demo\n' } })
	git({ root, args: ['add', '-A'] })
	return root
}

/** `gate --hook` in `root` with a live output off a terminal: what it printed live, then its result's lines. */
async function hookStandardOutput(root: string): Promise<string[]> {
	const written: string[] = []
	const live: LiveOutput = {
		tty: false,
		writeLine: (line) => void written.push(line),
		rewriteLines: () => undefined,
	}
	const result = await runGate({ cwd: root, argv: ['--hook'], live })
	return [...written.flatMap((line) => line.split('\n')), ...result.output.split('\n')]
}

/** The lines printed more than once. */
function repeatedLines(lines: readonly string[]): string[] {
	return [...new Set(lines.filter((line, index) => lines.indexOf(line) !== index))]
}

describe('gate --hook off a terminal: every line printed once', { timeout: 240_000 }, () => {
	it.each([
		{ label: 'a declared hook list (the tdd step, then check)', create: declaredHookPackage },
		{ label: 'the default hook (check, tests)', create: () => createHookPackage().root },
	])('$label, its steps run → no line printed twice', async ({ create }) => {
		const root = create()

		const lines = await hookStandardOutput(root)

		expect(repeatedLines(lines)).toEqual([])
	})

	it('a declared hook list whose step a record answers → the tdd line printed once', async () => {
		const root = declaredHookPackage()
		await hookStandardOutput(root)

		const lines = await hookStandardOutput(root)

		expect(lines.filter((line) => /^ok +tdd\b/.test(line))).toHaveLength(1)
		expect(repeatedLines(lines)).toEqual([])
	})
})
