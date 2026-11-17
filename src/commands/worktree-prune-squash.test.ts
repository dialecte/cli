/**
 * `worktree prune` reads the landing state from git alone (FIX-ci-loop design, sections 1, 2 and 5): a squash-merged
 * lot is removable, a squash main edited again is named as not provable offline, work after the landing keeps the
 * worktree, and a review throwaway goes with its landed lot and stays with an unlanded one.
 */
import { existsSync } from 'node:fs'
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
} from '../../test/landing-lot.ts'
import { editOnOrigin, mergeOnOrigin } from '../../test/landing-repository.ts'
import { REMOVABLE } from '../../test/lot-keep-workspace.constants.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { SHORT_SHA_LENGTH } from '../lib/gate-records/gate-records.constants.ts'
import { runWorktreePrune } from './worktree.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

describe('worktree prune: the landing state', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('worktree prune of a squash-merged lot → removable, landed.json written', async () => {
		const lot = landingLotOf()
		mergeOnOrigin({ repository: lot.repository, how: 'squash' })

		await expect(pruneFatesOf(runWorktreePrune(pruneArgumentsOf(lot)))).resolves.toMatchObject({
			[lot.name]: REMOVABLE,
		})
		expect(existsSync(join(lot.lotFolder, 'landed.json'))).toBe(true)
	})

	it('squash, then main edits the same lines, git only → prune keeps it naming landing not provable offline: run lot close', async () => {
		const lot = landingLotOf()
		mergeOnOrigin({ repository: lot.repository, how: 'squash' })
		editOnOrigin({ repository: lot.repository, files: { [LANDING_LOT_FILE]: MAIN_EDIT_TEXT } })

		await expect(pruneFatesOf(runWorktreePrune(pruneArgumentsOf(lot)))).resolves.toMatchObject({
			[lot.name]: `${lot.branch}: landing not provable offline: run lot close ${lot.name}, which asks the host`,
		})
	})

	it('a squash-merged lot with a commit made after the merge → prune keeps it naming the commits', async () => {
		const lot = landingLotOf()
		mergeOnOrigin({ repository: lot.repository, how: 'squash' })
		const after = commitAfterLanding({ lot, file: AFTER_LANDING_FILE })

		await expect(pruneFatesOf(runWorktreePrune(pruneArgumentsOf(lot)))).resolves.toMatchObject({
			[lot.name]: `${lot.branch}: 1 commit(s) of work not in main: ${after.slice(0, SHORT_SHA_LENGTH)}`,
		})
	})

	it('a -round-<n> throwaway of a landed lot → prune removes it', async () => {
		const lot = landingLotOf()
		const round = addRoundOf({ lot, round: 2 })
		mergeOnOrigin({ repository: lot.repository, how: 'squash' })

		await expect(pruneFatesOf(runWorktreePrune(pruneArgumentsOf(lot)))).resolves.toMatchObject({
			[basename(round)]: REMOVABLE,
		})
	})

	it('a -round-<n> throwaway of an unlanded lot → prune keeps it', async () => {
		const lot = landingLotOf()
		const round = addRoundOf({ lot, round: 2 })

		await expect(pruneFatesOf(runWorktreePrune(pruneArgumentsOf(lot)))).resolves.toMatchObject({
			[basename(round)]: `${lot.branch}-round-2: a review throwaway of lot ${lot.name}, not landed`,
		})
	})
})
