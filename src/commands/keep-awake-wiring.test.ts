/**
 * Which runs hold the machine awake: `handover run` (with and without `--rehearse`), `gate --full` and
 * `gate --release`, once at their start; `gate --fast` and `handover run --probe` never. The hold is a counting
 * stand-in: never a real `caffeinate`.
 */
import { existsSync } from 'node:fs'

import { createFakeClock } from '../../test/fake-clock.ts'
import { editedPackage, writeProfileHandover } from '../../test/handover-profile.ts'
import { noRepositoryCli } from '../../test/repository-cli-probe.ts'
import { SCRATCH_REPOSITORY_TIMEOUT } from '../../test/scratch-checks.constants.ts'
import {
	countingStep,
	createCounter,
	createGatePackage,
	runFolder,
} from '../../test/scratch-checks.ts'
import { temporaryFolder } from '../../test/scratch-repository.ts'
import { PASSING_STEP } from '../../test/step4-cases.constants.ts'
import { runGate } from './gate.ts'
import { runHandoverRun } from './handover.ts'

import { describe, expect, it } from 'vitest'

import type { AwakeHolder } from '../lib/keep-awake/keep-awake.types.ts'

/** A hold that counts its calls. */
function countingHold(): { holdAwake: AwakeHolder; calls: () => number } {
	let calls = 0
	return {
		holdAwake() {
			calls += 1
		},
		calls() {
			return calls
		},
	}
}

/** The number of holds started by `gate <flags>` on a fresh package. */
async function holdsOfGate(argv: string[]): Promise<number> {
	const root = createGatePackage({ fast: [PASSING_STEP], full: [PASSING_STEP] })
	const hold = countingHold()
	await runGate({ cwd: root, argv, holdAwake: hold.holdAwake })
	return hold.calls()
}

describe('the keep-awake hold of the gate', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('--full holds once, --fast and no flag never', async () => {
		const holds = {
			full: await holdsOfGate(['--full']),
			fast: await holdsOfGate(['--fast']),
			default: await holdsOfGate([]),
		}

		expect(holds).toEqual({ full: 1, fast: 0, default: 0 })
	})

	it('--release holds once', async () => {
		const holds = { release: await holdsOfGate(['--release']), fast: await holdsOfGate(['--fast']) }

		expect(holds).toEqual({ release: 1, fast: 0 })
	})

	it('--full answered from a green record → the hold was started all the same, once', async () => {
		const root = createGatePackage({ fast: [PASSING_STEP], full: [PASSING_STEP] })
		await runGate({ cwd: root, argv: ['--full'], holdAwake: countingHold().holdAwake })
		const hold = countingHold()

		const result = await runGate({ cwd: root, argv: ['--full'], holdAwake: hold.holdAwake })

		expect(result.output).toContain('green (reused)')
		expect(hold.calls()).toBe(1)
	})

	it.each(['--full', '--release'])(
		'%s → the hold is started before any step ran (the step’s counter file is absent when it is called)',
		async (flag) => {
			const counter = createCounter()
			const step = countingStep({ counter })
			const root = createGatePackage({ fast: [step], full: [step] })
			const seen: boolean[] = []
			function holdAwake(): void {
				seen.push(existsSync(counter))
			}

			await runGate({ cwd: root, argv: [flag], holdAwake })

			expect({ seen, ran: existsSync(counter) }).toEqual({ seen: [false], ran: true })
		},
	)
})

describe('the keep-awake hold of handover run', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('handover run holds once; run --probe never', async () => {
		const out = writeProfileHandover({ root: editedPackage({ profile: null }) })
		const run = countingHold()
		const probe = countingHold()

		await runFolder({ out, holdAwake: run.holdAwake })
		const exitCode = await runHandoverRun({
			argv: ['--probe'],
			write: () => undefined,
			clock: createFakeClock(),
			colour: false,
			probe: noRepositoryCli,
			scratchRoot: temporaryFolder('dialecte-scratch-root-'),
			holdAwake: probe.holdAwake,
		})

		expect({ run: run.calls(), probe: probe.calls(), exitCode }).toEqual({
			run: 1,
			probe: 0,
			exitCode: 0,
		})
	})

	it('handover run --rehearse → the hold is started once', async () => {
		const out = writeProfileHandover({ root: editedPackage({ profile: null }) })
		const hold = countingHold()

		await runFolder({ out, argv: ['--rehearse'], holdAwake: hold.holdAwake })

		expect(hold.calls()).toBe(1)
	})
})
