/** R1-A1: `handover abandon` prints the lock line on its own line, never folded into the first one. */
import { STORE_FIRST_NAME } from '../../test/handover-store-scenario.constants.ts'
import {
	abandon,
	createBranchRepository,
	writeStoreHandover,
} from '../../test/handover-store-scenario.ts'
import { HANDOVER_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import {
	ABANDON_CHANGES,
	LINE_FEED_ESCAPE,
	LOCK_LINE_PATTERN,
	SECOND_NAME,
} from './handover-abandon-lock-line.constants.ts'

import { describe, expect, it } from 'vitest'

describe('handover abandon prints the lock line', { timeout: HANDOVER_CASE_TIMEOUT }, () => {
	it('the lock names the abandoned script -> the released lock on its own line, no escaped line feed', () => {
		const root = createBranchRepository()
		writeStoreHandover({ root, name: STORE_FIRST_NAME, changes: ABANDON_CHANGES, keepLock: true })

		const result = abandon({ cwd: root })

		expect(result.exitCode).toBe(0)
		expect(result.output).not.toContain(LINE_FEED_ESCAPE)
		const lines = result.output.split('\n')
		expect(lines).toHaveLength(2)
		expect(lines[1]).toMatch(LOCK_LINE_PATTERN)
	})

	it('the lock names another script -> the kept lock on its own line, no escaped line feed', () => {
		const root = createBranchRepository()
		writeStoreHandover({ root, name: STORE_FIRST_NAME, changes: ABANDON_CHANGES })
		writeStoreHandover({ root, name: SECOND_NAME, keepLock: true })

		const result = abandon({ cwd: root, argv: [STORE_FIRST_NAME] })

		expect(result.exitCode).toBe(0)
		expect(result.output).not.toContain(LINE_FEED_ESCAPE)
		const lines = result.output.split('\n')
		expect(lines).toHaveLength(2)
		expect(lines[1]).toMatch(LOCK_LINE_PATTERN)
	})
})
