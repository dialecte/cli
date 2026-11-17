/** The GitHub host adapter: pull requests and the merge queue through the `gh` cli. */
import { spawnSync } from 'node:child_process'

import { checksOf, reviewCommentsOf } from './github-reads.ts'
import {
	BROWSER_OPENERS,
	CHECKS_FIELDS,
	FILES_TAB_SUFFIX,
	GH_COMMAND,
	GH_STACK,
	HOST_ENVIRONMENT,
	HOST_READ_TIMEOUT_MS,
	HOST_WRITE_TIMEOUT_MS,
	NO_PULL_REQUEST_PATTERN,
	NO_STACKS_REASON,
	OPEN_TIMEOUT_MS,
	PULL_REQUEST_FIELDS,
	REVIEW_COMMENTS_ENDPOINT,
	REVIEW_COMMENTS_JQ,
	STACK_MERGE_FLAGS,
} from './host.constants.ts'

import type {
	HostAdapter,
	HostRefusal,
	PullRequest,
	PullRequestChecks,
	ReviewComment,
	StackSupport,
} from './host.types.ts'

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
				args: ['pr', 'view', params.ref, '--json', PULL_REQUEST_FIELDS],
				timeout: HOST_READ_TIMEOUT_MS,
			})
			if ('refusal' in run) return NO_PULL_REQUEST_PATTERN.test(run.refusal) ? undefined : run
			return pullRequestOf({ text: run.output })
		},
		openPullRequest: function openPullRequest(params) {
			const created = runGh({
				root: params.root,
				args: [
					'pr',
					'create',
					'--base',
					params.base,
					'--head',
					params.branch,
					'--title',
					params.title,
					'--body',
					params.body,
					...(params.draft ? ['--draft'] : []),
				],
				timeout: HOST_WRITE_TIMEOUT_MS,
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
		queuePullRequest: function queuePullRequest(params) {
			const number = String(params.number)
			if (params.draft) {
				const ready = runGh({
					root: params.root,
					args: ['pr', 'ready', number],
					timeout: HOST_WRITE_TIMEOUT_MS,
				})
				if ('refusal' in ready) return ready
			}
			const queued = runGh({
				root: params.root,
				args: ['pr', 'merge', number, '--auto'],
				timeout: HOST_WRITE_TIMEOUT_MS,
			})
			return 'refusal' in queued ? queued : undefined
		},
	}
	return host
}

/** Stacks when the gh-stack extension answers (`gh stack --help`, no network); its absence is why not. */
function probeStacksOnGithub(params: { root: string }): StackSupport {
	const run = runGh({
		root: params.root,
		args: [GH_STACK, '--help'],
		timeout: HOST_READ_TIMEOUT_MS,
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
		args: [GH_STACK, 'link', params.parent, params.child],
		timeout: HOST_WRITE_TIMEOUT_MS,
	})
	return 'refusal' in linked ? linked : undefined
}

/** `gh stack merge <number> --yes --squash`: the layers up to it queued, all or nothing; undefined once queued. */
function queueStackOnGithub(params: { root: string; number: number }): HostRefusal | undefined {
	const queued = runGh({
		root: params.root,
		args: [GH_STACK, 'merge', String(params.number), ...STACK_MERGE_FLAGS],
		timeout: HOST_WRITE_TIMEOUT_MS,
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
		args: ['pr', 'edit', String(params.number), '--base', params.base],
		timeout: HOST_WRITE_TIMEOUT_MS,
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
		args: ['pr', 'view', String(params.number), '--json', CHECKS_FIELDS],
		timeout: HOST_READ_TIMEOUT_MS,
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
		args: [
			'api',
			REVIEW_COMMENTS_ENDPOINT.replace('{number}', String(params.number)),
			'--paginate',
			'--jq',
			REVIEW_COMMENTS_JQ,
		],
		timeout: HOST_READ_TIMEOUT_MS,
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
		args: ['pr', 'edit', String(params.number), '--title', params.title, '--body-file', '-'],
		timeout: HOST_WRITE_TIMEOUT_MS,
		input: params.body,
	})
	return 'refusal' in edited ? edited : undefined
}

/** `gh pr close <number>`: undefined once closed, else its refusal. */
function closeOnGithub(params: { root: string; number: number }): HostRefusal | undefined {
	const closed = runGh({
		root: params.root,
		args: ['pr', 'close', String(params.number)],
		timeout: HOST_WRITE_TIMEOUT_MS,
	})
	return 'refusal' in closed ? closed : undefined
}

/** One `gh` call (`input` on its standard input, none when absent): its standard output, or its first error line. */
function runGh(params: {
	root: string
	args: string[]
	timeout: number
	input?: string
}): { output: string } | HostRefusal {
	const run = spawnSync(GH_COMMAND, params.args, {
		cwd: params.root,
		encoding: 'utf8',
		timeout: params.timeout,
		...(params.input === undefined
			? { stdio: ['ignore', 'pipe', 'pipe'] }
			: { input: params.input }),
		env: { ...process.env, ...HOST_ENVIRONMENT },
	})
	if (run.status === 0) return { output: run.stdout }
	const reason = run.error?.message ?? (run.stderr.trim().split('\n')[0] || `exit ${run.status}`)
	return { refusal: `${GH_COMMAND} ${params.args.slice(0, 2).join(' ')}: ${reason}` }
}

/** A pull request from `gh pr view --json`; a refusal when the text is not what gh writes. */
function pullRequestOf(params: { text: string }): PullRequest | HostRefusal {
	try {
		const parsed = JSON.parse(params.text) as Record<string, unknown>
		if (typeof parsed.number !== 'number' || typeof parsed.state !== 'string')
			return { refusal: `gh pr view: no number or state in ${params.text.slice(0, 80)}` }
		const state = parsed.state.toLowerCase()
		return {
			number: parsed.number,
			url: String(parsed.url ?? ''),
			title: String(parsed.title ?? ''),
			body: String(parsed.body ?? ''),
			state: state === 'merged' ? 'merged' : state === 'closed' ? 'closed' : 'open',
			draft: parsed.isDraft === true,
			queued: parsed.autoMergeRequest !== null && parsed.autoMergeRequest !== undefined,
			head: String(parsed.headRefOid ?? ''),
			...(typeof parsed.baseRefName === 'string' && { base: parsed.baseRefName }),
		}
	} catch {
		return { refusal: `gh pr view: not the JSON it writes: ${params.text.slice(0, 80)}` }
	}
}
