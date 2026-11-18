/**
 * `worktree prune` leaves a store lot's items to the lot's own close (DESIGN 3.7): an open lot's worktree and review
 * throwaway are kept for the lot, a committed or canceled lot's are listed as its own, naming `lot close`; it reads no
 * landing and writes no landed fact; `--yes` removes none of them.
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
	pruneArgumentsOf,
	pruneFatesOf,
	registerLotEntry,
	writeLandedFact,
} from '../../test/landing-lot.ts'
import { commitDetached, editOnOrigin, mergeOnOrigin } from '../../test/landing-repository.ts'
import { git } from '../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
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

/** The line of an item of the lot `name` in `state`, on `branch`: open, it is kept for the lot; closed, it is the lot's own. */
function lotItemLine(params: { branch: string; name: string; state: string }): string {
	const { branch, name, state } = params
	return state === 'committed' || state === 'canceled'
		? `${branch}: lot ${name} ${state}: its own item, closed by dialecte lot close ${name}`
		: `${branch}: lot ${name} ${state}`
}

const PRUNE_ROWS: PruneRow[] = [
	{
		title:
			'worktree prune of a squash-merged working lot → kept for the lot, landed.json not written',
		arrange: (lot) => {
			mergeOnOrigin({ repository: lot.repository, how: 'squash' })
			return { worktree: lot.worktree }
		},
		fate: (lot) => lotItemLine({ branch: lot.branch, name: lot.name, state: 'working' }),
		landed: false,
	},
	{
		title: 'squash, then main edits the same lines → kept for the lot, nothing read offline',
		arrange: (lot) => {
			mergeOnOrigin({ repository: lot.repository, how: 'squash' })
			editOnOrigin({ repository: lot.repository, files: { [LANDING_LOT_FILE]: MAIN_EDIT_TEXT } })
			return { worktree: lot.worktree }
		},
		fate: (lot) => lotItemLine({ branch: lot.branch, name: lot.name, state: 'working' }),
		landed: false,
	},
	{
		title: 'a squash-merged lot with a commit made after the merge → kept for the lot',
		arrange: (lot) => {
			mergeOnOrigin({ repository: lot.repository, how: 'squash' })
			commitAfterLanding({ lot, file: AFTER_LANDING_FILE })
			return { worktree: lot.worktree }
		},
		fate: (lot) => lotItemLine({ branch: lot.branch, name: lot.name, state: 'working' }),
		landed: false,
	},
	{
		title:
			'a -round-<n> throwaway of a squash-merged working lot → kept for the lot, never removed by prune',
		arrange: (lot) => {
			const round = addRoundOf({ lot, round: 2 })
			mergeOnOrigin({ repository: lot.repository, how: 'squash' })
			return { worktree: round }
		},
		fate: (lot) =>
			lotItemLine({ branch: `${lot.branch}-round-2`, name: lot.name, state: 'working' }),
		landed: false,
	},
	{
		title:
			'a lot the registry records committed, its work not on main → the lot’s own, naming lot close',
		arrange: (lot) => {
			registerLotEntry({ lot })
			return { worktree: lot.worktree }
		},
		fate: (lot) => lotItemLine({ branch: lot.branch, name: lot.name, state: 'committed' }),
		landed: false,
	},
	{
		title:
			'a landed lot with no registry entry (its landed fact only), its worktree present → the lot’s own',
		arrange: (lot) => {
			writeLandedFact({ lot, tip: lot.tip })
			return { worktree: lot.worktree }
		},
		fate: (lot) => lotItemLine({ branch: lot.branch, name: lot.name, state: 'committed' }),
		landed: true,
	},
	{
		title:
			'a -round-<n> throwaway of a lot the registry records committed, its work squash-merged → the lot’s own, never removed by prune',
		arrange: (lot) => {
			registerLotEntry({ lot })
			const round = addRoundOf({ lot, round: 2 })
			mergeOnOrigin({ repository: lot.repository, how: 'squash' })
			return { worktree: round }
		},
		fate: (lot) =>
			lotItemLine({ branch: `${lot.branch}-round-2`, name: lot.name, state: 'committed' }),
		landed: false,
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
	it('18. a landed lot whose worktree folder is gone, its HEAD reflog holding a detached commit → the lot’s own, git worktree prune not run', async () => {
		const lot = landingLotOf()
		writeLandedFact({ lot, tip: lot.tip })
		commitDetached({
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
			fate: lotItemLine({ branch: lot.branch, name: lot.name, state: 'committed' }),
			pruned: false,
		})
	})
})

describe('worktree prune --yes: lot items stay', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a squash-merged lot the registry records committed, with a review throwaway, worktree prune --yes confirmed → both still there and registered', async () => {
		const lot = landingLotOf()
		registerLotEntry({ lot })
		const round = addRoundOf({ lot, round: 2 })
		mergeOnOrigin({ repository: lot.repository, how: 'squash' })

		await runWorktreePrune({
			...pruneArgumentsOf(lot),
			argv: ['--root', lot.workspace.workspace, '--yes'],
			isTerminal: true,
			confirm: async function yes() {
				return true
			},
		})

		const listed = git({
			root: lot.workspace.repository,
			args: ['worktree', 'list', '--porcelain'],
		})
		expect({
			worktree: existsSync(lot.worktree),
			round: existsSync(round),
			registered: [lot.worktree, round].map((path) => listed.includes(`worktree ${path}\n`)),
		}).toEqual({ worktree: true, round: true, registered: [true, true] })
	})
})
