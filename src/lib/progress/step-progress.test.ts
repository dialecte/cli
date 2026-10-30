import { createFakeClock } from '../../../test/fake-clock.ts'
import { createFakeTerminal } from '../../../test/fake-terminal.ts'
import { createStepProgress } from './step-progress.ts'

import { describe, expect, it } from 'vitest'

const SPINNER_FRAME = /^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/

describe('createStepProgress off a terminal', () => {
	it('start → the start line before any work; 65 s of silence → a running line per 30 s; finish → its result, then nothing more', () => {
		const clock = createFakeClock()
		const terminal = createFakeTerminal({ tty: false })
		const progress = createStepProgress({ live: terminal.output, clock, every: 30_000 })

		const step = progress.start({ name: 'commit 1/2', detail: 'git commit hook' })
		const atStart = [...terminal.screen()]
		clock.advance(65_000)
		step.finish('✓ 1a2b3c4d5e6f commit 1/2  1 m 5 s')
		const atFinish = [...terminal.screen()]
		clock.advance(120_000)

		expect(atStart).toEqual(['▶ commit 1/2 - git commit hook'])
		expect(atFinish).toEqual([
			'▶ commit 1/2 - git commit hook',
			'  … commit 1/2 running 30 s',
			'  … commit 1/2 running 1 m 0 s',
			'✓ 1a2b3c4d5e6f commit 1/2  1 m 5 s',
		])
		expect(terminal.screen()).toEqual(atFinish)
		expect(terminal.rewrites).toEqual([])
		expect(clock.pending()).toBe(0)
	})

	it('a step without a detail → the start line is the name alone', () => {
		const terminal = createFakeTerminal({ tty: false })
		const progress = createStepProgress({
			live: terminal.output,
			clock: createFakeClock(),
			every: 30_000,
		})

		progress.start({ name: 'build' })

		expect(terminal.screen()).toEqual(['▶ build'])
	})
})

describe('createStepProgress off a terminal, a silent hook', () => {
	it('hintWhenSilent, silent for 5 minutes → the running line at 90 s carries the waiting-for-input hint, once; a plain step never does', () => {
		const clock = createFakeClock()
		const hooked = createFakeTerminal({ tty: false })
		const plain = createFakeTerminal({ tty: false })

		createStepProgress({ live: hooked.output, clock, every: 30_000 }).start({
			name: 'hook',
			hintWhenSilent: true,
		})
		createStepProgress({ live: plain.output, clock, every: 30_000 }).start({ name: 'build' })
		clock.advance(95_000)
		const atNinety = hooked.written.slice()
		clock.advance(205_000)

		expect(atNinety.slice(1, 3)).toEqual(['  … hook running 30 s', '  … hook running 1 m 0 s'])
		expect(atNinety[3]).toMatch(
			/^ {2}… hook running 1 m 30 s - silent for 1 m 30 s: is it waiting for input, or running in watch mode/,
		)
		expect(hooked.written.filter((line) => line.includes('waiting for input'))).toHaveLength(1)
		expect(plain.written.some((line) => line.includes('waiting for input'))).toBe(false)
	})
})

describe('createStepProgress on a terminal', () => {
	it('start → one spinner line with the step, what runs and the elapsed time, redrawn with a moving frame; finish → the result replaces it', () => {
		const clock = createFakeClock()
		const terminal = createFakeTerminal({ tty: true })
		const progress = createStepProgress({
			live: terminal.output,
			clock,
			every: 30_000,
			tickEvery: 1_000,
		})

		const step = progress.start({ name: 'commit 1/2', detail: 'git commit hook' })
		const atStart = [...terminal.screen()]
		clock.advance(42_000)
		const midway = [...terminal.screen()]
		step.finish('✓ 1a2b3c4d5e6f commit 1/2  42 s')
		clock.advance(60_000)

		expect(atStart).toEqual([
			expect.stringMatching(/^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏] commit 1\/2 - git commit hook 0\.0 s$/),
		])
		expect(midway).toEqual([
			expect.stringMatching(/^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏] commit 1\/2 - git commit hook 42 s$/),
		])
		expect(new Set(terminal.rewrites.map((region) => region[0].slice(0, 1))).size).toBeGreaterThan(
			1,
		)
		expect(terminal.screen()).toEqual(['✓ 1a2b3c4d5e6f commit 1/2  42 s'])
		expect(terminal.written).toEqual(['✓ 1a2b3c4d5e6f commit 1/2  42 s'])
		expect(clock.pending()).toBe(0)
	})

	it('two steps in a row → the last visible line is the second step spinner, never the first step result while work continues', () => {
		const clock = createFakeClock()
		const terminal = createFakeTerminal({ tty: true })
		const progress = createStepProgress({
			live: terminal.output,
			clock,
			every: 30_000,
			tickEvery: 1_000,
		})

		progress.start({ name: 'one' }).finish('✓ one  0.0 s')
		progress.start({ name: 'two', detail: 'unit suite' })
		clock.advance(5_000)

		expect(terminal.screen().slice(0, 1)).toEqual(['✓ one  0.0 s'])
		expect(terminal.screen().at(-1)).toMatch(SPINNER_FRAME)
		expect(terminal.screen().at(-1)).toContain('two - unit suite 5.0 s')
	})
})
