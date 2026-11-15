import { resolveGateBase } from './gate/gate-base.ts'
import { tryReadGit } from './git.ts'
import { readPackageJson } from './package-json.ts'
import { RELEASE_TAG_PATTERN } from './rules-base.constants.ts'
import { readIdentity } from './store/identity.ts'
import { lotOfWorktree } from './store/resolve-lot.ts'

/**
 * The base the quality rules judge the changed lines of the package at `root` against, one order for every caller
 * (the gate's scoped rules step through `readAddedLines`, contrib's rules row, the rehearsal's resolver):
 * 1. the recorded base commit of the store lot whose worktree holds `root` (not followed forward when the lot merged
 *    its base branch: the lines that merge brought in count as added);
 * 2. the base branch's merge-base with `head` (default HEAD), as `resolveGateBase` resolves it; for an empty-tree
 *    request (`gate --release`) a merge-base equal to head's commit knows no change and is no answer (on a branch or
 *    detached), so the order goes on;
 * 3. the commit of the package's last release tag `<name>@v*` reachable from `head`, for any run
 *    (`readLastReleaseCommit`);
 * 4. undefined: no base, every error is kept.
 */
export function resolveRulesBase(params: {
	root: string
	head?: string
	emptyTreeRequest?: boolean
}): string | undefined {
	const { root } = params
	const lotFolder = lotOfWorktree({ cwd: root })
	const recorded = lotFolder === undefined ? undefined : readIdentity({ lotFolder })?.base?.commit
	if (recorded !== undefined) return recorded
	const resolved = resolveGateBase({
		root,
		...(params.head !== undefined && { head: params.head }),
	})
	// the empty tree (no base branch found) and a refused base branch are no base
	if (
		!('refusal' in resolved) &&
		resolved.source === 'base-branch' &&
		!(params.emptyTreeRequest === true && resolved.commit === readHeadCommit(params))
	)
		return resolved.commit
	return readLastReleaseCommit({
		root,
		...(params.head !== undefined && { head: params.head }),
	})
}

/** The commit of `head` (default HEAD) in the repository at `root`; undefined when git cannot read it. */
function readHeadCommit(params: { root: string; head?: string }): string | undefined {
	return tryReadGit({
		root: params.root,
		args: ['rev-parse', '--verify', '--quiet', `${params.head ?? 'HEAD'}^{commit}`],
	})?.trim()
}

/**
 * The commit of the last release tag `<name>@v<version>` of the package at `root` (its package.json `name`)
 * reachable from `head` (default HEAD); undefined without a name or such a tag.
 */
export function readLastReleaseCommit(params: { root: string; head?: string }): string | undefined {
	const { root } = params
	const name = readPackageJson(root).name
	if (name === undefined) return undefined
	const tag = tryReadGit({
		root,
		args: [
			'describe',
			'--tags',
			'--abbrev=0',
			'--match',
			RELEASE_TAG_PATTERN.replace('{name}', () => name),
			params.head ?? 'HEAD',
		],
	})?.trim()
	if (!tag) return undefined
	return tryReadGit({ root, args: ['rev-parse', '--verify', '--quiet', `${tag}^{commit}`] })?.trim()
}
