import { findBaseBranchRef } from '../gate/gate-base.ts'
import { isInWorkTree, tryReadGit } from '../git.ts'
import { readPackageJson } from '../package-json.ts'
import { resolveRulesBaseSource } from '../rules-base.ts'
import { BASE_LINE } from './lot-base.constants.ts'

import type { RulesBaseSource } from '../rules-base.types.ts'
import type { BaseWithLine } from './lot-base.types.ts'

/**
 * The base `dialecte rules` judges against without a gate base, through the one order every caller shares
 * (`resolveRulesBaseSource`, asked as an empty-tree request: a merge-base equal to HEAD's commit is no answer), with
 * the line naming its short sha and where it came from; undefined outside a git work tree, when the order finds no
 * base, or when git cannot read the commit it found (no base then, as for every caller: `readAddedLines` cannot read
 * it either); no base with the line naming why when the worktree's lot base cannot be read.
 */
export function readBaseWithLine(params: {
	root: string
	/** The commit the base is read for (contrib passes its own); HEAD when left out. */
	head?: string
	/** Asked as an empty-tree request (the default: no base handed); contrib asks it as the gate's scoped step does. */
	emptyTreeRequest?: boolean
}): BaseWithLine | undefined {
	const { root } = params
	if (!isInWorkTree(root)) return undefined
	// no base handed, as for an empty-tree request: a merge-base at HEAD's own commit knows no change, the order goes on
	const resolved = resolveRulesBaseSource({
		root,
		emptyTreeRequest: params.emptyTreeRequest ?? true,
		...(params.head !== undefined && { head: params.head }),
	})
	if (resolved === undefined) return undefined
	if ('failure' in resolved)
		return { line: BASE_LINE.failure.replace('{reason}', () => resolved.failure) }
	const shortSha = tryReadGit({
		root,
		args: ['rev-parse', '--short', '--verify', '--quiet', `${resolved.commit}^{commit}`],
	})?.trim()
	if (!shortSha) return undefined
	return {
		base: resolved.commit,
		line: lineOf({ root, resolved }).replace('{sha}', () => shortSha),
	}
}

/**
 * The base line of `resolved` with its source named and `{sha}` still to fill; the base branch's name is read here
 * only, once per run (`findBaseBranchRef`), so no other caller of the order pays for it.
 */
function lineOf(params: { root: string; resolved: RulesBaseSource }): string {
	const { root, resolved } = params
	if (resolved.source === 'lot') return BASE_LINE.lot.replace('{name}', () => resolved.lot)
	if (resolved.source === 'release-tag')
		return BASE_LINE.releaseTag.replace('{tag}', () => resolved.tag)
	const found = findBaseBranchRef({ root, packageJson: readPackageJson(root) })
	if ('refusal' in found) return BASE_LINE.baseBranchUnnamed
	return BASE_LINE.baseBranch.replace('{branch}', () => found.branch)
}
