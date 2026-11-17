/**
 * The forecast's read budget (33CO 4.6, perf rule: no repeated reads): `lot status --json` reads each registry entry once,
 * its forecast view reusing the entries the command read; text mode reads no forecast; the readers of many lots
 * (`inbox`, `lot wait`) read no `forecast.jsonl` at all.
 */
import { counted } from '../../test/counting-fs.ts'
import { READY_LOT } from '../../test/inbox-health.constants.ts'
import { addReadyLot, createHealthInboxWorkspace, inboxHealthIn } from '../../test/inbox-health.ts'
import { QUESTION_LOT } from '../../test/lot-questions.constants.ts'
import { createQuestionLot } from '../../test/lot-questions.ts'
import { createWaitTime } from '../../test/simulated-lot.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { STORE_FILES } from '../lib/store/store.constants.ts'
import { lotStatus } from './lot-status.ts'
import { waitLot } from './lot-wait.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('node:fs', async (importOriginal) => {
	const { countingFs } = await import('../../test/counting-fs.ts')
	const actual = await importOriginal<typeof import('node:fs')>()
	return countingFs(actual)
})

afterEach(function restoreEnvironment() {
	counted.armed = false
	counted.paths.length = 0
	counted.reads.length = 0
	vi.unstubAllEnvs()
})

/** The folder of the hand-over registry's entry files. */
const REGISTRY_FOLDER = 'dialecte-handover'

/** What the counted reads say: entry files read more than once, and how many reads were of a `forecast.jsonl`. */
function readsSummaryOf(reads: readonly string[]): {
	repeatedEntries: string[]
	forecastReads: number
} {
	const entries = reads.filter(
		(path) => path.includes(`/${REGISTRY_FOLDER}/`) && path.endsWith('.json'),
	)
	return {
		repeatedEntries: [...new Set(entries)].filter(
			(path) => entries.filter((read) => read === path).length !== 1,
		),
		forecastReads: reads.filter((path) => path.endsWith(`/${STORE_FILES.forecast}`)).length,
	}
}

describe('the forecast read budget', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('lot status --json -> each registry entry file read once, the forecast read with them', () => {
		const target = createHealthInboxWorkspace()
		addReadyLot(target)

		counted.armed = true
		lotStatus({ cwd: target.workspace.repository, argv: [READY_LOT, '--json'] })
		counted.armed = false

		expect(readsSummaryOf(counted.reads)).toEqual({
			repeatedEntries: [],
			forecastReads: expect.any(Number),
		})
		expect(readsSummaryOf(counted.reads).forecastReads).toBeGreaterThan(0)
	})

	it('lot status as text -> no forecast.jsonl read (the text shows none)', () => {
		const target = createHealthInboxWorkspace()
		addReadyLot(target)

		counted.armed = true
		lotStatus({ cwd: target.workspace.repository, argv: [READY_LOT] })
		counted.armed = false

		expect(readsSummaryOf(counted.reads).forecastReads).toBe(0)
	})

	it('inbox -> no forecast.jsonl read', () => {
		const target = createHealthInboxWorkspace()
		addReadyLot(target)

		counted.armed = true
		inboxHealthIn({ workspace: target })
		counted.armed = false

		expect(readsSummaryOf(counted.reads).forecastReads).toBe(0)
	})

	it('lot wait -> no forecast.jsonl read across its polls', async () => {
		const lot = createQuestionLot()
		const time = createWaitTime()

		counted.armed = true
		await waitLot({
			cwd: lot.workspace.repository,
			argv: [QUESTION_LOT, '--timeout', '3', '--json'],
			clock: time.clock,
			sleep: time.sleep,
		})
		counted.armed = false

		expect(readsSummaryOf(counted.reads).forecastReads).toBe(0)
	})
})
