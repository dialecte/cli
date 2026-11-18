/**
 * `worktree prune` reads the landing state from git alone (FIX-ci-loop design, sections 1, 2 and 5): a squash-merged
 * lot is removable, a squash main edited again is named as not provable offline, work after the landing keeps the
 * worktree, a lot the registry records committed goes only once its work is in main, and a review throwaway goes with
 * its landed lot, through the same landing and loss checks, and stays with an unlanded one.
 */
import { existsSync, rmSync } from 'node:fs'
import { basename, join } from 'node:path'

import {
	AFTER_LANDING_FILE,
	LANDING_LOT_FILE,
	MAIN_EDIT_TEXT,
} from '../../test/landing-lot.constants.ts'
import {
	addRoundOf,
	commitAfterLanding,
	landingLotOf,
	lotHeadOf,
	pruneArgumentsOf,
	pruneFatesOf,
	registerLotEntry,
	writeLandedFact,
} from '../../test/landing-lot.ts'
import { commitDetached, editOnOrigin, mergeOnOrigin } from '../../test/landing-repository.ts'
import { REMOVABLE } from '../../test/lot-keep-workspace.constants.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { SHORT_SHA_LENGTH } from '../lib/gate-records/gate-records.constants.ts'
import { runWorktreePrune } from './worktree.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { LandingLot } from '../../test/landing-lot.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** What a prune row sets up after the lot's first commit: the worktree whose fate it reads, by folder name. */
type PruneRow = {
	title: string
	arrange: (lot: LandingLot) => { worktree: string }
	/** The fate of that worktree: its keep reason, or `removable`. */
	fate: (lot: LandingLot) => string
	/** Whether the plan leaves the lot's landed fact (`landed.json`) in its folder. */
	landed: boolean
}

/** The line of a lot's branch holding `commit` made since its landing. */
function sinceLine(params: { branch: string; commit: string }): string {
	return `${params.branch}: 1 commit(s) made since its landing: ${params.commit.slice(0, SHORT_SHA_LENGTH)}`
}

/** The line of a branch whose work main does not hold: not landed. */
function notLandedLine(branch: string): string {
	return `${branch}: not landed: its work is not in main`
}

const PRUNE_ROWS: PruneRow[] = [
	{
		title: 'worktree prune of a squash-merged lot → removable',
		arrange: (lot) => {
			mergeOnOrigin({ repository: lot.repository, how: 'squash' })
			return { worktree: lot.worktree }
		},
		fate: () => REMOVABLE,
		landed: true,
	},
	{
		title:
			'squash, then main edits the same lines, git only → prune keeps it naming landing not provable offline: run lot close',
		arrange: (lot) => {
			mergeOnOrigin({ repository: lot.repository, how: 'squash' })
			editOnOrigin({ repository: lot.repository, files: { [LANDING_LOT_FILE]: MAIN_EDIT_TEXT } })
			return { worktree: lot.worktree }
		},
		fate: (lot) =>
			`${lot.branch}: landing not provable offline: run lot close ${lot.name}, which asks the host`,
		landed: false,
	},
	{
		title:
			'a squash-merged lot with a commit made after the merge → prune keeps it naming the commits',
		arrange: (lot) => {
			mergeOnOrigin({ repository: lot.repository, how: 'squash' })
			commitAfterLanding({ lot, file: AFTER_LANDING_FILE })
			return { worktree: lot.worktree }
		},
		fate: (lot) => sinceLine({ branch: lot.branch, commit: lotHeadOf(lot) }),
		landed: false,
	},
	{
		title: 'a -round-<n> throwaway of a landed lot → prune removes it',
		arrange: (lot) => {
			const round = addRoundOf({ lot, round: 2 })
			mergeOnOrigin({ repository: lot.repository, how: 'squash' })
			return { worktree: round }
		},
		fate: () => REMOVABLE,
		landed: true,
	},
	{
		title: 'a -round-<n> throwaway of an unlanded lot → prune keeps it',
		arrange: (lot) => ({ worktree: addRoundOf({ lot, round: 2 }) }),
		fate: (lot) => `${lot.branch}-round-2: a review throwaway of lot ${lot.name}, not landed`,
		landed: false,
	},
	{
		title: 'a lot the registry records committed, its work not on main → kept, not landed',
		arrange: (lot) => {
			registerLotEntry({ lot })
			return { worktree: lot.worktree }
		},
		fate: (lot) => notLandedLine(lot.branch),
		landed: false,
	},
	{
		title:
			'a -round-<n> throwaway of a lot the registry records committed, its work not on main → kept, not landed, never removed without the check',
		arrange: (lot) => {
			registerLotEntry({ lot })
			return { worktree: addRoundOf({ lot, round: 2 }) }
		},
		fate: (lot) => notLandedLine(`${lot.branch}-round-2`),
		landed: false,
	},
	{
		title:
			'a -round-<n> throwaway of a lot the registry records committed, its work squash-merged → removable',
		arrange: (lot) => {
			registerLotEntry({ lot })
			const round = addRoundOf({ lot, round: 2 })
			mergeOnOrigin({ repository: lot.repository, how: 'squash' })
			return { worktree: round }
		},
		fate: () => REMOVABLE,
		landed: true,
	},
]

describe('worktree prune: the landing state', { timeout: STORE_CASE_TIMEOUT }, () => {
	for (const row of PRUNE_ROWS)
		it(row.title, async () => {
			const lot = landingLotOf()
			const { worktree } = row.arrange(lot)

			await expect(
				pruneFatesOf(runWorktreePrune(pruneArgumentsOf(lot))).then((fates) => ({
					fate: fates[basename(worktree)],
					landed: existsSync(join(lot.lotFolder, 'landed.json')),
				})),
			).resolves.toEqual({ fate: row.fate(lot), landed: row.landed })
		})
})

describe('worktree prune: a worktree whose folder is gone', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('18. a landed lot whose worktree folder is gone, its HEAD reflog holding a detached commit → kept, the commit named, git worktree prune not run', async () => {
		const lot = landingLotOf()
		writeLandedFact({ lot, tip: lot.tip })
		const detached = commitDetached({
			worktree: lot.worktree,
			files: { 'src/detached.ts': 'export const detached = 1\n' },
			reattach: true,
		})
		rmSync(lot.worktree, { recursive: true, force: true })
		const planned = runWorktreePrune(pruneArgumentsOf(lot))

		await expect(
			pruneFatesOf(planned).then(async (fates) => ({
				fate: fates[basename(lot.worktree)],
				pruned: (await planned).output.includes('git worktree prune'),
			})),
		).resolves.toEqual({
			fate: `${lot.branch}: 1 commit(s) its removal would lose: ${detached.slice(0, SHORT_SHA_LENGTH)}`,
			pruned: false,
		})
	})
})
