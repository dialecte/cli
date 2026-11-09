/**
 * `lot stop` on a ready lot whose worktree is gone (R1-3, case 44's setup): the abandon is given the lot's own
 * registry, so the entry still becomes `abandoned`, the hand-over lock of that worktree is released or absent, and a
 * `canceled` transition is published; a second stop exits 0 and writes nothing.
 */
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

import { entryPathOf } from '../../test/lot-handover-workspace.ts'
import { transitionFilesOf } from '../../test/lot-questions.ts'
import { snapshotOf } from '../../test/lot-start-workspace.ts'
import { readyLot, stopLot } from '../../test/lot-stop-workspace.ts'
import { commonGitDirOf } from '../../test/scratch-tree.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { handoverLockPath } from '../lib/handover/handover-lock.ts'
import {
	LINKED_WORKTREE_GITDIR_FILE,
	LINKED_WORKTREES_FOLDER,
} from '../lib/handover/handover.constants.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { LotHandoverWorkspace } from '../../test/lot-handover-workspace.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/**
 * Deletes the worktree folder by hand: git keeps `<common>/worktrees/<name>` and the lock in it. With
 * `relativeGitdir`, that folder's `gitdir` entry is rewritten as a path relative to it first.
 */
function deleteWorktreeByHand(params: {
	lot: LotHandoverWorkspace
	relativeGitdir: boolean
}): void {
	const { lot } = params
	if (params.relativeGitdir) {
		const folder = join(commonGitDirOf(lot.start.repository), LINKED_WORKTREES_FOLDER)
		const name = readdirSync(folder).find((each) =>
			readFileSync(join(folder, each, LINKED_WORKTREE_GITDIR_FILE), 'utf8')
				.trim()
				.startsWith(lot.worktree),
		)
		if (name === undefined) throw new Error(`git keeps no folder for ${lot.worktree}`)
		writeFileSync(
			join(folder, name, LINKED_WORKTREE_GITDIR_FILE),
			`${relative(join(folder, name), join(lot.worktree, '.git'))}\n`,
		)
	}
	rmSync(lot.worktree, { recursive: true, force: true })
}

describe('lot stop on a ready lot with no worktree left', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('the worktree relative gitdir, deleted by hand -> the entry abandoned, the lock of that worktree gone, a canceled transition', () => {
		const { lot, name } = readyLot()
		const lockPath = handoverLockPath(lot.worktree)
		deleteWorktreeByHand({ lot, relativeGitdir: true })

		expect(existsSync(lockPath)).toBe(true)
		expect(stopLot({ lot }).exitCode).toBe(0)
		expect({
			entry: (JSON.parse(readFileSync(entryPathOf({ lot, name }), 'utf8')) as { state: string })
				.state,
			lockHeld: existsSync(lockPath),
			last: transitionFilesOf(lot.lotFolder).at(-1)?.state,
		}).toEqual({ entry: 'abandoned', lockHeld: false, last: 'canceled' })
	})

	it('the worktree removed -> the entry abandoned, the lock of that worktree gone, a canceled transition; a second stop exits 0 and writes nothing', () => {
		const { lot, name } = readyLot()
		const lockPath = handoverLockPath(lot.worktree)
		deleteWorktreeByHand({ lot, relativeGitdir: false })

		expect(existsSync(lockPath)).toBe(true)
		expect(stopLot({ lot }).exitCode).toBe(0)
		expect({
			entry: (JSON.parse(readFileSync(entryPathOf({ lot, name }), 'utf8')) as { state: string })
				.state,
			lockHeld: existsSync(lockPath),
			last: transitionFilesOf(lot.lotFolder).at(-1)?.state,
		}).toEqual({ entry: 'abandoned', lockHeld: false, last: 'canceled' })

		const before = JSON.stringify([
			snapshotOf(lot.lotFolder),
			snapshotOf(lot.start.workspace.registry),
		])

		expect(stopLot({ lot }).exitCode).toBe(0)
		expect(
			JSON.stringify([snapshotOf(lot.lotFolder), snapshotOf(lot.start.workspace.registry)]),
		).toBe(before)
	})
})
