import { findBaseBranchRef } from '../gate/gate-base.ts'
/**
 * The commit a `plan mark --landed` names, checked against the remote truth: origin fetched, the commit read in one of
 * the entry's repositories and held by origin's base branch there (`refs/remotes/origin/<base>`).
 */
import { fetchOrigin, isAncestorCommit, tryReadGit } from '../git.ts'
import { readPackageJson } from '../package-json.ts'
import { LANDED_COMMIT_LINES, ORIGIN_BASE_REF_PREFIX } from './plan.constants.ts'

import type { LandedCommit } from './plan.types.ts'

/**
 * The full commit `sha` names and the repository whose origin base branch holds it: the entry's repositories in order
 * (`repositories` maps each name to its folder), the first that holds it wins; else why none does (origin not fetched,
 * no base branch, no such commit, a commit origin's base branch does not hold), one reason per repository.
 *
 * @intent mark a lot or fix entry done by a commit that landed outside the lot store
 * @internal
 */
export function findLandedCommit(params: {
	sha: string
	repositories: Record<string, string>
}): LandedCommit | { refusal: string } {
	const reasons: string[] = []
	for (const [repository, root] of Object.entries(params.repositories)) {
		const found = landedIn({ sha: params.sha, repository, root })
		if ('commit' in found) return found
		reasons.push(`${repository}: ${found.refusal}`)
	}
	return { refusal: reasons.join('; ') }
}

/** The commit in one repository, held by its origin base branch, or why not. */
function landedIn(params: {
	sha: string
	repository: string
	root: string
}): LandedCommit | { refusal: string } {
	const { sha, root } = params
	const fetchProblem = fetchOrigin({ root })
	if (fetchProblem !== undefined)
		return { refusal: LANDED_COMMIT_LINES.notFetched.replace('{reason}', () => fetchProblem) }
	const base = findBaseBranchRef({ root, packageJson: readPackageJson(root) })
	if ('refusal' in base) return { refusal: base.refusal }
	const originRef = `${ORIGIN_BASE_REF_PREFIX}${base.branch}`
	const origin = `origin/${base.branch}`
	if (tryReadGit({ root, args: ['rev-parse', '--verify', '--quiet', originRef] }) === undefined)
		return { refusal: LANDED_COMMIT_LINES.noOriginBase.replace('{origin}', () => origin) }
	const commit = tryReadGit({
		root,
		args: ['rev-parse', '--verify', '--quiet', `${sha}^{commit}`],
	})?.trim()
	if (commit === undefined || commit === '')
		return { refusal: LANDED_COMMIT_LINES.noCommit.replace('{sha}', () => sha) }
	if (!isAncestorCommit({ root, ancestor: commit, descendant: originRef }))
		return {
			refusal: LANDED_COMMIT_LINES.notLanded
				.replace('{sha}', () => sha)
				.replace('{origin}', () => origin),
		}
	return { commit, repository: params.repository }
}
