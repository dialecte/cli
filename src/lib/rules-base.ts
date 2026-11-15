import { resolveGateBase } from './gate/gate-base.ts'
import { tryReadGit } from './git.ts'
import { readPackageJson } from './package-json.ts'
import { RELEASE_TAG_PATTERN } from './rules-base.constants.ts'
import { readIdentity } from './store/identity.ts'
import { lotOfWorktree } from './store/resolve-lot.ts'

import type { RulesBaseSource } from './rules-base.types.ts'

/**
 * The base the quality rules judge the changed lines of the package at `root` against, one order for every caller
 * (the gate's scoped rules step through `readAddedLines`, contrib's rules row, `dialecte rules` without a gate base,
 * the rehearsal's resolver): the commit `resolveRulesBaseSource` finds; undefined: no base, every error is kept.
 */
export function resolveRulesBase(params: {
	root: string
	head?: string
	emptyTreeRequest?: boolean
}): string | undefined {
	return resolveRulesBaseSource(params)?.commit
}

/**
 * The base of `resolveRulesBase` with where it came from, so a caller can name it:
 * 1. the recorded base commit of the store lot whose worktree holds `root`, with the lot's name (not followed
 *    forward when the lot merged its base branch: the lines that merge brought in count as added);
 * 2. the base branch's merge-base with `head` (default HEAD), as `resolveGateBase` resolves it; for
 *    an empty-tree request (`gate --release`) a merge-base equal to head's commit knows no change and is no answer
 *    (on a branch or detached), so the order goes on;
 * 3. the commit of the package's last release tag `<name>@v*` reachable from `head`, with the tag, for any run;
 * 4. undefined: no base.
 */
export function resolveRulesBaseSource(params: {
	root: string
	head?: string
	emptyTreeRequest?: boolean
}): RulesBaseSource | undefined {
	const { root } = params
	const lotFolder = lotOfWorktree({ cwd: root })
	const identity = lotFolder === undefined ? undefined : readIdentity({ lotFolder })
	const recorded = identity?.base?.commit
	if (identity !== undefined && recorded !== undefined)
		return { commit: recorded, source: 'lot', lot: identity.name }
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
		return { commit: resolved.commit, source: 'base-branch' }
	const release = readLastRelease({
		root,
		...(params.head !== undefined && { head: params.head }),
	})
	return release === undefined ? undefined : { ...release, source: 'release-tag' }
}

/** The commit of `head` (default HEAD) in the repository at `root`; undefined when git cannot read it. */
function readHeadCommit(params: { root: string; head?: string }): string | undefined {
	return tryReadGit({
		root: params.root,
		args: ['rev-parse', '--verify', '--quiet', `${params.head ?? 'HEAD'}^{commit}`],
	})?.trim()
}

/**
 * The last release tag `<name>@v<version>` of the package at `root` (its package.json `name`) reachable from `head`
 * (default HEAD), with its commit; undefined without a name or such a tag.
 */
function readLastRelease(params: {
	root: string
	head?: string
}): { commit: string; tag: string } | undefined {
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
	const commit = tryReadGit({
		root,
		args: ['rev-parse', '--verify', '--quiet', `${tag}^{commit}`],
	})?.trim()
	return commit ? { commit, tag } : undefined
}
