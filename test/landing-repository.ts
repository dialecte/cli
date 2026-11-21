/**
 * Scratch repositories for the landing model: a bare origin, `main` pushed, a lot branch in its own worktree, and
 * origin's main moved by real git merges (fast-forward, merge commit, squash) made from another clone, as a queue
 * would; a fake host answering pull request reads from memory.
 */
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

import { recordingHost } from './land-lot.ts'
import {
	CHILD_BRANCH,
	CHILD_FILE,
	CHILD_TEXT,
	EARLIER_LOT_FILE,
	EARLIER_LOT_TEXT,
	LOT_BRANCH,
	LOT_FILE,
	LOT_TEXT,
	NO_EDITOR,
	CHANGE_REQUEST_URL,
} from './landing-repository.constants.ts'
import {
	cloneRepository,
	git,
	initializeRepository,
	temporaryFolder,
	writeFiles,
} from './scratch-repository.ts'

import type { ChangeRequest } from '../src/lib/host/host.types.ts'
import type {
	LandingHost,
	LandingHostAnswers,
	LandingRepository,
	OriginMerge,
} from './landing-repository.types.ts'

/** `main` pushed to a bare origin, and the lot branch `branch` cut from it in its own worktree, one commit ahead. */
export function landingRepositoryOf(params: { branch?: string } = {}): LandingRepository {
	const folder = temporaryFolder('dialecte-landing-')
	const origin = join(folder, 'origin.git')
	const root = initializeRepository({ root: join(folder, 'repository') })
	git({ root: folder, args: ['init', '-q', '--bare', '-b', 'main', origin] })
	git({ root, args: ['remote', 'add', 'origin', origin] })
	git({ root, args: ['push', '-q', '-u', 'origin', 'main'] })
	const cut = headOf(root)
	const branch = params.branch ?? LOT_BRANCH
	const worktree = join(folder, 'lot')
	git({ root, args: ['worktree', 'add', '-q', '-b', branch, worktree, 'main'] })
	const tip = commitIn({ root: worktree, files: { [LOT_FILE]: LOT_TEXT }, message: 'feat(x): x' })
	return { root, origin, worktree, branch, cut, tip }
}

/** `files` written and committed in `root` with `message`; the new commit. */
export function commitIn(params: {
	root: string
	files: Record<string, string>
	message: string
}): string {
	writeFiles({ root: params.root, files: params.files })
	git({ root: params.root, args: ['add', '-A'] })
	git({ root: params.root, args: ['commit', '-qm', params.message] })
	return headOf(params.root)
}

/** The commit HEAD names in `root`. */
export function headOf(root: string): string {
	return git({ root, args: ['rev-parse', 'HEAD'] }).trim()
}

/**
 * `branch` (the lot's when left out) pushed to origin, then merged into origin's main from another clone `how` says,
 * and origin fetched in the repository; origin's new main.
 */
export function mergeOnOrigin(params: {
	repository: LandingRepository
	how: OriginMerge
	branch?: string
}): string {
	const { repository } = params
	const branch = params.branch ?? repository.branch
	git({ root: repository.root, args: ['push', '-q', '--force', 'origin', `${branch}:${branch}`] })
	const other = otherClone(repository)
	const merged = `origin/${branch}`
	if (params.how === 'fast-forward')
		git({ root: other, args: ['merge', '-q', '--ff-only', merged] })
	if (params.how === 'merge-commit')
		git({ root: other, args: ['merge', '-q', '--no-ff', '-m', `Merge ${branch}`, merged] })
	if (params.how === 'squash') {
		git({ root: other, args: ['merge', '-q', '--squash', merged] })
		git({ root: other, args: ['commit', '-qm', `${branch} (squashed)`] })
	}
	return pushMain({ repository, other })
}

/** `files` committed on origin's main from another clone (main moving on), origin fetched; origin's new main. */
export function editOnOrigin(params: {
	repository: LandingRepository
	files: Record<string, string>
}): string {
	const other = otherClone(params.repository)
	commitIn({ root: other, files: params.files, message: 'feat: main moves on' })
	return pushMain({ repository: params.repository, other })
}

