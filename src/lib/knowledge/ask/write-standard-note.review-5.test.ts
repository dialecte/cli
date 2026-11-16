/**
 * Fix round 5, L-4: while a note writer waits for a claim another process holds, the start time of that process is
 * read once for the whole wait, not once per poll.
 */
import { spawn } from 'node:child_process'
import { join } from 'node:path'

import { NOTE_LOCK_FILE } from '../../../../test/ask-answer-fixtures.constants.ts'
import { writeClaimFile } from '../../../../test/ask-answer-fixtures.ts'
import { writeAskFolder } from '../../../../test/ask-records-fixtures.ts'
import { HOLD_MS } from '../../../../test/ask-review-1-fixtures.constants.ts'
import { releaseClaimLater } from '../../../../test/ask-review-1-fixtures.ts'
import { temporaryFolder } from '../../../../test/scratch-repository.ts'
import { writeStandardNote } from './write-standard-note.ts'

import { describe, expect, it } from 'vitest'

/** How long the process that holds the claim lives: longer than any wait of the case. */
const HOLDER_LIFE_MS = 20_000

describe('writeStandardNote: the wait for a claim held by another live process', () => {
	it('a claim of another process held for about 300 ms, polled many times -> its start time is read once', async () => {
		const lotHome = temporaryFolder('dialecte-ask-note-lot-')
		const asksFolder = join(lotHome, 'asks')
		writeAskFolder({ asksFolder, spec: { ask: 'A-0001' } })
		const holder = spawn(process.execPath, ['-e', `setTimeout(() => {}, ${HOLDER_LIFE_MS})`], {
			stdio: 'ignore',
		})
		try {
			const claim = join(lotHome, NOTE_LOCK_FILE)
			writeClaimFile({ path: claim, pid: holder.pid ?? 0, ageMs: 0 })
			releaseClaimLater({ path: claim, afterMs: HOLD_MS })
			const reads: number[] = []

			await writeStandardNote({
				lotHome,
				asksFolder,
				now: undefined,
				lock: {
					onStartRead: function counted({ pid }) {
						reads.push(pid)
					},
				},
			})

			expect(reads).toEqual([holder.pid])
		} finally {
			holder.kill()
		}
	})
})
