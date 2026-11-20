/**
 * The keep rules of a removal (FIX-landed-leftovers design, section 1): is a lot's current work landed
 * (`workSinceLanding`), and would a removal lose a commit (`lostWork`). The "no commit of its own" rule of a merged
 * branch lives here too: a branch nobody committed on is still in use.
 */
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { readGitOrWhy } from '../cleanup/git-read.ts'
import { SHORT_SHA_LENGTH } from '../gate-records/gate-records.constants.ts'
import { commonGitFolderOf, readCommitOrNone, readGit, readGitBytes, tryReadGit } from '../git.ts'
import { fillMessage } from '../knowledge/standard/fill-message.ts'
import {
	BRANCH_REF_PREFIX,
	CHANGE_HEADER_FORMAT,
	DIFF_INDEX_LINE_PREFIX,
	LOST_WHY,
	LOST_WORK_TEXTS,
	NO_OWN_COMMIT_REASONS,
	PER_WORKTREE_REF_PREFIXES,
	REMOTE_REF_PREFIX,
	TAG_REF_PREFIX,
	WORKTREES_ADMIN_FOLDER,
} from './lost-work.constants.ts'

import type { LostCommit, Removal } from './lost-work.types.ts'

/**
 * The commits (full ids) a lot's branch tip holds beyond its landed tip and beyond its cut: work since its landing.
 *
 * @intent tell whether a merged lot holds work its landing did not carry
 * @internal
 */
export function workSinceLanding(params: {
	/** The repository (any of its worktrees: refs are shared). */
	root: string
	/** The lot's branch, its short name. */
	branch: string
	/** The commit the lot was cut from. */
	cut: string
	/** The tip that landed. */
	landedTip: string
}): string[] {
	const { root } = params
	const tip = readCommitOrNone({ root, ref: `${BRANCH_REF_PREFIX}${params.branch}` })
	if (tip === undefined) return []
	return linesOf(
		readGit({
			root,
			args: ['rev-list', '--ignore-missing', '--stdin'],
			input: `${tip}\n--not\n${params.landedTip}\n${params.cut}\n`,
		}),
	)
}

/**
 * The commits one removal would lose, each with why: those only the removed records reach (a worktree's HEAD and HEAD
 * reflog, a branch's tip and reflog) that no surviving branch tip, surviving branch reflog, tag, landed tip or
 * remote-tracking ref (but origin's copy of a removed branch) holds by ancestry, and whose change no holder carries (a
 * change id twin among the commits the holders reach beyond it: the same change at the same place). Merge and root commits are held by
 * ancestry only; a commit with no change never has a twin.
 *
 * @intent tell exactly which commits a worktree or branch removal would lose
 * @internal
 */
export function lostWork(params: {
	/** The repository (any of its worktrees: refs are shared). */
	root: string
	/** Everything this one removal takes, as a set. */
	removes: Removal
	/** The tips the `landed.json` of the lots concerned record. */
	landedTips: string[]
}): LostCommit[] {
	const { root, removes } = params
	const dropped = unique(removes.branches.flatMap((branch) => branchRecordsOf({ root, branch })))
	const detached = unique(
		removes.worktrees.flatMap((worktree) => headRecordsOf({ root, worktree })),
	)
	if (dropped.length + detached.length === 0) return []
	const holders = holdersOf({ root, removes, landedTips: params.landedTips })
	// a commit the removed branch records reach is dropped from that branch; one only a HEAD reached is detached
	const reachedByBranch = beyondHolders({ root, candidates: dropped, holders })
	const reachedByHead = beyondHolders({ root, candidates: detached, holders }).filter(
		(commit) => !reachedByBranch.includes(commit),
	)
	const leftover = [
		...reachedByBranch.map((commit) => ({ commit, why: LOST_WHY.dropped })),
		...reachedByHead.map((commit) => ({ commit, why: LOST_WHY.detached })),
	]
	if (leftover.length === 0) return []
	const twins = twinnedCommits({
		root,
		candidates: leftover.map((lost) => lost.commit),
		holders,
	})
	return leftover.filter((lost) => !twins.has(lost.commit))
}

/**
 * The line that names the commits a removal would lose: `<n> commit(s) its removal would lose: <short ids>`.
 *
 * @intent say which commits keep a worktree or a branch
 * @internal
 */
export function lostWorkText(lost: readonly LostCommit[]): string {
	return fillMessage({
		template: LOST_WORK_TEXTS.lost,
		values: { count: String(lost.length), commits: shortIdsOf(lost.map((one) => one.commit)) },
	})
}

/**
 * The line that names a lot's work since its landing: `<n> commit(s) made since its landing: <short ids>`.
 *
 * @intent say which commits keep a merged lot open
 * @internal
 */