/** A pull request of the fake host. */
export function changeRequestOf(params: {
	number: number
	state: ChangeRequest['state']
	head: string
	draft?: boolean
	queued?: boolean
}): ChangeRequest {
	return {
		number: params.number,
		url: CHANGE_REQUEST_URL.replace('{number}', String(params.number)),
		title: 'feat(x): x',
		body: '',
		state: params.state,
		draft: params.draft ?? false,
		queued: params.queued ?? false,
		head: params.head,
		base: 'main',
	}
}

/** A host answering pull request reads from `answers` (a refusal for every read when it holds one). */
export function landingHostOf(answers: LandingHostAnswers): LandingHost {
	const asked: string[] = []
	const host = {
		...recordingHost().host,
		readChangeRequest: function readChangeRequest(call: { root: string; ref: string }) {
			asked.push(call.ref)
			if (answers.refusal !== undefined) return { refusal: answers.refusal }
			const number = Number(call.ref)
			return Number.isInteger(number) ? answers.byNumber?.[number] : answers.byBranch?.[call.ref]
		},
	}
	return { host, asked }
}

/** A clone of the repository's origin, on main. */
function otherClone(repository: LandingRepository): string {
	return cloneRepository({
		origin: repository.origin,
		into: join(temporaryFolder('dialecte-landing-other-'), 'other'),
	})
}

/** The other clone's main pushed to origin and fetched in the repository; origin's new main. */
function pushMain(params: { repository: LandingRepository; other: string }): string {
	git({ root: params.other, args: ['push', '-q', 'origin', 'main'] })
	git({ root: params.repository.root, args: ['fetch', '-q', 'origin'] })
	return headOf(params.other)
}

/** A child lot `feat/y` cut from the lot branch's tip in its own worktree, one commit ahead: its worktree and commit. */
export function stackedChildOf(repository: LandingRepository): { worktree: string; tip: string } {
	const worktree = join(temporaryFolder('dialecte-landing-child-'), 'child')
	git({
		root: repository.root,
		args: ['worktree', 'add', '-q', '-b', CHILD_BRANCH, worktree, repository.branch],
	})
	const tip = commitIn({
		root: worktree,
		files: { [CHILD_FILE]: CHILD_TEXT },
		message: 'feat(y): y',
	})
	return { worktree, tip }
}

/** Origin's last commit on main reverted from another clone, origin fetched; origin's new main. */
export function revertOnOrigin(params: { repository: LandingRepository }): string {
	const other = otherClone(params.repository)
	git({ root: other, args: ['revert', '--no-edit', 'HEAD'] })
	return pushMain({ repository: params.repository, other })
}

/** A commit beyond `parent` on no branch (another lot's work): its id. */
export function strayCommitOf(params: { root: string; parent: string }): string {
	return git({
		root: params.root,
		args: [
			'commit-tree',
			`${params.parent}^{tree}`,
			'-p',
			params.parent,
			'-m',
			'feat(z): another lot',
		],
	}).trim()
}

/** The lot's commit amended (another text of its file); the amended commit. Its branch reflog keeps the old one. */
export function amendLot(params: { worktree: string }): string {
	writeFiles({ root: params.worktree, files: { [LOT_FILE]: 'export const x = 10\n' } })
	git({
		root: params.worktree,
		args: ['commit', '-q', '-a', '--amend', '-m', 'feat(x): x amended'],
	})
	return headOf(params.worktree)
}

/** `branch` (the lot's when left out) pushed to origin, origin fetched: origin's copy of it, not merged anywhere. */
export function pushBranch(params: { repository: LandingRepository; branch?: string }): void {
	const branch = params.branch ?? params.repository.branch
	git({
		root: params.repository.root,
		args: ['push', '-q', '--force', 'origin', `${branch}:${branch}`],
	})
	git({ root: params.repository.root, args: ['fetch', '-q', 'origin'] })
}

