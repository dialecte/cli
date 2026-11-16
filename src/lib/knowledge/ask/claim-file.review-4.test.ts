/**
 * Independent review, I-14: a claim records its holder's pid and start time; a pid that runs but started at another
 * time is a pid reused (stale), and a live claim older than the cap is taken over.
 */
import { join } from 'node:path'

import { A_YEAR_MS } from '../../../../test/ask-answer-fixtures.constants.ts'
import {
	A_DAY_MS,
	OVER_MAX_HELD_MS,
	START_TOLERANCE_MS,
} from '../../../../test/ask-review-1-fixtures.constants.ts'
import { processStartMs, writeClaimWithStart } from '../../../../test/ask-review-1-fixtures.ts'
import { temporaryFolder } from '../../../../test/scratch-repository.ts'
import { claimFile, claimHolderOf } from './claim-file.ts'

import { describe, expect, it } from 'vitest'

const STALE_MS = 10_000

/** A claim path in a folder of its own. */
function claimPath(): string {
	return join(temporaryFolder('dialecte-claim-'), 'ask.claim')
}

describe('claimFile: a claim records the start time of its holder', () => {
	it('a claim taken now -> its holder names this process and the time it started, within a few seconds', () => {
		const path = claimPath()

		const taken = claimFile({ path, staleMs: STALE_MS })

		expect({ taken, holder: claimHolderOf({ path }) }).toMatchObject({
			taken: true,
			holder: { pid: process.pid, alive: true, startedAt: expect.any(Number) },
		})
		expect(
			Math.abs((claimHolderOf({ path })?.startedAt ?? 0) - processStartMs()) < START_TOLERANCE_MS,
		).toBe(true)
	})
})

describe('claimFile: a pid reused by another process, and a claim held too long', () => {
	it('a claim naming a running pid that started a day before the process now holding it, older than the stale limit -> stale: taken over', () => {
		const path = claimPath()
		writeClaimWithStart({
			path,
			pid: process.pid,
			startedAt: processStartMs() - A_DAY_MS,
			ageMs: A_YEAR_MS,
		})

		expect(claimFile({ path, staleMs: STALE_MS })).toBe(true)
	})

	it('a claim of a live process that started when it says, held for more than 10 minutes -> taken over', () => {
		const path = claimPath()
		writeClaimWithStart({
			path,
			pid: process.pid,
			startedAt: processStartMs(),
			ageMs: OVER_MAX_HELD_MS,
		})

		expect(claimFile({ path, staleMs: STALE_MS })).toBe(true)
	})
})