export function workSinceLandingText(commits: readonly string[]): string {
	return fillMessage({
		template: LOST_WORK_TEXTS.since,
		values: { count: String(commits.length), commits: shortIdsOf(commits) },
	})
}

/**
 * The line that names commits a worktree removal leaves held only by its branch's reflog (work reset or rebased away):
 * `<short ids>: dropped from the branch, kept in its reflog until git's reflog expiry (gc.reflogExpireUnreachable)`.
 *
 * @intent tell the person which dropped commits live on only in a branch reflog, and for how long
 * @internal
 */
export function droppedHeldText(commits: readonly string[]): string {
	return fillMessage({
		template: LOST_WORK_TEXTS.droppedHeld,
		values: { commits: shortIdsOf(commits) },
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
		args: ['reflog', 'show', '--format=%gs', `${BRANCH_REF_PREFIX}${branch}`, '--'],
	})
		.split('\n')
		.filter(Boolean)
	if (entries.length === 0) return NO_OWN_COMMIT_REASONS.emptyReflog
	if (entries.length <= 1) return NO_OWN_COMMIT_REASONS.onlyCreation
	const tip = readCommitOrNone({ root, ref: `${BRANCH_REF_PREFIX}${branch}` })
	return tip !== undefined && tip === params.baselineHead
		? NO_OWN_COMMIT_REASONS.sinceWorktree
		: undefined
}

/** A removed branch's records: its tip and every commit its reflog names. */
function branchRecordsOf(params: { root: string; branch: string }): string[] {
	const ref = `${BRANCH_REF_PREFIX}${params.branch}`
	const tip = readCommitOrNone({ root: params.root, ref })
	return [...(tip === undefined ? [] : [tip]), ...reflogOf({ root: params.root, ref })]
}

/**
 * A removed worktree's records: its current HEAD (detached or not) and every commit its HEAD reflog names. A worktree
 * whose folder is gone is read from its own folder in the repository's git folder (`worktrees/<id>/`), which
 * `git worktree prune` deletes with its HEAD reflog. A reflog or ref read that fails throws `could not read <what>:
 * <git's error>`: its records are never taken for none, and every caller keeps the worktree with that reason.
 */
function headRecordsOf(params: { root: string; worktree: string }): string[] {
	const admin = existsSync(params.worktree)
		? undefined
		: adminFolderOf({ root: params.root, worktree: params.worktree })
	if (!existsSync(params.worktree) && admin === undefined) return []
	const root = admin === undefined ? params.worktree : params.root
	const gitDir = admin === undefined ? [] : [`--git-dir=${admin}`]
	const head = tryReadGit({
		root,
		args: [...gitDir, 'rev-parse', '--verify', '--quiet', 'HEAD^{commit}'],
	})?.trim()
	const reflog = readGitOrWhy({
		root,
		args: [...gitDir, 'reflog', 'show', '--format=%H', 'HEAD', '--'],
		what: `the HEAD reflog of ${params.worktree}`,
	})
	if ('why' in reflog) throw new Error(reflog.why)
	// the worktree's own refs (`refs/worktree/*`, `refs/bisect/*`) go with it too
	const own = readGitOrWhy({
		root,
		args: [...gitDir, 'for-each-ref', '--format=%(objectname)', ...PER_WORKTREE_REF_PREFIXES],
		what: `the own refs of ${params.worktree}`,
	})
	if ('why' in own) throw new Error(own.why)
	return [...(head ? [head] : []), ...linesOf(reflog.output), ...linesOf(own.output)]
}

/** The git folder of the linked worktree registered at `worktree` (its `gitdir` names `<worktree>/.git`), if any. */
function adminFolderOf(params: { root: string; worktree: string }): string | undefined {
	const folder = join(commonGitFolderOf(params.root), WORKTREES_ADMIN_FOLDER)
	if (!existsSync(folder)) return undefined
	return readdirSync(folder)
		.map((id) => join(folder, id))
		.find(function registersWorktree(admin) {
			const gitdir = join(admin, 'gitdir')
			return existsSync(gitdir) && dirname(readFileSync(gitdir, 'utf8').trim()) === params.worktree
		})
}

/**
 * What survives the removal and holds a commit: every branch it keeps (tip and reflog), the tags, the landed tips and
 * the remote-tracking refs but origin's copy of a removed branch. Listed one by one, never `--all` nor `--reflog`:
 * those name the removed worktree's own HEAD and HEAD reflog, and it would hold itself.
 */
