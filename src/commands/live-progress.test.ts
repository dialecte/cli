/** A running step looks running: `gate` steps and `tdd`'s vitest run announce themselves before any work. */
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { createFakeClock } from '../../test/fake-clock.ts'
import { createFakeTerminal } from '../../test/fake-terminal.ts'
import {
	createScratchRepository,
	temporaryFolder,
	writeFiles,
} from '../../test/scratch-repository.ts'
import { createVitestPackage } from '../../test/scratch-vitest-package.ts'
import { runGate } from './gate.ts'
import { runTdd } from './tdd.ts'

import { describe, expect, it } from 'vitest'

import type { LiveOutput } from '../lib/progress/step-progress.types.ts'

function gate(params: { cwd: string; live: LiveOutput; argv?: string[] }) {
	return runGate({
		cwd: params.cwd,
		argv: params.argv ?? [],
		live: params.live,
		machineLock: {
			path: join(temporaryFolder('dialecte-gate-lock-'), 'heavy-run.lock'),
			clock: createFakeClock(),
			write: () => undefined,
		},
	})
}

function buildPackage(): string {
	return createScratchRepository({
		'package.json': JSON.stringify({
			name: 'demo',
			dialecte: { gate: { fast: [{ name: 'build', run: 'touch ran' }] } },
		}),
	})
}

/** Lines written, each with whether the step's work (its marker file) had begun when it was written. */
function recordingLive(params: { tty: boolean; marker: string }): {
	live: LiveOutput
	lines: { line: string; begun: boolean }[]
} {
	const lines: { line: string; begun: boolean }[] = []
	return {
		lines,
		live: {
			tty: params.tty,
			writeLine: (line) => lines.push({ line, begun: existsSync(params.marker) }),
			rewriteLines: () => undefined,
		},
	}
}

describe('gate steps announce themselves', { timeout: 60_000 }, () => {
	it('off a terminal → a start line for the step is written before the step runs; the gate result is unchanged', async () => {
		const root = buildPackage()
		const { live, lines } = recordingLive({ tty: false, marker: join(root, 'ran') })

		const result = await gate({ cwd: root, live })

		expect(lines.filter((entry) => entry.line.startsWith('▶ build'))).toEqual([
			{ line: expect.stringMatching(/^▶ build/), begun: false },
		])
		expect(result.output).toContain('ok    build')
	})

	it('on a terminal → a spinner line names the step and what runs, and the step line replaces it', async () => {
		const root = buildPackage()
		const terminal = createFakeTerminal({ tty: true })

		const result = await gate({ cwd: root, live: terminal.output })

		expect(terminal.rewrites.map((region) => region[0])).toEqual(
			expect.arrayContaining([expect.stringMatching(/^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏] build - touch ran 0\.\d s$/)]),
		)
		expect(terminal.screen().some((line) => line.startsWith('▶'))).toBe(false)
		expect(terminal.screen().some((line) => /^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏] /.test(line))).toBe(false)
		expect(terminal.screen().at(-1)).toMatch(/^ok {4}build/)
		expect(result.exitCode).toBe(0)
	})
})

describe('gate on a terminal announces every step', { timeout: 60_000 }, () => {
	it('the tdd step shows a spinner before vitest runs, and hygiene then tdd result lines come in run order', async () => {
		const root = createVitestPackage({
			dialecte: { gate: { fast: [{ name: 'check', run: 'true' }] } },
		})
		writeFiles({
			root,
			files: {
				'src/a.test.ts':
					"import { expect, it } from 'vitest'\nit('a', () => { expect(1).toBe(1) })\n",
			},
		})
		const terminal = createFakeTerminal({ tty: true })

		await gate({ cwd: root, live: terminal.output, argv: ['--declare', 'src/'] })

		const screen = terminal.screen()
		expect(terminal.rewrites.map((region) => region[0])).toEqual(
			expect.arrayContaining([expect.stringMatching(/^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏] tdd/)]),
		)
		const hygiene = screen.findIndex((line) => /^(ok {4}|FAIL {2})hygiene/.test(line))
		const tddLine = screen.findIndex((line) => /^(ok {4}|FAIL {2}|skip {2})tdd/.test(line))
		expect(hygiene).toBeGreaterThan(-1)
		expect(tddLine).toBeGreaterThan(hygiene)
	})
})

describe('the gate summary', { timeout: 60_000 }, () => {
	it('on a terminal → each step result line is on the screen once and not again in the returned summary; the closing line stays', async () => {
		const root = buildPackage()
		const terminal = createFakeTerminal({ tty: true })

		const result = await gate({ cwd: root, live: terminal.output })

		const seen = [...terminal.screen(), ...result.output.split('\n')]
		expect(seen.filter((line) => /^ok {4}build/.test(line))).toHaveLength(1)
		expect(result.output.split('\n')).toContain('gate --fast: green')
	})

	it('off a terminal → the summary keeps every step line as before', async () => {
		const root = buildPackage()
		const { live } = recordingLive({ tty: false, marker: join(root, 'ran') })

		const result = await gate({ cwd: root, live })

		expect(result.output.split('\n').filter((line) => /^ok {4}build/.test(line))).toHaveLength(1)
		expect(result.output.split('\n')).toContain('gate --fast: green')
	})

	it('--json on a terminal → the JSON keeps every step', async () => {
		const root = buildPackage()
		const terminal = createFakeTerminal({ tty: true })

		const result = await gate({ cwd: root, live: terminal.output, argv: ['--json'] })

		expect(
			(JSON.parse(result.output) as { steps: { step: { name: string } }[] }).steps.map(
				(entry) => entry.step.name,
			),
		).toContain('build')
	})
})

describe('tdd announces its vitest run', { timeout: 60_000 }, () => {
	it('off a terminal → a start line is written before vitest runs the test files', async () => {
		const root = createVitestPackage({})
		const marker = join(temporaryFolder('dialecte-marker-'), 'ran')
		writeFiles({
			root,
			files: {
				'src/probe.test.ts': [
					"import { writeFileSync } from 'node:fs'",
					"import { expect, it } from 'vitest'",
					`writeFileSync(${JSON.stringify(marker)}, '1')`,
					"it('probe', () => { expect(1).toBe(2) })",
					'',
				].join('\n'),
			},
		})
		const { live, lines } = recordingLive({ tty: false, marker })

		const result = await runTdd({
			cwd: root,
			argv: ['red'],
			now: () => new Date('2026-10-30T12:00:00.000Z'),
			live,
			machineLock: {
				path: join(temporaryFolder('dialecte-tdd-lock-'), 'heavy-run.lock'),
				clock: createFakeClock(),
				write: () => undefined,
			},
		})

		expect(lines.filter((entry) => entry.line.startsWith('▶ '))).toEqual([
			{ line: expect.stringMatching(/^▶ tdd red: vitest/), begun: false },
		])
		expect(result.exitCode).toBe(0)
	})
})
