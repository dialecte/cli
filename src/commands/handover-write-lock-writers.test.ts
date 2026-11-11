/**
 * R1-B1: the hand-over lock names a live writer from the moment it is taken, before its script exists: a second
 * write is refused while the first is between taking the lock and writing commit.sh; a lock whose writer is gone
 * (no process, no script) is taken over by one taker only.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

import { outcomeOf } from '../../test/call-outcome.ts'
import {
	TAKE_LOCK_CHILD,
	TAKE_LOCK_CHILD_BOUND_MS,
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
import { COMMIT_SCRIPT_FILE } from '../lib/handover/handover.constants.ts'
import { runHandover } from './handover.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** The script a writer in a folder of its own would write: the path only, no file. */
function unwrittenScriptOf(prefix: string): string {
	return join(temporaryFolder(prefix), WRITER_SCRIPT_FILE)
}

describe(
	'the hand-over lock and a writer that has not written its script yet',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it('a writer holds the lock before its commit.sh exists, a second write -> exit 2 naming the first writer, its lock kept, nothing written', () => {
			isolateStateFolder()
			const lot = startRealLot()
			writeLotHandover(lot)
			const lockPath = handoverLockPath(lot.worktree)
			rmSync(lockPath, { force: true })
			const writer = unwrittenScriptOf('dialecte-writer-')
			takeHandoverLock({ lockPath: lockPath, scriptPath: writer })
			const lockBefore = readFileSync(lockPath, 'utf8')

			const outcome = outcomeOf(() =>
				runHandover({
					argv: [lot.lotsPath, '--rehash', '--out', lot.lotFolder],
					cliPath: STORE_WRITER_CLI,
					probe: noRepositoryCli,
					cwd: lot.worktree,
				}),
			)

			expect(outcome).toMatchObject({
				value: { exitCode: 2, output: expect.stringContaining(writer) },
			})
			expect(readFileSync(lockPath, 'utf8')).toBe(lockBefore)
		})

		it('a lock whose writer is gone (its process ended, no script written), a write -> taken over, exit 0, the lock names this hand-over', () => {
			isolateStateFolder()
			const lot = startRealLot()
			writeLotHandover(lot)
			const lockPath = handoverLockPath(lot.worktree)
			rmSync(lockPath, { force: true })
			const gone = unwrittenScriptOf('dialecte-gone-writer-')
			const child = spawnSync(process.execPath, [TAKE_LOCK_CHILD, lockPath, gone], {
				timeout: TAKE_LOCK_CHILD_BOUND_MS,
			})

			const outcome = outcomeOf(() =>
				runHandover({
					argv: [lot.lotsPath, '--rehash', '--out', lot.lotFolder],
					cliPath: STORE_WRITER_CLI,
					probe: noRepositoryCli,
					cwd: lot.worktree,
				}),
			)

			expect(child.status).toBe(0)
			expect(outcome).toMatchObject({ value: { exitCode: 0 } })
			expect(readFileSync(lockPath, 'utf8')).toContain(join(lot.lotFolder, COMMIT_SCRIPT_FILE))
		})

		it('a stale lock, two takers one after the other -> the first takes it over, the second is refused naming the first', () => {
			isolateStateFolder()
			const lot = startRealLot()
			const lockPath = handoverLockPath(lot.worktree)
			rmSync(lockPath, { force: true })
			const gone = unwrittenScriptOf('dialecte-gone-writer-')
			const child = spawnSync(process.execPath, [TAKE_LOCK_CHILD, lockPath, gone], {
				timeout: TAKE_LOCK_CHILD_BOUND_MS,
			})
			const first = unwrittenScriptOf('dialecte-first-taker-')
			const second = unwrittenScriptOf('dialecte-second-taker-')

			const firstTaken = takeHandoverLock({ lockPath, scriptPath: first })
			const secondTaken = takeHandoverLock({ lockPath, scriptPath: second })

			expect(child.status).toBe(0)
			expect(firstTaken).not.toHaveProperty('heldBy')
			expect(secondTaken).toEqual({ heldBy: first })
			expect(existsSync(first)).toBe(false)
			expect(readFileSync(lockPath, 'utf8')).toContain(first)
		})
	},
)