/** Origin's `branch` (the lot's when left out) deleted, as a host deletes it after a merge, and pruned locally. */
export function deleteOriginBranch(params: {
	repository: LandingRepository
	branch?: string
}): void {
	const branch = params.branch ?? params.repository.branch
	git({ root: params.repository.root, args: ['push', '-q', 'origin', '--delete', branch] })
	git({ root: params.repository.root, args: ['fetch', '-q', '--prune', 'origin'] })
}

/** The worktree's branch rebased onto `onto` with no conflict (`--onto onto upstream` when `upstream` is given): its new head. */
export function rebaseOnto(params: { worktree: string; onto: string; upstream?: string }): string {
	git({
		root: params.worktree,
		args:
			params.upstream === undefined
				? ['rebase', '-q', params.onto]
				: ['rebase', '-q', '--onto', params.onto, params.upstream],
	})
	return headOf(params.worktree)
}

/**
 * The worktree's branch rebased onto `onto`, its conflict resolved by hand: `files` written over the conflicted ones,
 * then the rebase continued; its new head. Throws when the rebase did not stop on a conflict.
 */
export function rebaseResolving(params: {
	worktree: string
	onto: string
	files: Record<string, string>
}): string {
	stopOnConflict({ worktree: params.worktree, onto: params.onto })
	writeFiles({ root: params.worktree, files: params.files })
	git({ root: params.worktree, args: ['add', '-A'] })
	gitWithEnvironment({
		root: params.worktree,
		args: ['rebase', '--continue'],
		environment: NO_EDITOR,
	})
	return headOf(params.worktree)
}

/**
 * The worktree's branch rebased onto `onto` until a pick conflicts, then the rebase aborted: the branch back where it
 * was, the commits the rebase picked before the conflict only in the worktree's HEAD reflog; those picks, oldest first.
 */
export function rebaseAborted(params: { worktree: string; onto: string }): string[] {
	stopOnConflict(params)
	const picks = git({
		root: params.worktree,
		args: ['reflog', 'show', '--format=%H %gs', 'HEAD', '--'],
	})
		.split('\n')
		.filter((line) => line.includes(' rebase (pick)'))
		.map((line) => line.split(' ')[0])
		.reverse()
	git({ root: params.worktree, args: ['rebase', '--abort'] })
	return picks
}

/** `files` committed in the worktree, then the branch reset back one commit: the dropped commit, in its reflogs only. */
export function commitThenReset(params: {
	worktree: string
	files: Record<string, string>
}): string {
	const dropped = commitIn({
		root: params.worktree,
		files: params.files,
		message: 'feat(x): dropped',
	})
	git({ root: params.worktree, args: ['reset', '-q', '--hard', 'HEAD~1'] })
	return dropped
}

/**
 * `files` committed on a detached HEAD in the worktree (the HEAD reflog alone holds it), the branch checked out again
 * afterwards when `reattach`: the detached commit.
 */
export function commitDetached(params: {
	worktree: string
	files: Record<string, string>
	reattach?: boolean
}): string {
	const branch = git({ root: params.worktree, args: ['symbolic-ref', '--short', 'HEAD'] }).trim()
	git({ root: params.worktree, args: ['checkout', '-q', '--detach'] })
	const detached = commitIn({
		root: params.worktree,
		files: params.files,
		message: 'feat(x): detached',
	})
	if (params.reattach === true) git({ root: params.worktree, args: ['checkout', '-q', branch] })
	return detached
}

/** An empty commit in `root` (`--allow-empty`): it carries no change. */
export function emptyCommitIn(params: { root: string; message: string }): string {
	git({ root: params.root, args: ['commit', '-q', '--allow-empty', '-m', params.message] })
	return headOf(params.root)
}

/** `topic` merged into the branch of `root` by a merge commit (`--no-ff`): the merge commit. */
export function mergeCommitIn(params: { root: string; topic: string }): string {
	git({
		root: params.root,
		args: ['merge', '-q', '--no-ff', '-m', `Merge ${params.topic}`, params.topic],
	})
	return headOf(params.root)
}

