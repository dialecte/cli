/**
 * `lot stop` of a lot whose hand-over was written says what became of the repository lock, as `handover abandon` does:
 * released when it named the hand-over's script, left as it is when it names another one; never both.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

import {
	KEPT_PATTERN,
	OTHER_SCRIPT_LINE,
	RELEASED_PATTERN,
} from '../../test/lot-stop-lock.constants.ts'
import { readyLot, stopLot } from '../../test/lot-stop-workspace.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { handoverLockPath } from '../lib/handover/handover-lock.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

describe('lot stop of a ready lot: the lock', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('the lock names the hand-over -> exit 0, the output says the lock was released and not left, the lock file gone', () => {
		const { lot } = readyLot()

		const result = stopLot({ lot })

		expect({
			exitCode: result.exitCode,
			released: RELEASED_PATTERN.test(result.output),
			kept: KEPT_PATTERN.test(result.output),
			lockFile: existsSync(handoverLockPath(lot.worktree)),
		}).toEqual({ exitCode: 0, released: true, kept: false, lockFile: false })
	})

	it('the lock names another hand-over -> exit 0, the output says the lock was left as it is and not released, the lock kept', () => {
		const { lot } = readyLot()
		const lockPath = handoverLockPath(lot.worktree)
		writeFileSync(lockPath, OTHER_SCRIPT_LINE)

		const result = stopLot({ lot })

		expect({
			exitCode: result.exitCode,
			released: RELEASED_PATTERN.test(result.output),
			kept: KEPT_PATTERN.test(result.output),
			lock: readFileSync(lockPath, 'utf8'),
		}).toEqual({ exitCode: 0, released: false, kept: true, lock: OTHER_SCRIPT_LINE })
	})
})
