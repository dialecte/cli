/** Where a check's reuse by tree meets the serial rerun of a failing test step and the de-throttled default gate. */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { FAKE_VITEST } from '../../test/fake-vitest.constants.ts'
import { readRecordFile } from '../../test/gate-records.ts'
import {
	FAST_RECORD_FILE,
	FULL_RECORD_FILE,
	SCRATCH_REPOSITORY_TIMEOUT,
} from '../../test/scratch-checks.constants.ts'
import {
	countRuns,
	countingStep,
	createCounter,
	createGatePackage,
	runGateIn,
} from '../../test/scratch-checks.ts'
import { computeCheckKey, hashGateCommand } from '../lib/gate-records/check-key.ts'
import { storeCheckRecord } from '../lib/gate-records/check-store.ts'

import { describe, expect, it } from 'vitest'

import type { GateRecord } from '../lib/gate-records/gate-records.types.ts'

describe(
	'gate: reuse by tree meets the serial rerun',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it('a step that passed on its serial rerun → recorded flaky; the next gate on the tree reuses it, flag kept, nothing run again', async () => {
			const root = createGatePackage({
				fast: [{ name: 'tests', run: 'sh ./vitest run', counts: 'tests' }],
				// the stand-in's call log stays out of the tree the key is taken on
				files: { vitest: FAKE_VITEST, mode: 'flaky', '.gitignore': 'node_modules\ncalls.txt\n' },
			})

			const first = await runGateIn({ cwd: root, argv: [] })
			const second = await runGateIn({ cwd: root, argv: [] })

			expect(first.exitCode).toBe(0)
			expect(readRecordFile<GateRecord>({ root, name: FAST_RECORD_FILE })?.steps).toContainEqual(
				expect.objectContaining({ name: 'tests', note: 'flaky in parallel' }),
			)
			expect(second.exitCode).toBe(0)
			expect(second.output).toMatch(/^reused: gate --fast green on this tree/m)
			expect(second.output).toMatch(/^ok {4}tests .*flaky in parallel$/m)
			expect(readFileSync(join(root, 'calls.txt'), 'utf8').trim().split('\n')).toEqual([
				'run',
				'run src/c.test.ts src/a.test.ts src/b.test.ts --no-file-parallelism',
			])
		})

		it('a flaky green gate --full, then a second gate --full that reuses it → the second record still holds the failing files of the flaky step', async () => {
			const root = createGatePackage({
				full: [{ name: 'tests', run: 'sh ./vitest run', counts: 'tests' }],
				files: { vitest: FAKE_VITEST, mode: 'flaky', '.gitignore': 'node_modules\ncalls.txt\n' },
			})

			const first = await runGateIn({ cwd: root, argv: ['--full'] })
			const recordedFailing = readRecordFile<GateRecord>({
				root,
				name: FULL_RECORD_FILE,
			})?.steps.find((step) => step.name === 'tests')?.failing
			const second = await runGateIn({ cwd: root, argv: ['--full'] })

			expect(first.exitCode).toBe(0)
			expect(recordedFailing).toEqual(['src/a.test.ts', 'src/b.test.ts', 'src/c.test.ts'])
			expect(second.output).toMatch(/^reused: gate --full green on this tree/m)
			expect(
				readRecordFile<GateRecord>({ root, name: FULL_RECORD_FILE })?.steps.find(
					(step) => step.name === 'tests',
				)?.failing,
			).toEqual(recordedFailing)
		})

		it('a green record of the same tree made by another gate command (a default changed by an upgrade) → not reused, the steps run; the same record under this command → reused', async () => {
			const counter = createCounter()
			const steps = [countingStep({ counter })]
			const files = { 'src/a.ts': 'export {}\n' }
			// two packages of the same files: the same tree, a store each
			const recorder = createGatePackage({ fast: steps, files })
			const upgraded = createGatePackage({ fast: steps, files })
			const control = createGatePackage({ fast: steps, files })
			await runGateIn({ cwd: recorder, argv: [] })
			const recorded = readRecordFile<GateRecord>({ root: recorder, name: FAST_RECORD_FILE })
			if (!recorded) throw new Error('no fast record')
			const throttledSteps = steps.map((step) => ({ ...step, run: `nice -n 10 ${step.run}` }))
			storeCheckRecord({
				root: upgraded,
				record: {
					...recorded,
					key: computeCheckKey({
						root: upgraded,
						commandHash: hashGateCommand({ steps: throttledSteps }),
					}),
				},
			})
			storeCheckRecord({
				root: control,
				record: {
					...recorded,
					key: computeCheckKey({ root: control, commandHash: hashGateCommand({ steps }) }),
				},
			})
			const runsBefore = countRuns(counter)

			const upgradedRun = await runGateIn({ cwd: upgraded, argv: [] })
			const controlRun = await runGateIn({ cwd: control, argv: [] })

			expect(upgradedRun.output).not.toMatch(/^reused: /m)
			expect(controlRun.output).toMatch(/^reused: gate --fast green on this tree/m)
			expect(countRuns(counter) - runsBefore).toBe(1)
		})
	},
)
