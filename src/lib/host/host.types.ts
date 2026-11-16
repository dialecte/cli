/** A pull request on the host, as a landing reads it. */
export type PullRequest = {
	number: number
	url: string
	title: string
	state: 'open' | 'merged' | 'closed'
	draft: boolean
	/** True while the host merges it once its checks pass (auto-merge on, or in the merge queue). */
	queued: boolean
	/** The commit its head branch pointed at (the last push). */
	head: string
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
	/** The pull request's title replaced by `title`. */
	retitlePullRequest(params: {
		root: string
		number: number
		title: string
	}): HostRefusal | undefined
	/** The pull request closed: taken out of the merge queue, never merged. */
	closePullRequest(params: { root: string; number: number }): HostRefusal | undefined
	/** The pull request queued: merged by the host once its checks pass (a draft made ready first). */
	queuePullRequest(params: {
		root: string
		number: number
		draft: boolean
	}): HostRefusal | undefined
}
