import { resolveGateBase } from './gate/gate-base.ts'
import { tryReadGit } from './git.ts'
import { readPackageJson } from './package-json.ts'
import { RELEASE_TAG_PATTERN } from './rules-base.constants.ts'
import { readIdentity } from './store/identity.ts'
import { lotOfWorktree } from './store/resolve-lot.ts'
import { fallbackLotBaseOf } from './tdd/lot-fallback-base.ts'
import { resolveTddBase } from './tdd/tdd-base.ts'

import type { RulesBaseSource } from './rules-base.types.ts'
import type { LotIdentity } from './store/store.types.ts'

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
	const resolved = resolveRulesBaseSource(params)
	return resolved === undefined || 'failure' in resolved ? undefined : resolved.commit
}

/**
 * The base of `resolveRulesBase` with where it came from, so a caller can name it:
 * 1. in the worktree of a store lot, its lot base read from git (`resolveTddBase`: its fork point from the base branch,
 *    or from its parent's line while the lot it was started on is open), with the lot's name; never the base recorded
 *    at its start, which a rebase leaves behind. HEAD (no base branch found) is no lot base: the lot takes the shared
 *    fallback (`fallbackLotBaseOf`: the newest of its recorded commit HEAD holds and a release tag descending from it,
 *    the tag named), else no base. A lot base that cannot be read (an unreadable stack parent) is no base, with its
 *    failure: never the base branch's merge-base, which would take in a parent's commits;
 * 2. outside a store lot, the base branch's merge-base with `head` (default HEAD), as `resolveGateBase` resolves it; for
 *    an empty-tree request (`gate --release`) a merge-base equal to head's commit knows no change and is no answer
 *    (on a branch or detached), so the order goes on;
 * 3. the commit of the package's last release tag `<name>@v*` reachable from `head`, with the tag, for any run;
 * 4. undefined: no base.
 */
export function resolveRulesBaseSource(params: {
	root: string
	head?: string
	emptyTreeRequest?: boolean
}): RulesBaseSource | { failure: string } | undefined {
	const { root } = params
	const identity = storeLotOf({ root })
	if (identity !== undefined) {
		const lotBase = resolveTddBase({ root, packageJson: readPackageJson(root) })
		if ('failure' in lotBase) return { failure: lotBase.failure }
		if (lotBase.kind === 'lot') return { commit: lotBase.commit, source: 'lot', lot: identity.name }
		// no base branch: the shared fallback, never the base branch's merge-base nor an older release tag
		const fallback = fallbackLotBaseOf({
			root,
			recorded: identity.base.commit,
			...(params.head !== undefined && { head: params.head }),
		})
		if (fallback === undefined) return undefined
		return fallback.source === 'release-tag'
			? { commit: fallback.commit, source: 'release-tag', tag: fallback.tag }
			: { commit: fallback.commit, source: 'lot', lot: identity.name }
	}
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

/**
 * The identity of the store lot whose worktree holds `root`; undefined outside one. The order's own predicate, shared
 * with every caller that must tell a lot from a plain checkout the same way.
 */
export function storeLotOf(params: { root: string }): LotIdentity | undefined {
	const lotFolder = lotOfWorktree({ cwd: params.root })
	return lotFolder === undefined ? undefined : readIdentity({ lotFolder })
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
