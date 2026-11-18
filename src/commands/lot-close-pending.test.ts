/**
 * `lot close` after its settle: a lot whose landing the close reads merged commits its pending entry, and closes on
 * that same run, named by its entry or by its id; every hand-over entry that leaves with a closed worktree records
 * its close, so a later close of it answers `already closed`.
 */
import { existsSync, realpathSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'

import { LANDING_NOW } from '../../test/landing-lot.constants.ts'
import {
	closeArgumentsOf,
	closeOutcomesOf,
	landingLotOf,
	lotEntryStateOf,
	registerCommittedHandover,
	registerLotEntry,
	writeLandedFact,
} from '../../test/landing-lot.ts'
import { landingHostOf, mergeOnOrigin } from '../../test/landing-repository.ts'
import { writeHookRecordAtHead } from '../../test/lot-close-final-record.ts'
import { temporaryFolder } from '../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import {
	handoverStoreOf,
	recordHandoverState,
	registerHandover,
} from '../lib/handover/handover-store.ts'
import { runLotClose } from './lot-close.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { LandingLot } from '../../test/landing-lot.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** `lot close <names> --json` from the main checkout, a host that knows no pull request. */
function close(params: { lot: LandingLot; names: string[] }) {
	return runLotClose(
		closeArgumentsOf({ lot: params.lot, names: params.names, host: landingHostOf({}).host }),
	)
}

/** A lot registered as its own pending entry, its commit hooked, then fast-forwarded into main: its entry's name. */
function mergedWithPendingEntry(lot: LandingLot): string {
	const name = registerLotEntry({ lot, state: 'pending' })
	writeHookRecordAtHead(lot.worktree)
	mergeOnOrigin({ repository: lot.repository, how: 'fast-forward' })
	return name
}

describe(
	'lot close: what the settle commits closes on the same run',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it('a landed lot with a pending entry, closed by its entry → the entry committed and the worktree closed on the first run', () => {
			const lot = landingLotOf()
			const entry = mergedWithPendingEntry(lot)

			const result = close({ lot, names: [entry] })

			expect({
				outcomes: closeOutcomesOf(result).map((outcome) => outcome.closed),
				entry: lotEntryStateOf(lot),
				worktreeLeft: existsSync(lot.worktree),
			}).toEqual({ outcomes: [true], entry: 'committed', worktreeLeft: false })
		})

		it('a landed lot with a pending entry, closed by its id → the entry committed and the worktree closed on the first run', () => {
			const lot = landingLotOf()
			mergedWithPendingEntry(lot)

			const result = close({ lot, names: [lot.name] })

			expect({
				outcomes: closeOutcomesOf(result).map((outcome) => outcome.closed),
				entry: lotEntryStateOf(lot),
				worktreeLeft: existsSync(lot.worktree),
			}).toEqual({ outcomes: [true], entry: 'committed', worktreeLeft: false })
		})

		it('a lot closed by its id with a committed hand-over of its worktree outside the store → that hand-over closed with it: a later close of it answers already closed', () => {
			const lot = landingLotOf()
			writeLandedFact({ lot, tip: lot.tip })
			const handover = registerCommittedHandover(lot)
			expect(closeOutcomesOf(close({ lot, names: [lot.name] }))).toEqual([
				{ closed: true, landed: expect.stringContaining('landed on main') },
			])

			const again = close({ lot, names: [handover] })

			expect({ exitCode: again.exitCode, outcomes: closeOutcomesOf(again) }).toEqual({
				exitCode: 0,
				outcomes: [
					{ closed: true, already: true, landed: expect.stringContaining('landed on main') },
				],
			})
		})

		it('a committed hand-over of the worktree registered through a symbolic link → closed with it all the same: a later close of it answers already closed', () => {
			const lot = landingLotOf()
			writeLandedFact({ lot, tip: lot.tip })
			const alias = join(realpathSync(temporaryFolder('dialecte-worktree-alias-')), 'alias')
			symlinkSync(lot.worktree, alias)
			const folder = realpathSync(temporaryFolder('dialecte-handover-'))
			const handover = registerHandover({
				root: alias,
				folder,
				branch: lot.branch,
				now: LANDING_NOW,
			})
			recordHandoverState({
				store: handoverStoreOf(lot.workspace.repository),
				folder,
				state: 'committed',
			})
			writeHookRecordAtHead(lot.worktree)
			expect(
				closeOutcomesOf(close({ lot, names: [lot.name] })).map((outcome) => outcome.closed),
			).toEqual([true])

			const again = close({ lot, names: [handover] })

			expect({ exitCode: again.exitCode, outcomes: closeOutcomesOf(again) }).toEqual({
				exitCode: 0,
				outcomes: [
					// the alias points nowhere once the worktree went: no lot is reached through it for a landed line
					{ closed: true, already: true },
				],
			})
		})
	},
)
