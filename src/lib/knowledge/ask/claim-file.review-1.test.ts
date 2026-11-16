/**
 * Review round 1, R1-5: a stale claim is taken over only if the claim moved aside still holds the process that was
 * read; a claim another taker made meanwhile is put back and the taker tries again.
 */
import { join } from 'node:path'

import { A_YEAR_MS } from '../../../../test/ask-answer-fixtures.constants.ts'
import { deadProcessId, writeClaimFile } from '../../../../test/ask-answer-fixtures.ts'
import { temporaryFolder } from '../../../../test/scratch-repository.ts'
import { claimFile, claimHolderOf } from './claim-file.ts'

import { describe, expect, it } from 'vitest'

const STALE_MS = 10_000

describe('claimFile: the takeover of a stale claim is atomic against another taker', () => {
	it('another taker takes the stale claim between the read and the move -> the first taker is refused and the new live claim is left as it is', () => {
		const path = join(temporaryFolder('dialecte-claim-'), 'ask.claim')
		writeClaimFile({ path, pid: deadProcessId(), ageMs: A_YEAR_MS })

		const taken = claimFile({
			path,
			staleMs: STALE_MS,
			afterStaleRead: function anotherTakerWins() {
				// the other taker moved the stale claim aside and made its own: held by the parent process, alive
				writeClaimFile({ path, pid: process.ppid, ageMs: 0 })
			},
		})

		expect({ taken, holder: claimHolderOf({ path }) }).toMatchObject({
			taken: false,
			holder: { pid: process.ppid, alive: true },
		})
	})
})

describe('claimFile: a stale takeover runs under a takeover file of its own', () => {
	it('a third process asks for the claim inside the takeover window, the live claim of another taker moved aside -> neither taker nor third is given it: one holder', () => {
		const path = join(temporaryFolder('dialecte-claim-'), 'ask.claim')
		writeClaimFile({ path, pid: deadProcessId(), ageMs: A_YEAR_MS })
		const seen: { third: boolean | undefined; moved: boolean } = { third: undefined, moved: false }

		const taken = claimFile({
			path,
			staleMs: STALE_MS,
			afterStaleRead: function anotherTakerWins() {
				writeClaimFile({ path, pid: process.ppid, ageMs: 0 })
				seen.third = claimFile({ path, staleMs: STALE_MS })
			},
			afterMovedAside: function claimWasMoved() {
				seen.moved = true
			},
		})

		expect({
			taken,
			third: seen.third,
			moved: seen.moved,
			holder: claimHolderOf({ path }),
		}).toMatchObject({
			taken: false,
			third: false,
			moved: false,
			holder: { pid: process.ppid, alive: true },
		})
	})

	it('another taker made the claim after this one read the stale one, then this one holds the takeover file -> the live claim is never moved aside: this taker is refused and the claim stays where it was', () => {
		const path = join(temporaryFolder('dialecte-claim-'), 'ask.claim')
		writeClaimFile({ path, pid: deadProcessId(), ageMs: A_YEAR_MS })
		const seen: { moved: boolean } = { moved: false }

		const taken = claimFile({
			path,
			staleMs: STALE_MS,
			afterStaleRead: function anotherTakerWins() {
				writeClaimFile({ path, pid: process.ppid, ageMs: 0 })
			},
			afterMovedAside: function claimWasMoved() {
				seen.moved = true
			},
		})

		expect({ taken, moved: seen.moved, holder: claimHolderOf({ path }) }).toMatchObject({
			taken: false,
			moved: false,
			holder: { pid: process.ppid, alive: true },
		})
	})

	it('a takeover file held by a live process for a moment -> the stale claim is not taken over (another taker is at it) and is left as it is', () => {
		const path = join(temporaryFolder('dialecte-claim-'), 'ask.claim')
		const stalePid = deadProcessId()
		writeClaimFile({ path, pid: stalePid, ageMs: A_YEAR_MS })
		writeClaimFile({ path: `${path}.takeover`, pid: process.ppid, ageMs: 0 })

		const taken = claimFile({ path, staleMs: STALE_MS })

		expect({ taken, holder: claimHolderOf({ path }) }).toMatchObject({
			taken: false,
			holder: { pid: stalePid },
		})
	})
})
