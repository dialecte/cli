/** The cache's fetch lock: a run removes only the lock it still holds. */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { acquireFetchLock, fetchLockFileOf, releaseFetchLock } from './fetch-lock.ts'

import { describe, expect, it } from 'vitest'

describe('the fetch lock', () => {
	it('is left in place when another process took it over since', () => {
		const cache = temporaryFolder('dialecte-corpora-')
		expect(acquireFetchLock({ cache })).toEqual({ kind: 'acquired' })
		writeFileSync(fetchLockFileOf({ cache }), '12345\n')

		releaseFetchLock({ cache })

		expect(existsSync(fetchLockFileOf({ cache }))).toBe(true)
		expect(readFileSync(fetchLockFileOf({ cache }), 'utf8')).toBe('12345\n')
	})

	it.each(['', 'not a pid\n'])('counts a lock holding %j as held, never taking it over', (text) => {
		const cache = temporaryFolder('dialecte-corpora-')
		writeFileSync(fetchLockFileOf({ cache }), text)

		expect(acquireFetchLock({ cache })).toEqual({ kind: 'unreadable' })
		expect(readFileSync(fetchLockFileOf({ cache }), 'utf8')).toBe(text)
	})
})
