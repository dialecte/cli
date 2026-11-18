/** A pull request on the host, as a landing reads it. */
export type PullRequest = {
	number: number
	url: string
	title: string
	/** Its description as the host holds it (the squash commit's body). */
	body: string
	state: 'open' | 'merged' | 'closed'
	draft: boolean
	/** True while the host merges it once its checks pass (auto-merge on, or in the merge queue). */
	queued: boolean
	/** The commit its head branch pointed at (the last push). */
	head: string
	/** The branch it merges into; undefined when the host did not say. */
	base?: string
}

/** Whether the host links pull requests into stacks here, and why not when it does not. */
export type StackSupport = { stacks: true } | { stacks: false; why: string }

/** How the checks on a pull request's head stand: all passed, one failed, one still running, or none at all. */
export type ChecksState = 'green' | 'failing' | 'pending' | 'none'

/** The checks on a pull request's head: their state and the names of the failing and the pending ones. */
export type PullRequestChecks = {
	/** The commit the checks ran on (the pull request's head). */
	head: string
	state: ChecksState
	failing: string[]
	pending: string[]
}

/** A line comment of a pull request's review: on a file, at a line when it has one; a reply names what it answers. */
export type ReviewComment = {
	id: number
	path: string
	line?: number
	body: string
	/** The comment this one answers in its thread; absent for a thread's first comment. */
	replyTo?: number
}

/** A host operation's refusal: git's or the host tool's first line. */
export type HostRefusal = { refusal: string }

/**
 * Where lots land: the one seam to the host (GitHub through `gh`; another host is another adapter). Every call runs
 * in the repository at `root`; none prompts.
 */
export type HostAdapter = {
	/** The pull request `ref` names (a number, or a branch: its newest); undefined when there is none. */
	readPullRequest(params: { root: string; ref: string }): PullRequest | undefined | HostRefusal
	/** A new pull request of `branch` into `base`. */
	openPullRequest(params: {
		root: string
		branch: string
		base: string
		title: string
		body: string
		draft: boolean
	}): PullRequest | HostRefusal
	/** The pull request's title and body replaced by `title` and `body`. */
	editPullRequest(params: {
		root: string
		number: number
		title: string
		body: string
	}): HostRefusal | undefined
	/** The pull request closed: taken out of the merge queue, never merged. */
	closePullRequest(params: { root: string; number: number }): HostRefusal | undefined
	/** The pull request queued: merged by the host once its checks pass (a draft made ready first). */
	queuePullRequest(params: {
		root: string
		number: number
		draft: boolean
	}): HostRefusal | undefined
	/**
	 * The pull request taken back out of the queue: auto-merge turned off when `queued`, made a draft when not `draft`
	 * (an approval is for one head); nothing asked when it is a draft not queued.
	 */
	draftPullRequest(params: {
		root: string
		number: number
		queued: boolean
		draft: boolean
	}): HostRefusal | undefined
	/** The checks on the pull request's head. */
	readChecks(params: { root: string; number: number }): PullRequestChecks | HostRefusal
	/** The line comments of the pull request's reviews, oldest first. */
	readReviewComments(params: { root: string; number: number }): ReviewComment[] | HostRefusal
	/** The pull request's changed files opened in the browser (`url` is the pull request's page). */
	openFiles(params: { root: string; url: string }): HostRefusal | undefined
	/** Whether the host links pull requests into stacks here (33CI CI4); no network asked. */
	probeStacks(params: { root: string }): StackSupport
	/** The pull request at `child` (its url) linked on top of the one at `parent` as a stack. */
	linkStack(params: { root: string; parent: string; child: string }): HostRefusal | undefined
	/**
	 * The stack queued up to and including `number`, all or nothing (never auto-merge: refused for a stack); a draft made
	 * ready first.
	 */
	queueStack(params: { root: string; number: number; draft: boolean }): HostRefusal | undefined
	/** The pull request's base branch changed to `base`. */
	retargetPullRequest(params: {
		root: string
		number: number
		base: string
	}): HostRefusal | undefined
}
