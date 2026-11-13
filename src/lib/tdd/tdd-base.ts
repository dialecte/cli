/**
 * The commit the change is measured from, with where it came from (`resolveBase` answers the commit alone): `--base`,
 * then for the whole branch the lot's base branch followed forward, the worktree's cut, the
 * resolved base branch, HEAD.
 */
import { findBaseBranchRef } from '../gate/gate-base.ts'
import { isAncestorCommit, readGit, tryReadGit } from '../git.ts'
import { readIdentity } from '../store/identity.ts'
import { lotOfWorktree } from '../store/resolve-lot.ts'
import { readHygieneBaseline } from '../worktree/hygiene.ts'
import { TDD_BASE_NAMED_REF_PREFIXES, TDD_BASE_NOTES, TDD_BASE_SOURCES } from './tdd.constants.ts'

import type { PackageJson } from '../package-json.types.ts'
import type { FollowedBaseRef, RecordedBaseRef, TddBase } from './tdd.types.ts'

/**
 * By default HEAD: the lot is the uncommitted work. `ref` (`--base <ref>`): where HEAD left that ref.
 * `wholeBranch` (the gate's `--full` / `--release`), first that applies:
 * 1. the lot's base ref (the store lot's identity `base.ref`, else the `from` `worktree add` recorded; a ref naming a
 *    commit, not a branch or tag, gives way to the resolved base branch), followed forward from the worktree's cut
 *    (`followLotBase`); the cut, with a note, when it cannot be;
 * 2. the worktree's cut, when no base ref is recorded (a note says so);
 * 3. no baseline: where HEAD left the resolved base branch, else HEAD.
 * Failures: a repository without a commit, an unknown `--base` ref, a set `dialecte.baseBranch` naming no branch.
 */
export function resolveTddBase(params: {
	root: string
	packageJson: PackageJson
	/** `--base <ref>`: where HEAD left it. */
	ref?: string
	/** `--full` / `--release`: the whole branch. */
	wholeBranch?: boolean
}): TddBase | { failure: string } {
	const { root, packageJson } = params
	const head = tryReadGit({ root, args: ['rev-parse', '--verify', '--quiet', 'HEAD'] })?.trim()
	if (!head)
		return {
			failure: `the repository at ${root} has no commit yet: the lot is measured from HEAD, commit a base first`,
		}
	if (params.ref !== undefined) return resolveFlagBase({ root, ref: params.ref })
	if (!params.wholeBranch) return { commit: head, source: TDD_BASE_SOURCES.head }
	const baseline = readHygieneBaseline(root)
	if (baseline?.head === undefined) return resolveBaseBranchBase({ root, packageJson, head })
	const cut = baseline.head
	const recorded = readRecordedBaseRef({ root, from: baseline.from })
	if (recorded === undefined)
		return { commit: cut, source: TDD_BASE_SOURCES.worktreeCut, note: TDD_BASE_NOTES.noneRecorded }
	const followed = resolveFollowedRef({ root, packageJson, recorded })
	if ('failure' in followed) return followed
	return followLotBase({ root, cut, followed })
}

/** `--base <ref>`: the merge-base of HEAD and the ref, else the commit it names. */
function resolveFlagBase(params: { root: string; ref: string }): TddBase | { failure: string } {
	const { root, ref } = params
	const base =
		tryReadGit({ root, args: ['merge-base', 'HEAD', ref] }) ??
		tryReadGit({ root, args: ['rev-parse', '--verify', '--quiet', ref] })
	return base
		? { commit: base.trim(), source: TDD_BASE_SOURCES.flag }
		: { failure: `--base ${ref}: no such commit` }
}

/**
 * No hygiene baseline: where HEAD left the resolved base branch; HEAD when none is found or the merge-base fails. A
 * set `dialecte.baseBranch` naming no branch is refused, never replaced.
 */
function resolveBaseBranchBase(params: {
	root: string
	packageJson: PackageJson
	head: string
}): TddBase | { failure: string } {
	const { root, head } = params
	const found = findBaseBranchRef({ root, packageJson: params.packageJson })
	if ('refusal' in found)
		return params.packageJson.dialecte?.baseBranch === undefined
			? { commit: head, source: TDD_BASE_SOURCES.head }
			: { failure: found.refusal }
	const mergeBase = tryReadGit({ root, args: ['merge-base', 'HEAD', found.ref] })?.trim()
	return mergeBase
		? {
				commit: mergeBase,
				source: TDD_BASE_SOURCES.baseBranch.replace('{branch}', () => found.branch),
			}
		: { commit: head, source: TDD_BASE_SOURCES.head }
}

