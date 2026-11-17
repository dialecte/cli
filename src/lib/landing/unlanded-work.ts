/**
 * The keep rule of `lot close` and `worktree prune` (FIX-ci-loop design, section 2): the work a branch and its
 * worktree reached that the base does not hold. One predicate for every flow: a commit counts as landed when its work
 * is contained in the base (a merge, a squash, a rebase alike) or when it is an ancestor of the tip a landing recorded.
 * The "no commit of its own" rules of a merged branch live here too: a branch nobody committed on is still in use.
 */
import { SHORT_SHA_LENGTH } from '../gate-records/gate-records.constants.ts'
import { readGit, tryReadGit } from '../git.ts'
import { fillMessage } from '../knowledge/standard/fill-message.ts'
import { isContainedIn } from './contained.ts'
import { NO_OWN_COMMIT_REASONS, UNLANDED_WORK_TEXT } from './unlanded-work.constants.ts'

/**
 * The commits (full ids, newest first) the branch's reflog and the worktree's HEAD reflog reach beyond the base whose
 * work is neither contained in the base nor held by the landed tip; none when every one landed.
 *
 * @intent tell the work a worktree holds that its landing did not carry
 * @internal
 */
export function unlandedWork(params: {
	/** The repository (any of its worktrees: refs are shared). */
	root: string
	branch: string
	/** The ref the lot lands on, as fetched: `refs/remotes/origin/<base>`. */
	baseRef: string
	/** The branch's worktree, whose HEAD reflog counts too; left out for a branch alone. */
	worktree?: string
	/** The tip `landed.json` records: its ancestors landed. */
	landedTip?: string
	/**
	 * Where else the work is kept, so it is not lost with the worktree: the branch (it is never deleted with it) and the
	 * remote-tracking refs. Asked by a close of a hand-over no landing proves: its branch keeps its commits.
	 */
	keptElsewhere?: boolean
}): string[] {
	const { root, baseRef } = params
	const reached = [
		...reflogOf({ root, ref: `refs/heads/${params.branch}` }),
		...(params.worktree === undefined ? [] : reflogOf({ root: params.worktree, ref: 'HEAD' })),
	]
	const commits = [...new Set(reached)]
	if (commits.length === 0) return []
	const held = [
		baseRef,
		...(params.landedTip === undefined ? [] : [params.landedTip]),
		...(params.keptElsewhere === true ? [`refs/heads/${params.branch}`] : []),
	].filter((ref) => commitOf({ root, ref }) !== undefined)
	const remotes = params.keptElsewhere === true ? ['--remotes'] : []
	// the reflog's commits on standard input: no argument-length limit, read as wanted whatever `--not` says
	const beyond = readGit({
		root,
		args: [
			'rev-list',
			'--stdin',
			...(held.length + remotes.length > 0 ? ['--not', ...held, ...remotes] : []),
		],
		input: `${commits.join('\n')}\n`,
	})
		.split('\n')
		.filter(Boolean)
	return beyond.filter(function notLanded(commit) {
		return !isContainedIn({ root, baseRef, commit })
	})
}

/**
 * The line that names unlanded work: `<n> commit(s) of work not in <base>: <short ids>`.
 *
 * @intent say which commits keep a worktree
 * @internal
 */
export function unlandedWorkText(params: { commits: readonly string[]; base: string }): string {
	return fillMessage({
		template: UNLANDED_WORK_TEXT,
		values: {
			count: String(params.commits.length),
			base: params.base,
			commits: params.commits.map((commit) => commit.slice(0, SHORT_SHA_LENGTH)).join(', '),
		},
	})
}

/**
 * Why a branch whose work all landed is still in use, or undefined: nothing in its reflog, nothing but its creation
 * there, or its tip still the HEAD its worktree was made at (`baselineHead`).
 *
 * @intent keep a branch nobody committed on yet
 * @internal
 */
export function noOwnCommitReason(params: {
	root: string
	branch: string
	baselineHead: string | undefined
}): string | undefined {
	const { root, branch } = params
	const entries = readGit({
		root,
		args: ['reflog', 'show', '--format=%gs', `refs/heads/${branch}`, '--'],
	})
		.split('\n')
		.filter(Boolean)
	if (entries.length === 0) return NO_OWN_COMMIT_REASONS.emptyReflog
	if (entries.length <= 1) return NO_OWN_COMMIT_REASONS.onlyCreation
	const tip = commitOf({ root, ref: `refs/heads/${branch}` })
	return tip !== undefined && tip === params.baselineHead
		? NO_OWN_COMMIT_REASONS.sinceWorktree
		: undefined
}

/** The commits a reflog names, newest first; none when it cannot be read. */
function reflogOf(params: { root: string; ref: string }): string[] {
	return (
		tryReadGit({ root: params.root, args: ['reflog', 'show', '--format=%H', params.ref, '--'] }) ??
		''
	)
		.split('\n')
		.filter(Boolean)
}

/** The commit `ref` names; undefined when it names none. */
function commitOf(params: { root: string; ref: string }): string | undefined {
	return (
		tryReadGit({
			root: params.root,
			args: ['rev-parse', '--verify', '--quiet', `${params.ref}^{commit}`],
		})?.trim() || undefined
	)
}
