/**
 * Independent re-verification, J-7: the start time of another process is read with `ps` run in the C locale, and a
 * start time that does not parse is unknown: the claim is treated as a reused pid (stale), never as matching.
 */
import { join } from 'node:path'

import { writeClaimFile } from '../../../../test/ask-answer-fixtures.ts'
import { temporaryFolder } from '../../../../test/scratch-repository.ts'
import { claimFile } from './claim-file.ts'

import { describe, expect, it } from 'vitest'

const STALE_MS = 10_000
const A_MINUTE_MS = 60_000

/** A claim of the parent process (running, not this one), written a minute ago: older than the stale limit. */
function claimOfAnotherLiveProcess(): string {
	const path = join(temporaryFolder('dialecte-claim-'), 'ask.claim')
	writeClaimFile({ path, pid: process.ppid, ageMs: A_MINUTE_MS })
	return path
}

describe('claimFile: reading the start time of another process', () => {
	it('the ps call runs with LC_ALL and LANG set to C', () => {
		const path = claimOfAnotherLiveProcess()
		const seen: NodeJS.ProcessEnv[] = []

		claimFile({
			path,
			staleMs: STALE_MS,
			psOutput: function recorded({ environment }) {
				seen.push(environment)
				return ''
			},
		})

		expect(seen.map((environment) => [environment.LC_ALL, environment.LANG])).toEqual([['C', 'C']])
	})

	it('a start time that does not parse, a minute past the stale limit -> unknown, so the live pid decides: the claim stays held', () => {
		const path = claimOfAnotherLiveProcess()

		const taken = claimFile({
			path,
			staleMs: STALE_MS,
			psOutput: function unreadable() {
				return 'Sun 15 Nov not a date'
			},
		})

		expect(taken).toBe(false)
	})

	const UNREAD: Record<string, () => string> = {
		'ps gives no output': () => '',
		'ps fails': () => {
			throw new Error('ps: command not found')
		},
	}

	it.each(Object.entries(UNREAD))(
		'%s on a live pid, a minute past the stale limit -> unknown start time: the claim stays held, and the call does not throw',
		(_title, psOutput) => {
			const path = claimOfAnotherLiveProcess()

			let taken: boolean | 'threw'
			try {
				taken = claimFile({ path, staleMs: STALE_MS, psOutput })
			} catch {
				taken = 'threw'
			}

			expect(taken).toBe(false)
		},
	)
})