/**
 * A new branch `branch` cut from `from`, each of `commits` made on it in a worktree of its own (`files`, or an empty
 * commit when they are left out): the branch's tip. The branch survives as a holder of its commits.
 */
export function branchWithCommits(params: {
	repository: LandingRepository
	branch: string
	from: string
	commits: { files?: Record<string, string>; message: string }[]
}): string {
	const worktree = join(temporaryFolder('dialecte-landing-side-'), 'side')
	git({
		root: params.repository.root,
		args: ['worktree', 'add', '-q', '-b', params.branch, worktree, params.from],
	})
	for (const commit of params.commits)
		if (commit.files === undefined) emptyCommitIn({ root: worktree, message: commit.message })
		else commitIn({ root: worktree, files: commit.files, message: commit.message })
	return headOf(worktree)
}

/**
 * The branch name of the worktree used by an earlier lot, then reused: work committed and the branch reset back to
 * `cut`, both dated `at` (its reflog entries older than the new lot), as a lot started on an existing branch name finds
 * it. The earlier lot's commit.
 */
export function reuseBranchName(params: { worktree: string; cut: string; at: string }): string {
	const dated = { GIT_COMMITTER_DATE: params.at, GIT_AUTHOR_DATE: params.at }
	writeFiles({ root: params.worktree, files: { [EARLIER_LOT_FILE]: EARLIER_LOT_TEXT } })
	gitWithEnvironment({ root: params.worktree, args: ['add', '-A'], environment: dated })
	gitWithEnvironment({
		root: params.worktree,
		args: ['commit', '-qm', 'feat(x): an earlier lot'],
		environment: dated,
	})
	const earlier = headOf(params.worktree)
	gitWithEnvironment({
		root: params.worktree,
		args: ['reset', '-q', '--hard', params.cut],
		environment: dated,
	})
	return earlier
}

/**
 * The earlier lot's work committed in the worktree, dated `at` (its reflog entry older than the new lot), and kept:
 * the branch name reused by a new lot that builds on that tip. The earlier lot's commit.
 */
export function commitEarlierLot(params: { worktree: string; at: string }): string {
	const dated = { GIT_COMMITTER_DATE: params.at, GIT_AUTHOR_DATE: params.at }
	writeFiles({ root: params.worktree, files: { [EARLIER_LOT_FILE]: EARLIER_LOT_TEXT } })
	gitWithEnvironment({ root: params.worktree, args: ['add', '-A'], environment: dated })
	gitWithEnvironment({
		root: params.worktree,
		args: ['commit', '-qm', 'feat(x): an earlier lot'],
		environment: dated,
	})
	return headOf(params.worktree)
}

/** The worktree's branch rebased onto `onto` until it stops on a conflict; throws when it does not stop. */
function stopOnConflict(params: { worktree: string; onto: string }): void {
	const result = spawnSync('git', ['rebase', '-q', params.onto], {
		cwd: params.worktree,
		encoding: 'utf8',
	})
	if (result.status === 0) throw new Error(`git rebase ${params.onto} met no conflict`)
}

/** Git run in `root` with `environment` over this process's; throws with its output when it fails. */
function gitWithEnvironment(params: {
	root: string
	args: string[]
	environment: Record<string, string>
}): string {
	const result = spawnSync('git', params.args, {
		cwd: params.root,
		encoding: 'utf8',
		env: { ...process.env, ...params.environment },
	})
	if (result.status !== 0)
		throw new Error(`git ${params.args.join(' ')} failed: ${result.stderr}${result.stdout}`)
	return result.stdout
}

/** The worktree's HEAD reflog expired now (as git's expiry or a prune leaves it): it names no commit any more. */
export function expireHeadReflog(params: { worktree: string }): void {
	git({
		root: params.worktree,
		args: ['reflog', 'expire', '--expire=now', '--expire-unreachable=now', 'HEAD'],
	})
}
