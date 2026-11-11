/**
 * R2-3: the lock records its writer's process start time; a lock whose pid runs but whose start time differs (a
 * reused pid) reads stale and is taken over; a lock with no start time (an older format) behaves as before.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { otherLivePid } from '../../../test/other-live-pid.ts'
import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { processStartTime } from '../process-start-time.ts'
import { LOCK_FILE_NAME, REUSED_PID_START } from './handover-lock-start-time.constants.ts'
import { takeHandoverLock } from './handover-lock.ts'

import { describe, expect, it } from 'vitest'

/** A folder holding a lock file with `lines`, and the path of a script that does not exist. */
function lockWith(lines: readonly (string | number)[]): { lockPath: string; script: string } {
	const folder = temporaryFolder('dialecte-lock-start-')
	const lockPath = join(folder, LOCK_FILE_NAME)
	const script = join(folder, 'other', 'commit.sh')
	writeFileSync(lockPath, `${[script, ...lines].join('\n')}\n`)
	return { lockPath, script }
}

describe(
	'the hand-over lock and the start time of its writer',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it('a lock taken -> its third line is the start time of this process', () => {
			const lockPath = join(temporaryFolder('dialecte-lock-start-'), LOCK_FILE_NAME)

			takeHandoverLock({
				lockPath,
				scriptPath: join(temporaryFolder('dialecte-script-'), 'commit.sh'),
			})

			expect(readFileSync(lockPath, 'utf8').split('\n')[2]).toBe(processStartTime(process.pid))
		})

		it('a lock whose pid runs but whose start time differs (a reused pid) -> stale, taken over', () => {
			const { lockPath } = lockWith([otherLivePid(), REUSED_PID_START])
			const mine = join(temporaryFolder('dialecte-script-'), 'commit.sh')

			const taken = takeHandoverLock({ lockPath, scriptPath: mine })

			expect(taken).not.toHaveProperty('heldBy')
		})

		it('a lock whose pid runs with the same start time -> live, left as it is and its script answered', () => {
			const pid = otherLivePid()
			const { lockPath, script } = lockWith([pid, processStartTime(pid) ?? ''])

			const taken = takeHandoverLock({
				lockPath,
				scriptPath: join(temporaryFolder('dialecte-script-'), 'commit.sh'),
			})

			expect(taken).toEqual({ heldBy: script })
		})

		it('a lock with a live pid and no start time (older format) -> live as before', () => {
			const { lockPath, script } = lockWith([otherLivePid()])

			const taken = takeHandoverLock({
				lockPath,
				scriptPath: join(temporaryFolder('dialecte-script-'), 'commit.sh'),
			})

			expect(taken).toEqual({ heldBy: script })
		})
	},
)