/** The store lot's base ref (the worktree's lot), else the baseline's `from`; undefined when neither is recorded. */
function readRecordedBaseRef(params: {
	root: string
	from: string | undefined
}): RecordedBaseRef | undefined {
	const lotFolder = lotOfWorktree({ cwd: params.root })
	const storeRef =
		lotFolder === undefined ? undefined : readIdentity({ lotFolder })?.base?.ref || undefined
	if (storeRef !== undefined)
		return { ref: storeRef, source: TDD_BASE_SOURCES.lotBase.replace('{ref}', () => storeRef) }
	const { from } = params
	if (!from) return undefined
	return { ref: from, source: TDD_BASE_SOURCES.worktreeFrom.replace('{ref}', () => from) }
}

/**
 * The ref to follow: a branch, remote branch or tag as recorded; a ref that only names a commit (a `lot start` base
 * is a commit id) gives way to the resolved base branch, whose own refusal stays one when `dialecte.baseBranch` is
 * set. A ref naming nothing, or a commit with no base branch found, is not found.
 */
function resolveFollowedRef(params: {
	root: string
	packageJson: PackageJson
	recorded: RecordedBaseRef
}): FollowedBaseRef | { failure: string } {
	const { root, recorded } = params
	if (!namesCommit({ root, ref: recorded.ref })) return { notFound: recorded.ref }
	if (isNamedRef({ root, ref: recorded.ref }))
		return { ref: recorded.ref, name: recorded.ref, source: recorded.source }
	const found = findBaseBranchRef({ root, packageJson: params.packageJson })
	if ('refusal' in found)
		return params.packageJson.dialecte?.baseBranch === undefined
			? { notFound: recorded.ref }
			: { failure: found.refusal }
	return {
		ref: found.ref,
		name: found.branch,
		source: TDD_BASE_SOURCES.baseBranchOfCommit.replace('{branch}', () => found.branch),
	}
}

/**
 * The followed ref R from the cut C: M = merge-base(HEAD, R), taken when C is an ancestor of (or equals) M (the base
 * only moves forward) and R reaches none of the lot's own commits (R has not merged the lot); else C with the note
 * naming why: R behind the cut (R's tip an ancestor of C), R not holding the cut (a stacked lot: R never reached C
 * in its reflog), R rewritten (R once reached C, now neither reaches the other), R holding the lot's own commits.
 *
 * The lot's own commits: the first-parent commits of HEAD since C that are not on R's first-parent history. A lot
 * that merged R, rebased onto it or was fast-forwarded onto it keeps R's commits on R's first-parent line, so none of
 * them counts; when R merged the lot, the lot's commits sit on R's second-parent side and are reachable from R.
 * Known limit: R fast-forwarded onto the lot's own commits puts them on R's first-parent line, and that reads as the
 * lot fast-forwarded onto R: M (HEAD's own commits then count as R's).
 */
function followLotBase(params: { root: string; cut: string; followed: FollowedBaseRef }): TddBase {
	const { root, cut, followed } = params
	if ('notFound' in followed) return fallBackToCut({ cut, note: notFoundNote(followed.notFound) })
	const mergeBase = tryReadGit({ root, args: ['merge-base', 'HEAD', followed.ref] })?.trim()
	// unrelated histories: nothing of the ref is the lot's
	if (!mergeBase) return fallBackToCut({ cut, note: notFoundNote(followed.name) })
	if (!isAncestorCommit({ root, ancestor: cut, descendant: mergeBase })) {
		// the ref's tip lags the cut (a stacked lot, a local base branch behind the commit the lot was cut from); a ref
		// rewritten away from the cut also has a merge-base below the cut, but its tip is no ancestor of the cut
		if (isAncestorCommit({ root, ancestor: followed.ref, descendant: cut }))
			return fallBackToCut({
				cut,
				note: TDD_BASE_NOTES.behind.replace('{ref}', () => followed.name),
			})
		// a ref that never held the cut (a stacked lot: cut on a branch of the ref, the ref since moved on) was not
		// rewritten under the lot
		if (!refOnceHeldCut({ root, cut, ref: followed.ref }))
			return fallBackToCut({
				cut,
				note: TDD_BASE_NOTES.notOnRef.replace('{ref}', () => followed.name),
			})
		const shortCut = shortCommitOf({ root, commit: cut })
		const shortMergeBase = shortCommitOf({ root, commit: mergeBase })
		const note = TDD_BASE_NOTES.rewritten
			.replace('{ref}', () => followed.name)
			.replace('{cut}', () => shortCut)
			.replace('{mergeBase}', () => shortMergeBase)
		return fallBackToCut({ cut, note })
	}
	if (refHoldsOwnCommits({ root, cut, ref: followed.ref }))
		return fallBackToCut({
			cut,
			note: TDD_BASE_NOTES.holdsOwnCommits.replace('{ref}', () => followed.name),
		})
	return { commit: mergeBase, source: followed.source }
}

