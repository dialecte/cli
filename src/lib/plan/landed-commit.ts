/**
 * The commits a `plan mark --landed` names, checked against the remote truth: one commit per repository of the entry,
 * origin fetched, each commit held by origin's base branch there (`refs/remotes/origin/<base>`) and touching the
 * entry's scope in that repository.
 */
import { findBaseBranchRef } from '../gate/gate-base.ts'
import { fetchOrigin, isAncestorCommit, readGit, tryReadGit } from '../git.ts'
import { readPackageJson } from '../package-json.ts'
import {
	CHANGED_PATHS_ARGUMENTS,
	LANDED_COMMIT_LINES,
	LANDED_REPOSITORY_SEPARATOR,
	ORIGIN_BASE_REF_PREFIX,
} from './plan.constants.ts'

import type { LandedCommit } from './plan.types.ts'

/**
 * The landed commit of each repository of the entry, in the order of its scope, or why the mark is refused: each
 * `--landed` value is `<repository>:<sha>`, or a bare `<sha>` for an entry of one repository; every repository of the
 * scope needs exactly one; each commit must be on origin's base branch there and touch the entry's scope there.
 *
 * @intent mark a lot or fix entry done by the commits that landed it outside the lot store
 * @internal
 */
export function findLandedCommits(params: {
	/** The `--landed` values, in order. */
	given: readonly string[]
	/** The entry's scope: its paths by repository name. */
	scope: Record<string, string[]>
	/** The plan's repositories: their folders by name. */
	repositories: Record<string, string>
}): LandedCommit[] | { refusal: string } {
	const names = Object.keys(params.scope)
	const named = namedShas({ given: params.given, names })
	if ('refusal' in named) return named
	const missing = names.filter(function notGiven(name) {
		return !named.has(name)
	})
	if (missing.length > 0)
		return {
			refusal: LANDED_COMMIT_LINES.missing
				.replace('{repositories}', () => names.join(', '))
				.replace('{missing}', () => missing.join(', ')),
		}
	const found: LandedCommit[] = []
	for (const name of names) {
		const landed = landedIn({
			sha: named.get(name) ?? '',
			repository: name,
			root: params.repositories[name],
			scope: params.scope[name],
		})
		if ('refusal' in landed) return { refusal: `${name}: ${landed.refusal}` }
		found.push(landed)
	}
	return found
}

/** Each `--landed` value by the repository it names (a bare sha names the entry's one repository), or the refusal. */
function namedShas(params: {
	given: readonly string[]
	names: readonly string[]
}): Map<string, string> | { refusal: string } {
	const named = new Map<string, string>()
	for (const value of params.given) {
		const separator = value.indexOf(LANDED_REPOSITORY_SEPARATOR)
		const bare = separator === -1
		if (bare && params.names.length !== 1)
			return {
				refusal: LANDED_COMMIT_LINES.bareOverSeveral.replace('{repositories}', () =>
					params.names.join(', '),
				),
			}
		const name = bare ? params.names[0] : value.slice(0, separator)
		const sha = bare ? value : value.slice(separator + 1)
		if (!params.names.includes(name))
			return {
				refusal: LANDED_COMMIT_LINES.notInScope
					.replace('{repository}', () => name)
					.replace('{repositories}', () => params.names.join(', ')),
			}
		if (named.has(name))
			return { refusal: LANDED_COMMIT_LINES.twice.replace('{repository}', () => name) }
		named.set(name, sha)
	}
	return named
}

/** The commit in one repository, on its origin base branch and touching the entry's scope there, or why not. */
function landedIn(params: {
	sha: string
	repository: string
	root: string
	scope: readonly string[]
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
	if (!touchesScope({ root, commit, scope: params.scope }))
		return {
			refusal: LANDED_COMMIT_LINES.outsideScope
				.replace('{sha}', () => sha)
				.replace('{scope}', () => params.scope.join(', ')),
		}
	return { commit, repository: params.repository }
}

/** Whether the commit changes a path of the scope: the path itself, or one under it (`src/a` holds `src/a/a.ts`). */
function touchesScope(params: { root: string; commit: string; scope: readonly string[] }): boolean {
	const paths = readGit({ root: params.root, args: [...CHANGED_PATHS_ARGUMENTS, params.commit] })
		.split('\n')
		.filter(Boolean)
	return paths.some(function inScope(path) {
		return params.scope.some(function covers(entry) {
			const folder = entry.endsWith('/') ? entry : `${entry}/`
			return path === entry || path.startsWith(folder)
		})
	})
}
