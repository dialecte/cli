/**
 * Hand-made throwaways: a registered worktree no lot and no registry entry owns, on a branch whose creation commit a
 * terminal lot's work reaches (its branch tip, landed tip or branch reflog) and its cut does not, and whose own commits
 * all are that lot's. Each candidate matched to its first such lot; the rest left to `worktree prune`.
 */
import { isAncestorCommit, readCommitOrNone, readGit, tryReadGit } from '../git.ts'
import { CREATED_FROM_PREFIX } from './hand-made-throwaways.constants.ts'

import type { CandidateWorktree, HandMadeLot, HandMadeMatch } from './hand-made-throwaways.types.ts'

/**
 * Each candidate worktree matched to the first lot it is a hand-made throwaway of; one matching none is left out.
 *
 * @intent find the review checks a person cut by hand at a lot's commits
 * @internal
 */
export function matchHandMadeThrowaways(params: {
	main: string
	candidates: readonly CandidateWorktree[]
	lots: readonly HandMadeLot[]
}): HandMadeMatch[] {
	const { main } = params
	return params.candidates.flatMap(function matchCandidate(candidate): HandMadeMatch[] {
		const created = creationCommitOf({ root: main, branch: candidate.branch })
		if (created === undefined) return []
		const lot = params.lots.find((one) =>
			isThrowawayOf({ root: main, candidate, created, lot: one }),
		)
		return lot === undefined
			? []
			: [{ lot: lot.lot, path: candidate.path, branch: candidate.branch }]
	})
}

/**
 * The commit a branch was created at: the new value of its oldest reflog entry, when that entry's subject says it was
 * created (`branch: Created from <start point>`, the start point never parsed); undefined when the reflog expired.
 */
function creationCommitOf(params: { root: string; branch: string }): string | undefined {
	const lines = (
		tryReadGit({
			root: params.root,
			args: ['reflog', 'show', '--format=%H %gs', `refs/heads/${params.branch}`, '--'],
		}) ?? ''
	)
		.split('\n')
		.filter(Boolean)
	const oldest = lines.at(-1)
	if (oldest === undefined) return undefined
	const [commit, ...subject] = oldest.split(' ')
	return subject.join(' ').startsWith(CREATED_FROM_PREFIX) ? commit : undefined
}

/**
 * Whether `candidate` was cut at the lot's work: its creation commit reached by the lot's holders (its branch tip, its
 * landed tip, its branch reflog) and not by its cut, and no commit of the candidate's branch beyond them.
 */
function isThrowawayOf(params: {
	root: string
	candidate: CandidateWorktree
	created: string
	lot: HandMadeLot
}): boolean {
	const { root, candidate, created, lot } = params
	const holders = holdersOf({ root, lot })
	if (holders.length === 0) return false
	if (isAncestorCommit({ root, ancestor: created, descendant: lot.cut })) return false
	const reached = holders.some((holder) =>
		isAncestorCommit({ root, ancestor: created, descendant: holder }),
	)
	if (!reached) return false
	const beyond = readGit({
		root,
		args: ['rev-list', '--stdin'],
		input: `refs/heads/${candidate.branch}\n--not\n${holders.join('\n')}\n`,
	})
		.split('\n')
		.filter(Boolean)
	return beyond.length === 0
}

/** The commits holding a lot's work: its branch tip, its landed tip, every commit its branch reflog names. */
function holdersOf(params: { root: string; lot: HandMadeLot }): string[] {
	const { root, lot } = params
	const ref = `refs/heads/${lot.branch}`
	const tip = readCommitOrNone({ root, ref })
	const reflog = (tryReadGit({ root, args: ['reflog', 'show', '--format=%H', ref, '--'] }) ?? '')
		.split('\n')
		.filter(Boolean)
	return [
		...new Set([
			...(tip === undefined ? [] : [tip]),
			...(lot.landedTip === undefined ? [] : [lot.landedTip]),
			...reflog,
		]),
	]
}
