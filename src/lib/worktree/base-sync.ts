/**
 * The base branch brought up to the host's once a lot landed there (a merge queue merges on the host, so the local
 * base branch goes stale): origin fetched, then the local branch fast-forwarded when it is behind.
 */
import { spawnSync } from 'node:child_process'
import { realpathSync } from 'node:fs'

import { SHORT_SHA_LENGTH } from '../gate-records/gate-records.constants.ts'
import { ORIGIN_BRANCH_REF_PREFIX } from '../gate/gate-base.constants.ts'
import { findBaseBranchRef } from '../gate/gate-base.ts'
import { fetchOrigin, isAncestorCommit, readGit, tryReadGit } from '../git.ts'
import { readPackageJson } from '../package-json.ts'
import { listWorktrees } from './add-worktree.ts'
import { BASE_SYNC_LINES } from './worktree.constants.ts'

/**
 * Fetches origin for the repository at `root` and fast-forwards its local base branch to origin's when behind: merged
 * in the main checkout when it is checked out there and clean, its ref moved when no worktree holds it. The lines to
 * print: the move, or why it did not move (changes, checked out in another worktree, a local commit origin lacks, git's
 * own refusal), a failed fetch; none when there is no origin or nothing to do. Never throws for a refused move.
 *
 * @intent keep the local base branch the host's after a landing
 * @internal
 */
export function syncBaseBranch(params: { root: string }): string[] {
	const { root } = params
	const fetchProblem = fetchOrigin({ root })
	if (fetchProblem !== undefined) return [fetchProblem]
	const found = findBaseBranchRef({ root, packageJson: readPackageJson(root) })
	if ('refusal' in found) return []
	const { branch } = found
	const local = `refs/heads/${branch}`
	const localTip = tryReadGit({ root, args: ['rev-parse', '--verify', '--quiet', local] })?.trim()
	const originTip = tryReadGit({
		root,
		args: ['rev-parse', '--verify', '--quiet', `${ORIGIN_BRANCH_REF_PREFIX}${branch}`],
	})?.trim()
	if (localTip === undefined || originTip === undefined || localTip === originTip) return []
	const commit = originTip.slice(0, SHORT_SHA_LENGTH)
	function fill(line: string): string {
		return line.replaceAll('{branch}', () => branch).replace('{commit}', commit)
	}
	if (!isAncestorCommit({ root, ancestor: localTip, descendant: originTip }))
		return isAncestorCommit({ root, ancestor: originTip, descendant: localTip })
			? []
			: [fill(BASE_SYNC_LINES.diverged)]
	const holder = listWorktrees(root).find((worktree) => worktree.branch === branch)
	if (holder !== undefined && realpathSync(holder.path) !== realpathSync(root))
		return [fill(BASE_SYNC_LINES.elsewhere).replace('{worktree}', () => holder.path)]
	if (holder !== undefined) {
		const changes = readGit({
			root,
			args: ['status', '--porcelain', '--untracked-files=no'],
		}).trim()
		if (changes !== '') return [fill(BASE_SYNC_LINES.changes)]
	}
	const refused = moveBase({
		root,
		args: holder
			? ['merge', '--ff-only', '--quiet', originTip]
			: ['update-ref', local, originTip, localTip],
	})
	return [
		refused === undefined
			? fill(BASE_SYNC_LINES.moved)
			: fill(BASE_SYNC_LINES.failed).replace('{reason}', () => refused),
	]
}

/** Runs the git move; undefined when it moved, the first line of git's refusal otherwise (a file in the way, a lock). */
function moveBase(params: { root: string; args: string[] }): string | undefined {
	const run = spawnSync('git', params.args, { cwd: params.root, encoding: 'utf8' })
	if (run.status === 0) return undefined
	return run.stderr.trim().split('\n')[0] || `exit ${run.status}`
}
