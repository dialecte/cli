/**
 * Scratch repositories for the landing model: a bare origin, `main` pushed, a lot branch in its own worktree, and
 * origin's main moved by real git merges (fast-forward, merge commit, squash) made from another clone, as a queue
 * would; a fake host answering pull request reads from memory.
 */
import { join } from 'node:path'

import { recordingHost } from './land-lot.ts'
import {
	CHILD_BRANCH,
	CHILD_FILE,
	CHILD_TEXT,
	LOT_BRANCH,
	LOT_FILE,
	LOT_TEXT,
	PULL_URL,
} from './landing-repository.constants.ts'
import {
	cloneRepository,
	git,
	initializeRepository,
	temporaryFolder,
	writeFiles,
} from './scratch-repository.ts'

import type { PullRequest } from '../src/lib/host/host.types.ts'
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
export function pullRequestOf(params: {
	number: number
	state: PullRequest['state']
	head: string
	draft?: boolean
	queued?: boolean
}): PullRequest {
	return {
		number: params.number,
		url: PULL_URL.replace('{number}', String(params.number)),
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
		readPullRequest: function readPullRequest(call: { root: string; ref: string }) {
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