function holdersOf(params: { root: string; removes: Removal; landedTips: string[] }): string[] {
	const { root, removes } = params
	const removedRefs = new Set(removes.branches.map((branch) => `${BRANCH_REF_PREFIX}${branch}`))
	const removedCopies = new Set(
		removes.branches.map((branch) => `${REMOTE_REF_PREFIX}origin/${branch}`),
	)
	const refs = linesOf(
		readGit({
			root,
			args: [
				'for-each-ref',
				'--format=%(refname)',
				BRANCH_REF_PREFIX,
				TAG_REF_PREFIX,
				REMOTE_REF_PREFIX,
			],
		}),
	).filter((ref) => !removedRefs.has(ref) && !removedCopies.has(ref))
	const branches = refs.filter((ref) => ref.startsWith(BRANCH_REF_PREFIX))
	const branchReflogs =
		branches.length === 0
			? []
			: linesOf(tryReadGit({ root, args: ['log', '-g', '--format=%H', ...branches, '--'] }) ?? '')
	return unique([...refs, ...branchReflogs, ...params.landedTips])
}

/** The commits `candidates` reach that no holder reaches, newest first; missing objects ignored. */
function beyondHolders(params: {
	root: string
	candidates: readonly string[]
	holders: readonly string[]
}): string[] {
	if (params.candidates.length === 0) return []
	// on standard input: no argument-length limit; `--not` there turns the next lines into holders
	return linesOf(
		readGit({
			root: params.root,
			args: ['rev-list', '--ignore-missing', '--stdin'],
			input: `${[...params.candidates, '--not', ...params.holders].join('\n')}\n`,
		}),
	)
}

/**
 * The candidates whose change a holder carries: a change id equal to that of a commit the holders reach beyond the
 * candidate. Merge and root commits have no id (`diff-tree` prints no patch for them), nor has a commit with no
 * change: none of them is ever a twin.
 */
function twinnedCommits(params: {
	root: string
	candidates: readonly string[]
	holders: readonly string[]
}): Set<string> {
	const { root, holders } = params
	const candidateIds = changeIdsOf({ root, commits: params.candidates })
	if (candidateIds.size === 0) return new Set()
	const reached = unique(
		[...candidateIds.keys()].flatMap((candidate) =>
			linesOf(
				readGit({
					root,
					args: ['rev-list', '--ignore-missing', '--no-merges', '--stdin'],
					input: `${[...holders, '--not', candidate].join('\n')}\n`,
				}),
			),
		),
	)
	const heldIds = new Set(changeIdsOf({ root, commits: reached }).values())
	return new Set([...candidateIds].filter(([, id]) => heldIds.has(id)).map(([commit]) => commit))
}

/**
 * Each commit's change id: its `diff-tree -p --full-index --no-color` text against its first parent, bytes as git
 * wrote them, without its `index <old>..<new>` lines, hashed as `git hash-object --stdin` hashes it. Every path, mode,
 * hunk header (its line numbers included), context, added and removed line counts: equal ids mean the same change at
 * the same place. No id for a merge, a root or a commit with no change.
 */
function changeIdsOf(params: { root: string; commits: readonly string[] }): Map<string, string> {
	if (params.commits.length === 0) return new Map()
	// one call for every commit: each patch opens with a NUL and its commit (a diff never holds a NUL: git reads such a
	// file as binary and prints no lines of it)
	const patches = readGitBytes({
		root: params.root,
		args: [
			'diff-tree',
			'--stdin',
			'-p',
			'--full-index',
			'--no-color',
			`--pretty=format:${CHANGE_HEADER_FORMAT}`,
		],
		input: `${params.commits.join('\n')}\n`,
	})
		// latin1: one character per byte, so the bytes hashed are git's own
		.toString('latin1')
		.split('\0')
	return new Map(patches.flatMap(changeIdOfPatch))
}

/** The commit and change id of one `diff-tree` patch (its commit on its first line); none for an empty patch. */
function changeIdOfPatch(patch: string): [string, string][] {
	const [commit = '', ...lines] = patch.split('\n')
	const change = lines
		.filter((line) => !line.startsWith(DIFF_INDEX_LINE_PREFIX))
		.join('\n')
		.replace(/\n+$/, '')
	if (commit === '' || change === '') return []
	const bytes = Buffer.from(`${change}\n`, 'latin1')
	const id = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')
	return [[commit, id]]
}

/** The commits a reflog names, newest first; none when it cannot be read. */
function reflogOf(params: { root: string; ref: string }): string[] {
	return linesOf(
		tryReadGit({ root: params.root, args: ['reflog', 'show', '--format=%H', params.ref, '--'] }) ??
			'',
	)
}

/** The short ids of `commits`, comma separated. */
function shortIdsOf(commits: readonly string[]): string {
	return commits.map((commit) => commit.slice(0, SHORT_SHA_LENGTH)).join(', ')
}

/** The non-empty lines of git's output. */
function linesOf(output: string): string[] {
	return output.split('\n').filter(Boolean)
}

/** `values` without repeats, first seen kept first. */
function unique(values: readonly string[]): string[] {
	return [...new Set(values)]
}
