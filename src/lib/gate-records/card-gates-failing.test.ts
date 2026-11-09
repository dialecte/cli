/** The card's gate row of a failed step: the files it recorded as failing, the first three named, `--json` holding all. */
import { writeFileSync } from 'node:fs'

import { gitPathOf, readRecordFile } from '../../../test/gate-records.ts'
import {
	createScopedLotPackageOfOneStep,
	gateLineOf,
	readLotCard,
} from '../../../test/scoped-handover.ts'
import {
	FULL_RECORD_FILE,
	SCRATCH_REPOSITORY_TIMEOUT,
} from '../../../test/scratch-checks.constants.ts'
import {
	createCounter,
	createGatePackage,
	editReadLot,
	runGateIn,
	seedFullGate,
} from '../../../test/scratch-checks.ts'

import { describe, expect, it } from 'vitest'

import type { GateStep } from '../gate/gate-config.types.ts'
import type { GateRecord } from './gate-records.types.ts'

const FAILED_COUNTS = { tests: { passed: 3, failed: 2, skipped: 0, total: 5 } }

/** A package with a green `gate --full` whose scoped step's record is then rewritten as failed, naming `failing`. */
async function failedRecordOf(
	given: string[] | { failing: string[]; flaky: true },
): Promise<string> {
	const failing = Array.isArray(given) ? given : given.failing
	const { root } = createScopedLotPackageOfOneStep({ hookCounter: createCounter() })
	editReadLot(root)
	await seedFullGate(root)
	const record = readRecordFile<GateRecord>({ root, name: FULL_RECORD_FILE })
	if (!record) throw new Error('the gate left no record')
	// a flaky step: passed, flagged, its first run's files kept
	const rewritten = Array.isArray(given)
		? { status: 'failed', reason: 'exit 1', counts: FAILED_COUNTS, failing }
		: { note: 'flaky in parallel', failing }
	writeFileSync(
		gitPathOf({ root, name: FULL_RECORD_FILE }),
		JSON.stringify({
			...record,
			steps: record.steps.map((step) =>
				step.name === 'scoped' ? { ...step, ...rewritten } : step,
			),
		}),
	)
	return root
}

describe('the card: a failed step’s failing files', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('more than 3 files → the row ends with the count, the first 3 paths and how many more; --json holds the whole list', async () => {
		const failing = [
			'src/a.test.ts',
			'src/b.test.ts',
			'src/c.test.ts',
			'src/d.test.ts',
			'src/e.test.ts',
		]
		const root = await failedRecordOf(failing)

		const line = gateLineOf({ gates: readLotCard({ root }).gates, name: 'scoped' })

		expect(line).toMatchObject({ status: 'failed', failing })
		expect(
			line?.detail.endsWith(' · failing 5: src/a.test.ts, src/b.test.ts, src/c.test.ts, +2 more'),
		).toBe(true)
	})

	it('exactly 3 files → the row names them all and no "more"', async () => {
		const failing = ['src/a.test.ts', 'src/b.test.ts', 'src/c.test.ts']
		const root = await failedRecordOf(failing)

		const line = gateLineOf({ gates: readLotCard({ root }).gates, name: 'scoped' })

		expect(line).toMatchObject({ status: 'failed', failing })
		expect(line?.detail.endsWith(' · failing 3: src/a.test.ts, src/b.test.ts, src/c.test.ts')).toBe(
			true,
		)
	})

	it('a flaky step that passed → its row shows no failing suffix, its record still holds the files', async () => {
		const failing = ['src/a.test.ts', 'src/b.test.ts']
		const root = await failedRecordOf({ failing, flaky: true })

		const line = gateLineOf({ gates: readLotCard({ root }).gates, name: 'scoped' })

		expect(line?.status).toBe('passed')
		expect(line?.detail).not.toContain('failing')
		expect(
			readRecordFile<GateRecord>({ root, name: FULL_RECORD_FILE })?.steps.find(
				(step) => step.name === 'scoped',
			)?.failing,
		).toEqual(failing)
	})
})

describe('gate --json: a failed step', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('the step carries the whole list of its failing files', async () => {
		const printed =
			' FAIL  |node| src/b.test.ts > g > one\\n FAIL  |node| src/a.test.ts > g > two\\n'
		const root = createGatePackage({
			full: [
				{
					name: 'fails',
					run: `printf '${printed}      Tests  2 failed (2)\\n'; exit 1`,
					counts: 'tests',
				},
			],
		})

		const result = await runGateIn({ cwd: root, argv: ['--full', '--json'] })

		const steps = (JSON.parse(result.output) as { steps: { step: GateStep; failing?: string[] }[] })
			.steps
		expect(steps.find((entry) => entry.step.name === 'fails')?.failing).toEqual([
			'src/a.test.ts',
			'src/b.test.ts',
		])
	})
})
