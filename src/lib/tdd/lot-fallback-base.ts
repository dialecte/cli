/**
 * The one fallback of every reader of a lot's base when `resolveTddBase` gives no lot base (no base branch found, or a
 * lot base that cannot be read): the newest of the commit the lot recorded at its start, when `head` holds it, and a
 * release tag of the package that descends from that commit and that `head` holds; else none. The rules order, the
 * risk class and the design gate's base reader all call it, so they never disagree.
 */
import { isAncestorCommit, readCommitOrNone, tryReadGit } from '../git.ts'
import { readPackageJson } from '../package-json.ts'
import { RELEASE_TAG_PATTERN } from '../rules-base.constants.ts'

import type { FallbackLotBase } from './tdd.types.ts'

/**
 * The fallback base of the lot whose worktree is `root`, recorded at `recorded`; undefined when `head` (default HEAD)
 * does not hold `recorded`, or git cannot read either. A release tag on `recorded` itself names it (the tag wins a tie).
 *
 * @intent give a lot with no lot base the newest base it can be judged against, never HEAD
 * @internal
 */
export function fallbackLotBaseOf(params: {
	root: string
	recorded: string
	head?: string
}): FallbackLotBase | undefined {
	const { root } = params
	const recorded = readCommitOrNone({ root, ref: params.recorded })
	const head = readCommitOrNone({ root, ref: params.head ?? 'HEAD' })
	if (recorded === undefined || head === undefined) return undefined
	if (!isAncestorCommit({ root, ancestor: recorded, descendant: head })) return undefined
	return (
		newestReleaseTagOf({ root, head, since: recorded }) ?? { commit: recorded, source: 'recorded' }
	)
}

/**
 * The newest release tag `<name>@v*` of the package at `root` that `head` holds and that holds `since`: the one every
 * other is an ancestor of (the first by name when two diverge); undefined without a package name or such a tag.
 */
function newestReleaseTagOf(params: {
	root: string
	head: string
	since: string
}): FallbackLotBase | undefined {
	const { root } = params
	const name = readPackageJson(root).name
	if (name === undefined) return undefined
	const listing =
		tryReadGit({
			root,
			args: [
				'tag',
				'--list',
				RELEASE_TAG_PATTERN.replace('{name}', () => name),
				'--merged',
				params.head,
				'--contains',
				params.since,
			],
		}) ?? ''
	const tagged = listing
		.split('\n')
		.map((tag) => tag.trim())
		.filter((tag) => tag !== '')
		.sort()
		.flatMap(function taggedCommitOf(tag) {
			const commit = readCommitOrNone({ root, ref: tag })
			return commit === undefined ? [] : [{ commit, tag }]
		})
	const newest = tagged.reduce<(typeof tagged)[number] | undefined>(function newer(
		kept,
		candidate,
	) {
		if (kept === undefined) return candidate
		return kept.commit !== candidate.commit &&
			isAncestorCommit({ root, ancestor: kept.commit, descendant: candidate.commit })
			? candidate
			: kept
	}, undefined)
	return newest === undefined
		? undefined
		: { commit: newest.commit, source: 'release-tag', tag: newest.tag }
}
