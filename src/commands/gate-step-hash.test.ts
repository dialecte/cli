/** `gate --fast/--full/--release` write `stepHash` on each configured step of their record, at the run's gate base. */

import { readRecordFile } from '../../test/gate-records.ts'
import { RELEASE_RECORD_FILE } from '../../test/scoped-gate-package.constants.ts'
import { createScopedPackage, createScopedStep } from '../../test/scoped-gate-package.ts'
import {
	FAST_RECORD_FILE,
	FULL_RECORD_FILE,
	SCRATCH_REPOSITORY_TIMEOUT,
} from '../../test/scratch-checks.constants.ts'
import {
	countingStep,
	createCounter,
	createGatePackage,
	runGateIn,
} from '../../test/scratch-checks.ts'
import { SHA256_HEX } from '../../test/step-reuse.constants.ts'
import { hashGateStep } from '../lib/gate-records/step-reuse.ts'

import { describe, expect, it } from 'vitest'

import type { GateRecord, RecordedStep } from '../lib/gate-records/gate-records.types.ts'
import type { GateStep } from '../lib/gate/gate-config.types.ts'

const MODES = [
	{ label: '--fast', argv: [] as string[], file: FAST_RECORD_FILE },
	{ label: '--full', argv: ['--full'], file: FULL_RECORD_FILE },
	{ label: '--release', argv: ['--release'], file: RELEASE_RECORD_FILE },
]

/** A package whose gates hold an unscoped counting step and a scoped step. */
function scopedGatePackage() {
	const scoped = createScopedStep()
	const steps = [countingStep({ counter: createCounter() }), scoped.step]
	const root = createScopedPackage({ gate: { fast: steps, full: steps } })
	return { root, steps }
}

function recordOf(params: { root: string; file: string }): GateRecord {
	const record = readRecordFile<GateRecord>({ root: params.root, name: params.file })
	if (!record) throw new Error(`no ${params.file} record`)
	return record
}

function recordedStep(params: { record: GateRecord; name: string }): RecordedStep | undefined {
	return params.record.steps.find((step) => step.name === params.name)
}

/** The `stepHash` the record holds for each of the steps, by name. */
function hashesOf(params: { record: GateRecord; steps: GateStep[] }): (string | undefined)[] {
	return params.steps.map(
		(step) => recordedStep({ record: params.record, name: step.name })?.stepHash,
	)
}

describe(
	'the gate writes stepHash on the steps of its record',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		describe.each(MODES)('gate $label', ({ argv, file }) => {
			it('each configured step holds hashGateStep of it at the run gate base; the tdd step is recorded without one', async () => {
				const { root, steps } = scopedGatePackage()

				await runGateIn({ cwd: root, argv })

				const record = recordOf({ root, file })
				expect(
					steps.map((step) => hashGateStep({ root, step, gateBase: record.base?.commit })),
				).toEqual(hashesOf({ record, steps }))
				const tdd = recordedStep({ record, name: 'tdd' })
				expect(tdd).toEqual(expect.objectContaining({ name: 'tdd' }))
				expect(tdd).not.toHaveProperty('stepHash')
			})

			it('the hash of the scoped step is a sha256 and is not the hash of the unscoped step', async () => {
				const { root, steps } = scopedGatePackage()

				await runGateIn({ cwd: root, argv })

				const [unscoped, scoped] = hashesOf({ record: recordOf({ root, file }), steps })
				expect([unscoped, scoped]).toEqual([
					expect.stringMatching(SHA256_HEX),
					expect.stringMatching(SHA256_HEX),
				])
				expect(scoped).not.toBe(unscoped)
			})
		})

		it('a package with no scoped step, no gate base → the step holds hashGateStep without a base', async () => {
			const step = countingStep({ counter: createCounter() })
			const root = createGatePackage({ fast: [step], full: [step] })

			await runGateIn({ cwd: root, argv: ['--full'] })

			const record = recordOf({ root, file: FULL_RECORD_FILE })
			expect(record.base).toBeUndefined()
			expect(hashGateStep({ root, step })).toBe(recordedStep({ record, name: step.name })?.stepHash)
		})

		it.each(MODES.slice(0, 2))(
			'gate $label answered from its own record on the same tree → the record holds the answering record step hashes',
			async ({ argv, file }) => {
				const { root, steps } = scopedGatePackage()
				await runGateIn({ cwd: root, argv })
				const first = recordOf({ root, file })

				await runGateIn({ cwd: root, argv })

				const second = recordOf({ root, file })
				expect(second.reused).toBeDefined()
				expect(hashesOf({ record: second, steps })).toEqual(
					steps.map(() => expect.stringMatching(SHA256_HEX)),
				)
				expect(hashesOf({ record: second, steps })).toEqual(hashesOf({ record: first, steps }))
			},
		)
	},
)
