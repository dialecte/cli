/** The GitHub host adapter: pull requests and the merge queue through the `gh` cli. */
import { spawnSync } from 'node:child_process'

import { BROWSER_OPENERS, OPEN_TIMEOUT_MS } from '../host.constants.ts'
import { checksOf, reviewCommentsOf } from './github-reads.ts'
import { FILES_TAB_SUFFIX, NO_PULL_REQUEST_PATTERN, NO_STACKS_REASON } from './github.constants.ts'
import { runGh } from './run-gh.ts'

import type {
	HostAdapter,
	HostRefusal,
	PullRequest,
	PullRequestChecks,
	ReviewComment,
	StackSupport,
} from '../host.types.ts'

/**
 * GitHub through `gh`: a pull request read (by number, or a branch's newest), opened, edited (title and body), queued (`gh pr merge --auto`,
 * which joins the merge queue when the base branch has one; a draft made ready first); its checks and line comments read,
 * its changed files opened in the browser. Reads are short, never a prompt.
 *
 * @intent land lots through GitHub's pull requests and merge queue
 * @internal
 */
export function createGithubHost(): HostAdapter {
	const host: HostAdapter = {
		readPullRequest: function readPullRequest(params) {
			const run = runGh({
				root: params.root,
				call: 'viewPullRequest',
				positional: [params.ref],
			})
			if ('refusal' in run) return NO_PULL_REQUEST_PATTERN.test(run.refusal) ? undefined : run
			return pullRequestOf({ text: run.output })
		},
		openPullRequest: function openPullRequest(params) {
			const created = runGh({
				root: params.root,
				call: 'createPullRequest',
				options: {
					'--base': params.base,
					'--head': params.branch,
					'--title': params.title,
					'--body': params.body,
					'--draft': params.draft || undefined,
				},
			})
			if ('refusal' in created) return created
			const read = host.readPullRequest({ root: params.root, ref: params.branch })
			return (
				read ?? { refusal: `the pull request of ${params.branch} was opened but cannot be read` }
			)
		},
		editPullRequest: editOnGithub,
		closePullRequest: closeOnGithub,
		readChecks: readChecksOnGithub,
		readReviewComments: readCommentsOnGithub,
		openFiles: openFilesTab,
		probeStacks: probeStacksOnGithub,
		linkStack: linkStackOnGithub,
		queueStack: queueStackOnGithub,
		retargetPullRequest: retargetOnGithub,
		draftPullRequest: draftOnGithub,
		readQueued: readQueuedOnGithub,
		queuePullRequest: function queuePullRequest(params) {
			const number = String(params.number)
			if (params.draft) {
				const ready = runGh({
					root: params.root,
					call: 'readyPullRequest',
					positional: [number],
				})
				if ('refusal' in ready) return ready
			}
			const queued = runGh({
				root: params.root,
				call: 'mergePullRequest',
				positional: [number],
				options: { '--auto': true },
			})
			return 'refusal' in queued ? queued : undefined
		},
	}
	return host
}

/**
 * The pull request taken back out of the queue: `gh pr merge <number> --disable-auto` when queued, then
 * `gh pr ready <number> --undo` when not a draft; undefined once done (nothing asked for a draft not queued).
 */
function draftOnGithub(params: {
	root: string
	number: number
	queued: boolean
	draft: boolean
}): HostRefusal | undefined {
	const number = String(params.number)
	if (params.queued) {
		const unqueued = runGh({
			root: params.root,
			call: 'mergePullRequest',
			positional: [number],
			options: { '--disable-auto': true },
		})
		if ('refusal' in unqueued) return unqueued
	}
	if (params.draft) return undefined
	const drafted = runGh({
		root: params.root,
		call: 'readyPullRequest',
		positional: [number],
		options: { '--undo': true },
	})
	return 'refusal' in drafted ? drafted : undefined
}

/** Stacks when the gh-stack extension answers (`gh stack --help`, no network); its absence is why not. */
function probeStacksOnGithub(params: { root: string }): StackSupport {
	const run = runGh({
		root: params.root,
		call: 'stackHelp',
		options: { '--help': true },
	})
	return 'refusal' in run ? { stacks: false, why: NO_STACKS_REASON } : { stacks: true }
}

/** `gh stack link <parent url> <child url>`: the child linked on top of the parent; undefined once linked. */
function linkStackOnGithub(params: {
	root: string
	parent: string
	child: string
}): HostRefusal | undefined {
	const linked = runGh({
		root: params.root,
		call: 'stackLink',
		positional: [params.parent, params.child],
	})
	return 'refusal' in linked ? linked : undefined
}

/**
 * `gh stack merge <number> --yes --squash`: the layers up to it queued, all or nothing (a draft made ready first,
 * `gh pr ready`); undefined once queued.
 */
function queueStackOnGithub(params: {
	root: string
	number: number
	draft: boolean
}): HostRefusal | undefined {
	if (params.draft) {
		const ready = runGh({
			root: params.root,
			call: 'readyPullRequest',
			positional: [String(params.number)],
		})
		if ('refusal' in ready) return ready
	}
	const queued = runGh({
		root: params.root,
		call: 'stackMerge',
		positional: [String(params.number)],
		options: { '--yes': true, '--squash': true },
	})
	return 'refusal' in queued ? queued : undefined
}

