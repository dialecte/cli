/**
 * R1-B1: a write that fails after it took the lock puts back or removes only a lock that still names itself;
 * another writer's lock, taken meanwhile, is left as it is.
 */
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

import { outcomeOf } from '../../test/call-outcome.ts'
import {
	WRITE_FAILURE_MESSAGE,
	WRITER_SCRIPT_FILE,
} from '../../test/handover-lock-writers.constants.ts'
import { STORE_WRITER_CLI } from '../../test/handover-store-scenario.constants.ts'
import {
	isolateStateFolder,
	startRealLot,
	writeLotHandover,
} from '../../test/lot-handover-workspace.ts'
import { noRepositoryCli } from '../../test/repository-cli-probe.ts'
import { temporaryFolder } from '../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { handoverLockPath, takeHandoverLock } from '../lib/handover/handover-lock.ts'
import { writeHandover } from '../lib/handover/write-handover.ts'
import { runHandover } from './handover.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/handover/write-handover.ts', async function mockWriteHandover(importOriginal) {
	const original = await importOriginal<typeof import('../lib/handover/write-handover.ts')>()
	return { ...original, writeHandover: vi.fn() }
})

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
	vi.mocked(writeHandover).mockReset()
})

describe('handover write failing after it took the lock', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('the write fails and the lock still names this hand-over -> the error is thrown, the lock removed', () => {
		isolateStateFolder()
		const lot = startRealLot()
		writeLotHandover(lot)
		const lockPath = handoverLockPath(lot.worktree)
		rmSync(lockPath, { force: true })
		vi.mocked(writeHandover).mockImplementation(function failing() {
			throw new Error(WRITE_FAILURE_MESSAGE)
		})

		const outcome = outcomeOf(() =>
			runHandover({
				argv: [lot.lotsPath, '--rehash', '--out', lot.lotFolder],
				cliPath: STORE_WRITER_CLI,
				probe: noRepositoryCli,
				cwd: lot.worktree,
			}),
		)

		expect(outcome).toEqual({ error: WRITE_FAILURE_MESSAGE })
		expect(existsSync(lockPath)).toBe(false)
	})

	it('the write fails after another writer took the lock -> the error is thrown, the other writer’s lock left as it is', () => {
		isolateStateFolder()
		const lot = startRealLot()
		writeLotHandover(lot)
		const lockPath = handoverLockPath(lot.worktree)
		rmSync(lockPath, { force: true })
		const other = join(temporaryFolder('dialecte-other-writer-'), WRITER_SCRIPT_FILE)
		let lockOfOther = ''
		vi.mocked(writeHandover).mockImplementation(function takenOver() {
			// this write's lock is gone and another writer holds the repository now
			rmSync(lockPath, { force: true })
			takeHandoverLock({ lockPath, scriptPath: other })
			lockOfOther = readFileSync(lockPath, 'utf8')
			throw new Error(WRITE_FAILURE_MESSAGE)
		})

		const outcome = outcomeOf(() =>
			runHandover({
				argv: [lot.lotsPath, '--rehash', '--out', lot.lotFolder],
				cliPath: STORE_WRITER_CLI,
				probe: noRepositoryCli,
				cwd: lot.worktree,
			}),
		)

		expect(outcome).toEqual({ error: WRITE_FAILURE_MESSAGE })
		expect(lockOfOther).toContain(other)
		expect(existsSync(lockPath) ? readFileSync(lockPath, 'utf8') : undefined).toBe(lockOfOther)
	})
})
