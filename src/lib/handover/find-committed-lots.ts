/**
 * Which lots are already committed on top of the recorded HEAD: commit after commit, each must carry the
 * next lot's message and exactly that lot's paths with the bytes of the reviewed snapshot (`files.sha256`,
 * not the working tree, which later work may change); a merge lot, its subject, the recorded tip as second
 * parent and the recorded tree. The first commit that does not is reported as foreign.
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'

import { GIT_READ_ENVIRONMENT } from '../git.constants.ts'
import { isAncestorCommit, readGit } from '../git.ts'

import type { CommittedLots, MergeLot, ResolvedLot } from './handover.types.ts'

export function findCommittedLots(params: {
	root: string
	/** The recorded HEAD (full sha). */
	head: string
	/** The commit the lots are looked for under: HEAD, or the tip of the branch. */
	tip: string
	lots: readonly ResolvedLot[]
	/**
	 * The reviewed sha256 of each file, by path (`run`): each committed file must hold those bytes; none (`list`,
	 * the card): paths and messages only.
	 */
	reviewed?: ReadonlyMap<string, string>
}): CommittedLots {
	const { root, head, lots } = params
	const tip = readGit({ root, args: ['rev-parse', params.tip] }).trim()
	if (tip === head) return { commits: [] }
	if (!isAncestorCommit({ root, ancestor: head, descendant: tip }))
		return {
			commits: [],
			foreign: `${tip.slice(0, 12)} is not on top of the recorded HEAD ${head.slice(0, 12)} (rebased, reset or another branch)`,
		}
	const commits = readGit({
		root,
		args: ['rev-list', '--reverse', '--first-parent', `${head}..${tip}`],
	})
		.split('\n')
		.filter(Boolean)
	const found: string[] = []
	for (const commit of commits) {
		const lot = lots[found.length]
		// every lot found: what came after them is later work, not a hand-over matter
		if (!lot) break
		const mismatch = describeMismatch({ root, commit, lot, reviewed: params.reviewed })
		if (mismatch) {
			const subject = readGit({ root, args: ['log', '-1', '--format=%s', commit] }).trim()
			return {
				commits: found,
				foreign: `${commit.slice(0, 12)} ${subject} is not lot ${found.length + 1}: ${mismatch}`,
			}
		}
		found.push(commit)
	}
	return { commits: found }
}

/** A done merge: the lot's subject, the recorded tip as its second parent, the recorded tree. */
function describeMergeMismatch(params: {
	root: string
	commit: string
	lot: ResolvedLot
	merge: MergeLot
}): string | undefined {
	const { root, commit, merge } = params
	const [subject, parents, tree] = readGit({
		root,
		args: ['log', '-1', '--format=%s%n%P%n%T', commit],
	}).split('\n')
	if (subject !== params.lot.message.trim().split('\n')[0]) return 'another subject'
	const [, second, third] = parents.split(' ')
	if (second !== merge.tip || third !== undefined)
		return `not a merge of the recorded tip ${merge.tip.slice(0, 12)}`
	if (merge.tree && tree !== merge.tree)
		return `it holds another tree than recorded: ${tree.slice(0, 12)}, recorded ${merge.tree.slice(0, 12)}`
	return undefined
}

/** Why the commit is not the lot, or undefined when it is. */
function describeMismatch(params: {
	root: string
	commit: string
	lot: ResolvedLot
	reviewed: ReadonlyMap<string, string> | undefined
}): string | undefined {
	const { root, commit, lot } = params
	if (lot.merge) return describeMergeMismatch({ root, commit, lot, merge: lot.merge })
	const message = readGit({ root, args: ['log', '-1', '--format=%B', commit] }).trim()
	if (message !== lot.message.trim()) return 'another message'
	const changed = readGit({
		root,
		args: ['diff-tree', '--no-commit-id', '--name-only', '-r', '--no-renames', commit],
	})
		.split('\n')
		.filter(Boolean)
		.sort()
	const expected = [...lot.files, ...lot.deletedFiles].sort()
	if (changed.join('\n') !== expected.join('\n')) return 'other paths'
	const { reviewed } = params
	if (!reviewed) return undefined
	const asReviewed = lot.files.every(
		(file) => committedHash({ root, commit, file }) === reviewed.get(file),
	)
	return asReviewed ? undefined : 'other content than the reviewed files'
}

/** sha256 of the bytes the commit holds for the file, as the reviewed snapshot hashes them. */
function committedHash(params: { root: string; commit: string; file: string }): string {
	const shown = spawnSync('git', ['cat-file', 'blob', `${params.commit}:${params.file}`], {
		cwd: params.root,
		env: { ...process.env, ...GIT_READ_ENVIRONMENT },
		maxBuffer: Number.POSITIVE_INFINITY,
	})
	if (shown.status !== 0)
		throw new Error(
			`git cat-file ${params.commit}:${params.file}: ${shown.stderr.toString().trim()}`,
		)
	return createHash('sha256').update(shown.stdout).digest('hex')
}