/** `gh pr edit <number> --base <base>`: undefined once it merges into `base`. */
function retargetOnGithub(params: {
	root: string
	number: number
	base: string
}): HostRefusal | undefined {
	const edited = runGh({
		root: params.root,
		call: 'editPullRequest',
		positional: [String(params.number)],
		options: { '--base': params.base },
	})
	return 'refusal' in edited ? edited : undefined
}

/** `gh pr view <number> --json headRefOid,statusCheckRollup`: the checks on its head, or the refusal. */
function readChecksOnGithub(params: {
	root: string
	number: number
}): PullRequestChecks | HostRefusal {
	const run = runGh({
		root: params.root,
		call: 'viewChecks',
		positional: [String(params.number)],
	})
	return 'refusal' in run ? run : checksOf({ text: run.output })
}

/** `gh api` of the pull request's review comments, every page, one object per line: the comments, or the refusal. */
function readCommentsOnGithub(params: {
	root: string
	number: number
}): ReviewComment[] | HostRefusal {
	const run = runGh({
		root: params.root,
		call: 'reviewComments',
		values: { number: String(params.number) },
		options: { '--paginate': true },
	})
	return 'refusal' in run ? run : reviewCommentsOf({ text: run.output })
}

/** The page of the pull request's changed files opened by the platform's browser opener: undefined once handed over. */
function openFilesTab(params: { root: string; url: string }): HostRefusal | undefined {
	const [command, ...words] = BROWSER_OPENERS[process.platform] ?? BROWSER_OPENERS.default
	const run = spawnSync(command, [...words, `${params.url}${FILES_TAB_SUFFIX}`], {
		cwd: params.root,
		encoding: 'utf8',
		timeout: OPEN_TIMEOUT_MS,
		stdio: ['ignore', 'ignore', 'pipe'],
	})
	if (run.status === 0) return undefined
	const reason = run.error?.message ?? (run.stderr.trim().split('\n')[0] || `exit ${run.status}`)
	return { refusal: `${command}: ${reason}` }
}

/** `gh pr edit <number> --title <title> --body-file -`, the body on its input: undefined once edited, else its refusal. */
function editOnGithub(params: {
	root: string
	number: number
	title: string
	body: string
}): HostRefusal | undefined {
	const edited = runGh({
		root: params.root,
		call: 'editPullRequest',
		positional: [String(params.number)],
		options: { '--title': params.title, '--body-file': '-' },
		input: params.body,
	})
	return 'refusal' in edited ? edited : undefined
}

/** `gh pr close <number>`: undefined once closed, else its refusal. */
function closeOnGithub(params: { root: string; number: number }): HostRefusal | undefined {
	const closed = runGh({
		root: params.root,
		call: 'closePullRequest',
		positional: [String(params.number)],
	})
	return 'refusal' in closed ? closed : undefined
}

/**
 * `gh api graphql` on the pull request: queued when auto-merge is on or it is in the merge queue (a stack merge queues
 * without auto-merge); a refusal when gh fails or answers otherwise.
 */
function readQueuedOnGithub(params: {
	root: string
	number: number
}): { queued: boolean } | HostRefusal {
	const run = runGh({
		root: params.root,
		call: 'queuedState',
		options: { '-F': ['owner={owner}', 'repo={repo}', `number=${params.number}`] },
	})
	if ('refusal' in run) return run
	try {
		const parsed = JSON.parse(run.output) as {
			isInMergeQueue?: unknown
			autoMergeRequest?: unknown
		}
		return {
			queued:
				parsed.isInMergeQueue === true ||
				(parsed.autoMergeRequest !== null && parsed.autoMergeRequest !== undefined),
		}
	} catch {
		return { refusal: `gh api graphql: not the JSON it writes: ${run.output.slice(0, 80)}` }
	}
}

/** A pull request from `gh pr view --json`; a refusal when the text is not what gh writes. */
function pullRequestOf(params: { text: string }): PullRequest | HostRefusal {
	try {
		const parsed = JSON.parse(params.text) as Record<string, unknown>
		if (
			typeof parsed.number !== 'number' ||
			typeof parsed.state !== 'string' ||
			typeof parsed.url !== 'string' ||
			parsed.url === ''
		)
			return { refusal: `gh pr view: no number, state or url in ${params.text.slice(0, 80)}` }
		const state = parsed.state.toLowerCase()
		const url = parsed.url
		return {
			number: parsed.number,
			url,
			title: String(parsed.title ?? ''),
			body: String(parsed.body ?? ''),
			state: state === 'merged' ? 'merged' : state === 'closed' ? 'closed' : 'open',
			draft: parsed.isDraft === true,
			// auto-merge on; the merge queue itself is read where it decides (readQueued): gh pr view cannot say
			queued: parsed.autoMergeRequest !== null && parsed.autoMergeRequest !== undefined,
			head: String(parsed.headRefOid ?? ''),
			...(typeof parsed.baseRefName === 'string' && { base: parsed.baseRefName }),
			filesUrl: `${url}${FILES_TAB_SUFFIX}`,
		}
	} catch {
		return { refusal: `gh pr view: not the JSON it writes: ${params.text.slice(0, 80)}` }
	}
}
