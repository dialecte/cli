/**
 * A lot with a review round taken and its throwaway made, by the cli's own code: `takeSnapshot` writes `round-1/` from
 * the lot worktree's changes, `addThrowaway` makes the throwaway on `<lot branch>-round-1` and copies the snapshot over
 * it, as `lot snapshot` and `lot delta --worktree` do.
 */
import { mkdirSync, realpathSync } from 'node:fs'
import { join } from 'node:path'

import { addThrowaway } from '../src/lib/review-rounds/review-delta.ts'
import { takeSnapshot } from '../src/lib/review-rounds/snapshot-round.ts'
import { readWorktreeState } from '../src/lib/review-rounds/worktree-state.ts'
import { THROWAWAY_LOT_BRANCH, THROWAWAY_WORKSPACE_NOW } from './lot-prune-workspace.constants.ts'
import { git, initializeRepository, temporaryFolder, writeFiles } from './scratch-repository.ts'

import type { ThrowawayWorkspace } from './lot-prune-workspace.types.ts'

/**
 * The workspace: a repository holding `committed` on `main`, a lot worktree on `feat/fix` with one commit of its own
 * and `changed` written in it (uncommitted: the round's state), round 1 snapshot into the lot folder, and the
 * throwaway made from it.
 */
export function createThrowawayWorkspace(params: {
	committed: Record<string, string>
	changed: Record<string, string>
	/** Run in the lot worktree after `changed` is written, before the snapshot (a `git mv`, a deletion). */
	beforeSnapshot?: (lotWorktree: string) => void
}): ThrowawayWorkspace {
	const top = realpathSync(temporaryFolder('dialecte-lot-prune-'))
	const repository = initializeRepository({ root: join(top, 'repo'), files: params.committed })
	const lotWorktree = join(top, '.worktrees', '0001-repo-fix')
	git({
		root: repository,
		args: ['worktree', 'add', '-q', '-b', THROWAWAY_LOT_BRANCH, lotWorktree],
	})
	writeFiles({ root: lotWorktree, files: { 'src/lot.ts': 'export const lot = 1\n' } })
	git({ root: lotWorktree, args: ['add', 'src/lot.ts'] })
	git({ root: lotWorktree, args: ['commit', '-q', '-m', 'feat: the lot'] })
	writeFiles({ root: lotWorktree, files: params.changed })
	params.beforeSnapshot?.(lotWorktree)
	const lotFolder = join(top, 'lots', '0001-repo-fix')
	mkdirSync(lotFolder, { recursive: true })
	takeSnapshot({
		root: lotWorktree,
		folder: lotFolder,
		round: 1,
		state: readWorktreeState(lotWorktree),
		at: THROWAWAY_WORKSPACE_NOW,
	})
	const made = addThrowaway({
		root: lotWorktree,
		folder: lotFolder,
		previous: 1,
		branch: THROWAWAY_LOT_BRANCH,
		now: THROWAWAY_WORKSPACE_NOW,
	})
	if (typeof made === 'string') throw new Error(made)
	return {
		repository,
		lotWorktree,
		lotBranch: THROWAWAY_LOT_BRANCH,
		lotFolder,
		throwaway: made.path,
		branch: made.branch,
		round: 1,
	}
}

/** Commits `files` on the lot's branch in its worktree (a fix landing there after the round): the new tip. */
export function commitOnLotBranch(params: {
	workspace: ThrowawayWorkspace
	files: Record<string, string>
}): string {
	const { lotWorktree } = params.workspace
	writeFiles({ root: lotWorktree, files: params.files })
	git({ root: lotWorktree, args: ['add', '--', ...Object.keys(params.files)] })
	git({ root: lotWorktree, args: ['commit', '-q', '-m', 'fix: after the round'] })
	return git({ root: lotWorktree, args: ['rev-parse', 'HEAD'] }).trim()
}
