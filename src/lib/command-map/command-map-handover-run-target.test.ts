/** The command map's exit lines for `handover run` name the refusal of a moved target branch (exit 2). */
import { COMMAND_MAP } from './command-map.constants.ts'

import { describe, expect, it } from 'vitest'

describe('the command map: handover run exit codes', () => {
	it('an exit line says run exits 2 when the target branch moved', () => {
		const lines = COMMAND_MAP.handover.exitCodes.filter((line) => /^2 {2}run: .*target/.test(line))

		expect(lines).toHaveLength(1)
	})

	it('an exit line says write exits 2 for an unknown --target and for no base branch', () => {
		const lines = COMMAND_MAP.handover.exitCodes.filter((line) => /^2 {2}write: /.test(line))

		expect(lines).toEqual([
			expect.stringMatching(/--target.*no base branch|no base branch.*--target/),
		])
	})

	it('the write usage shows --release and --target on one line', () => {
		const lines = COMMAND_MAP.handover.usage.filter(
			(line) =>
				line.startsWith('dialecte handover write ') &&
				line.includes('--release') &&
				line.includes('--target'),
		)

		expect(lines).toHaveLength(1)
	})
})

describe('the command map: the gate and contrib notes on a step not wired', () => {
	it('the gate and contrib notes name the not wired failure and the dialecte.gate.skip / dialecte.contrib.skip opt-out', () => {
		const notes = {
			gate: (COMMAND_MAP.gate.notes ?? []).join('\n'),
			contrib: (COMMAND_MAP.contrib.notes ?? []).join('\n'),
		}

		expect({
			gate: [notes.gate.includes('not wired'), notes.gate.includes('dialecte.gate.skip')],
			contrib: [
				notes.contrib.includes('not wired'),
				notes.contrib.includes('dialecte.contrib.skip'),
			],
		}).toEqual({ gate: [true, true], contrib: [true, true] })
	})

	it('the gate note names the base-branch resolver order (origin/HEAD, master) and no longer says (default main)', () => {
		const note = (COMMAND_MAP.gate.notes ?? []).join('\n')

		expect({
			resolver: [note.includes('origin/HEAD'), note.includes('master')],
			defaultMain: note.includes('(default main)'),
		}).toEqual({ resolver: [true, true], defaultMain: false })
	})
})

describe('the command map: one usage line for handover write, the worktree refusal of a missing base branch', () => {
	it('R3-10 the handover usage holds exactly one handover write line', () => {
		const lines = COMMAND_MAP.handover.usage.filter((line) =>
			line.startsWith('dialecte handover write '),
		)

		expect(lines).toHaveLength(1)
	})

	it('R3-6 the worktree exit lines name the refusal of a set but missing base branch: exit 1 for worktree add', () => {
		const lines = COMMAND_MAP.worktree.exitCodes.filter((line) =>
			/^1 {2}add: .*base branch/.test(line),
		)

		expect(lines).toHaveLength(1)
	})
})