/** R reaches one of the lot's own commits (first-parent commits of HEAD since the cut, not on R's first-parent line). */
function refHoldsOwnCommits(params: { root: string; cut: string; ref: string }): boolean {
	const { root, cut, ref } = params
	const lotLine = listCommits({ root, args: ['--first-parent', 'HEAD', `^${cut}`] })
	if (lotLine.length === 0) return false
	const refLine = new Set(listCommits({ root, args: ['--first-parent', ref, `^${cut}`] }))
	const own = lotLine.filter((commit) => !refLine.has(commit))
	if (own.length === 0) return false
	const reachable = new Set(listCommits({ root, args: [ref, `^${cut}`] }))
	return own.some((commit) => reachable.has(commit))
}

/**
 * The ref held the cut at some point of its reflog: one of the commits it pointed at reaches the cut (`merge-base
 * --independent` drops a commit another one reaches, so the cut is dropped exactly when an entry reaches it). One git
 * call for the reflog, one for the test. Cannot tell apart: a ref with no reflog (a tag, a remote-tracking ref
 * fetched after the move, an expired or disabled reflog) reads as never holding the cut, so a rewrite there is noted
 * as a stacked lot; both notes measure from the cut, only the why differs.
 */
function refOnceHeldCut(params: { root: string; cut: string; ref: string }): boolean {
	const { root, cut, ref } = params
	const entries = [
		...new Set(
			(tryReadGit({ root, args: ['rev-list', '--walk-reflogs', ref] }) ?? '')
				.split('\n')
				.filter(Boolean),
		),
	]
	if (entries.length === 0) return false
	if (entries.includes(cut)) return true
	const independent = readGit({ root, args: ['merge-base', '--independent', cut, ...entries] })
	return !independent.split('\n').includes(cut)
}

/** `git rev-list <args>`, one commit per entry. */
function listCommits(params: { root: string; args: string[] }): string[] {
	return readGit({ root: params.root, args: ['rev-list', ...params.args] })
		.split('\n')
		.filter(Boolean)
}

/** The short id of `commit`, as git abbreviates it in the repository at `root`. */
export function shortCommitOf(params: { root: string; commit: string }): string {
	return readGit({ root: params.root, args: ['rev-parse', '--short', params.commit] }).trim()
}

/** The worktree's cut, with the note saying why the lot's base ref was not followed. */
function fallBackToCut(params: { cut: string; note: string }): TddBase {
	return { commit: params.cut, source: TDD_BASE_SOURCES.worktreeCut, note: params.note }
}

function notFoundNote(ref: string): string {
	return TDD_BASE_NOTES.notFound.replace('{ref}', () => ref)
}

/** `ref` names a commit in the repository at `root`. */
function namesCommit(params: { root: string; ref: string }): boolean {
	return (
		tryReadGit({
			root: params.root,
			args: ['rev-parse', '--verify', '--quiet', `${params.ref}^{commit}`],
		}) !== undefined
	)
}

/** `ref` is a local branch, a remote branch or a tag (or a full ref name), not only a commit id. */
function isNamedRef(params: { root: string; ref: string }): boolean {
	const { ref } = params
	const candidates = [ref, ...TDD_BASE_NAMED_REF_PREFIXES.map((prefix) => `${prefix}${ref}`)]
	// for-each-ref also matches a pattern's sub-folders: only an exact name counts
	return readGit({
		root: params.root,
		args: ['for-each-ref', '--format=%(refname)', ...candidates],
	})
		.split('\n')
		.some((name) => candidates.includes(name))
}
