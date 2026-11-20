/**
 * Hand-made throwaways: a registered worktree no lot and no registry entry owns, on a branch whose creation commit a
 * terminal lot's work reaches (its branch tip, landed tip or branch reflog) and its cut does not, and whose own commits
 * all are that lot's. Each candidate matched to its first such lot; the rest left to `worktree prune`.
 */
import { isAncestorCommit, readCommitOrNone } from '../git.ts'
import { linesOf, readGitOrWhy } from './git-read.ts'
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
		// a read that failed decides nothing: the candidate is kept, under every lot it was tried for, with why
		if ('why' in created)
			return params.lots.map((lot) => ({
				lot: lot.lot,
				path: candidate.path,
				branch: candidate.branch,
				unread: created.why,
			}))
		if (created.commit === undefined) return []
		const { commit } = created
		for (const lot of params.lots) {
			const answer = isThrowawayOf({ root: main, candidate, created: commit, lot })
			if (answer === true) return [{ lot: lot.lot, path: candidate.path, branch: candidate.branch }]
			if (answer !== false)
				return [
					{ lot: lot.lot, path: candidate.path, branch: candidate.branch, unread: answer.why },
				]
		}
		return []
	})
}

/**
 * The commit a branch was created at: the new value of its oldest reflog entry, when that entry's subject says it was
 * created (`branch: Created from <start point>`, the start point never parsed); none when the reflog expired; why
 * when the reflog could not be read.
 */
function creationCommitOf(params: {
	root: string
	branch: string
}): { commit: string | undefined } | { why: string } {
	const reflog = readGitOrWhy({
		root: params.root,
		args: ['reflog', 'show', '--format=%H %gs', `refs/heads/${params.branch}`, '--'],
		what: `the reflog of ${params.branch}`,
	})
	if ('why' in reflog) return reflog
	const oldest = linesOf(reflog.output).at(-1)
	if (oldest === undefined) return { commit: undefined }
	const [commit, ...subject] = oldest.split(' ')
	return { commit: subject.join(' ').startsWith(CREATED_FROM_PREFIX) ? commit : undefined }
}

/**
 * Whether `candidate` was cut at the lot's work: its creation commit reached by the lot's holders (its branch tip, its
 * landed tip, its branch reflog) and not by its cut, and no commit of the candidate's branch beyond them; why when a
 * read it rests on failed.
 */
function isThrowawayOf(params: {
	root: string
	candidate: CandidateWorktree
	created: string
	lot: HandMadeLot
}): boolean | { why: string } {
	const { root, candidate, created, lot } = params
	const holders = holdersOf({ root, lot })
	if ('why' in holders) return holders
	if (holders.commits.length === 0) return false
	if (isAncestorCommit({ root, ancestor: created, descendant: lot.cut })) return false
	const reached = holders.commits.some((holder) =>
		isAncestorCommit({ root, ancestor: created, descendant: holder }),
	)
	if (!reached) return false
	const beyond = readGitOrWhy({
		root,
		args: ['rev-list', '--stdin'],
		input: `refs/heads/${candidate.branch}\n--not\n${holders.commits.join('\n')}\n`,
		what: `the commits of ${candidate.branch}`,
	})
	if ('why' in beyond) return beyond
	return linesOf(beyond.output).length === 0
}

/** The commits holding a lot's work: its branch tip, its landed tip, every commit its branch reflog names; why when
 * its reflog could not be read. */
function holdersOf(params: {
	root: string
	lot: HandMadeLot
}): { commits: string[] } | { why: string } {
	const { root, lot } = params
	const ref = `refs/heads/${lot.branch}`
	const tip = readCommitOrNone({ root, ref })
	const reflog = readGitOrWhy({
		root,
		args: ['reflog', 'show', '--format=%H', ref, '--'],
		what: `the reflog of ${lot.branch}`,
	})
	if ('why' in reflog) return reflog
	return {
		commits: [
			...new Set([
				...(tip === undefined ? [] : [tip]),
				...(lot.landedTip === undefined ? [] : [lot.landedTip]),
				...linesOf(reflog.output),
			]),
		],
	}
}
