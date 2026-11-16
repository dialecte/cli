/**
 * `readHealthRepository` on a common dir whose `dialecte-checks` folder exists but cannot be read: no throw, no
 * records. No fixture file is used; the common dir is written by test/health.ts (writeHealthCommon).
 */
import { chmodSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { writeHealthCommon } from '../../../test/health.ts'
import { readHealthRepository } from './read-health-context.ts'

import { describe, expect, it } from 'vitest'

describe('readHealthRepository on an unreadable checks folder', () => {
	it('a dialecte-checks folder that exists and cannot be read → no throw, no records', () => {
		const common = writeHealthCommon({})
		const checks = join(common, 'dialecte-checks')
		mkdirSync(checks, { recursive: true })
		chmodSync(checks, 0o000)
		try {
			let records: unknown[] | undefined
			expect(() => {
				records = readHealthRepository({ common }).records
			}).not.toThrow()
			expect(records).toEqual([])
		} finally {
			chmodSync(checks, 0o755)
		}
	})
})
