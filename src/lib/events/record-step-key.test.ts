/**
 * The key a step's `step.end` carries (the check key of the record the run wrote, a rehearsal's lots): written when the
 * caller gives it, absent otherwise, never on an interrupted end. The entry points are run in scratch repositories,
 * one case each.
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { hookRecordsOf, indexTreeOf } from '../../../test/gate-hook.ts'
import { readRecordFile } from '../../../test/gate-records.ts'
import { INTERRUPT_WAIT_BOUND_MS, KEY_ONE, KEY_TWO } from '../../../test/health-verb.constants.ts'
import {
	createHangingLot,
	endsOfRunsWith,
	interruptGateOf,
	rehearsalLotsOf,
	runHandoverIn,
} from '../../../test/health-verb.ts'
import {
	FAST_RECORD_FILE,
	SCRATCH_REPOSITORY_TIMEOUT,
} from '../../../test/scratch-checks.constants.ts'
import { CONTRIB_RECORD_FILE } from '../../../test/scratch-contrib.constants.ts'
import { createHandoverLot } from '../../../test/step-events-handover.ts'
import { TEST_SUMMARY_COMMAND } from '../../../test/step-events-lot.constants.ts'
import {
	createStepLot,
	eventsOfStep,
	seenFile,
	stepEventsOf,
} from '../../../test/step-events-lot.ts'
import { runContrib } from '../../commands/contrib.ts'
import { runGate } from '../../commands/gate.ts'
import { readTreeRecords } from '../gate-records/check-store.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { CheckKey, GateRecord } from '../gate-records/gate-records.types.ts'

const CLI_SOURCE = join(import.meta.dirname, '..', '..', 'cli.ts')

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

describe('startStep(...).end({ key })', () => {
	it('two runs, the first ended with a key and the second without → the first end holds the key, the second has no key field', () => {
		const lot = createStepLot({ fast: [{ name: 'one', run: 'echo one' }] })

		expect(
			endsOfRunsWith({ lot, keys: [KEY_ONE, undefined] }).map((end) => ({
				key: end.key,
				hasKeyField: 'key' in end,
			})),
		).toEqual([
			{ key: KEY_ONE, hasKeyField: true },
			{ key: undefined, hasKeyField: false },
		])
	})

	it('two runs ended with two keys → each end holds its own key', () => {
		const lot = createStepLot({ fast: [{ name: 'one', run: 'echo one' }] })

		expect(endsOfRunsWith({ lot, keys: [KEY_ONE, KEY_TWO] }).map((end) => end.key)).toEqual([
			KEY_ONE,
			KEY_TWO,
		])
	})
})

describe('the step events of the entry points carry their record’s key', () => {
	it(
		'gate --fast in a lot worktree → its end holds the key of the record it stored (tree, install, command, linked)',
		{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
		async () => {
			const lot = createStepLot({ fast: [{ name: 'one', run: 'echo one' }] })

			await runGate({ cwd: lot.worktree, argv: [] })
			const record = readRecordFile<GateRecord>({ root: lot.worktree, name: FAST_RECORD_FILE })

			expect({
				recorded: record?.key !== undefined,
				key: eventsOfStep({ lot, step: 'gate-fast' })[1]?.key,
			}).toEqual({ recorded: true, key: record?.key })
		},
	)

	it(
		'contrib in a lot worktree → its end holds the key of its record',
		{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
		async () => {
			const lot = createStepLot({ contribSteps: [{ name: 'one', run: 'echo one' }] })

			await runContrib({ cwd: lot.worktree, argv: [] })
			const record = readRecordFile<GateRecord>({ root: lot.worktree, name: CONTRIB_RECORD_FILE })

			expect({
				recorded: record?.key !== undefined,
				key: eventsOfStep({ lot, step: 'contrib' })[1]?.key,
			}).toEqual({ recorded: true, key: record?.key })
		},
	)

	it(
		'gate --hook in a lot worktree → its end holds the key of the hook-gate record it wrote',
		{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
		async () => {
			const lot = createStepLot({
				full: [{ name: 'tests', run: TEST_SUMMARY_COMMAND, counts: 'tests' }],
			})

			await runGate({ cwd: lot.worktree, argv: ['--hook'] })
			const records = hookRecordsOf({
				root: lot.worktree,
				tree: indexTreeOf({ root: lot.worktree }),
			})

			expect({
				records: records.length,
				key: eventsOfStep({ lot, step: 'gate-hook' })[1]?.key,
			}).toEqual({ records: 1, key: records[0]?.key })
		},
	)

	it(
		'handover run --rehearse → the rehearsal’s end lists each lot’s tree and decision, as rehearsal.json holds them',
		{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
		async () => {
			const lot = createHandoverLot()

			const exitCode = await runHandoverIn({ lot, argv: ['--rehearse'] })
			const planned = rehearsalLotsOf(lot.folder)

			expect({
				exitCode,
				planned: planned.length > 0,
				wellFormed: planned.every(
					(entry) => /^[0-9a-f]{40}$/.test(entry.tree) && entry.decision !== '',
				),
				lots: eventsOfStep({ lot, step: 'rehearsal' })[1]?.lots,
			}).toEqual({ exitCode: 0, planned: true, wellFormed: true, lots: planned })
		},
	)
})

describe('a gate run whose state changes while it runs', () => {
	it(
		'a run that leaves a key, then a run whose step edits a tracked file (no record stored) → the second end has no key',
		{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
		async () => {
			const flag = seenFile()
			const lot = createStepLot({
				files: { 'src/tracked.txt': 'one\n' },
				fast: [{ name: 'edit', run: `if [ -s '${flag}' ]; then echo more >> src/tracked.txt; fi` }],
			})

			await runGate({ cwd: lot.worktree, argv: [] })
			writeFileSync(flag, 'edit\n')
			await runGate({ cwd: lot.worktree, argv: ['--no-reuse'] })

			const ends = eventsOfStep({ lot, step: 'gate-fast' }).filter(
				(event) => event.kind === 'step.end',
			)
			const firstKey = ends[0]?.key as CheckKey | undefined
			const stored = readTreeRecords({ root: lot.worktree, tree: firstKey?.tree ?? '' })

			expect({
				ends: ends.map((end) => ({ exit: end.exit, hasKey: 'key' in end })),
				stored: stored.map((record) => record.key),
			}).toEqual({
				ends: [
					{ exit: 0, hasKey: true },
					{ exit: 0, hasKey: false },
				],
				stored: [ends[0]?.key],
			})
		},
	)
})

describe('an interrupted run', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('a gate --fast that ends, then a gate --full killed by SIGINT → the finished end holds a key, the interrupted end has none', async () => {
		const { lot, pidFile } = createHangingLot()

		await runGate({ cwd: lot.worktree, argv: [] })
		await interruptGateOf({ cliSource: CLI_SOURCE, lot, pidFile, bound: INTERRUPT_WAIT_BOUND_MS })
		const ends = stepEventsOf(lot).filter((event) => event.kind === 'step.end')

		expect(
			ends.map((end) => ({
				step: end.step,
				outcome: end.outcome,
				hasKey: 'key' in end,
			})),
		).toEqual([
			{ step: 'gate-fast', outcome: undefined, hasKey: true },
			{ step: 'gate-full', outcome: 'interrupted', hasKey: false },
		])
	})
})
