/** The base a `changed` mutation run diffs against, and the scope lines changed since it. */
import { findBaseBranchRef } from '../gate/gate-base.ts'
import { readGit, tryReadGit } from '../git.ts'
import { BASE_FLAG_HINT } from './mutation.constants.ts'
import { changedRanges } from './scope.ts'

import type { PackageJson } from '../package-json.types.ts'
import type { ChangedTargets, MutationDeclaration } from './mutation.types.ts'

/**
 * The commit a changed run diffs against: where HEAD left `--base <ref>` (a ref git does not know refuses the run),
 * else where HEAD left the base branch (`findBaseBranchRef`). Without one, the run is refused with the resolver's
 * refusal: diffing against HEAD would see only the uncommitted work and skip the lot's commits.
 */
export function baseOf(params: {
	root: string
	asked: string | undefined
	packageJson: PackageJson
}): string | { refused: string } {
	const { root, asked } = params
	if (asked !== undefined) {
		const base = forkPointOf({ root, ref: asked })
		if (base === undefined) throw new Error(`--base ${asked}: no such commit`)
		return base
	}
	const found = findBaseBranchRef({ root, packageJson: params.packageJson })
	if ('refusal' in found) return { refused: `${found.refusal}${BASE_FLAG_HINT}` }
	const base = forkPointOf({ root, ref: found.ref })
	// the resolver found the ref naming a commit
	if (base === undefined) throw new Error(`${found.ref}: no such commit`)
	return base
}

/** The `--mutate` targets of the scope lines changed since `base`, and that base. */
export function changedTargets(params: {
	root: string
	declaration: MutationDeclaration
	base: string
}): ChangedTargets {
	const { root, declaration, base } = params
	const diff = readGit({
		root,
		args: [
			'diff',
			'--relative',
			'--no-color',
			'--no-ext-diff',
			'--no-renames',
			'-U0',
			base,
			'--',
			'.',
		],
	})
	const untracked = readGit({
		root,
		args: ['ls-files', '--others', '--exclude-standard', '--', '.'],
	})
		.split('\n')
		.filter(Boolean)
	return { base, targets: changedRanges({ declaration, diff, untracked }) }
}

/** Where HEAD left `ref` (their merge base), else the commit `ref` names; undefined when git knows no such ref. */
function forkPointOf(params: { root: string; ref: string }): string | undefined {
	const { root, ref } = params
	return (
		tryReadGit({ root, args: ['merge-base', 'HEAD', ref] })?.trim() ??
		tryReadGit({ root, args: ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`] })?.trim()
	)
}
