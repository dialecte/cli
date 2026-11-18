/** The GitHub vendor's live probes: one per read of its call table, and the probe-only reads. */
import { fillMessage } from '../../knowledge/standard/fill-message.ts'
import { readReviewCommentsWith } from './github-host.ts'
import {
	GH_STACK_INSTALL,
	GITHUB_PROBE_TEXTS,
	GITHUB_SUBJECT_CALL,
	MERGED_STATE,
	NO_SUCH_BRANCH,
	ONE_PULL_REQUEST,
	REVIEW_PROBE,
} from './github.constants.ts'

import type { HostLine, HostProbe, HostRefusal, HostSubjectProbe } from '../host.types.ts'
import type { GithubReadCall } from './github.types.ts'
import type { runGh } from './run-gh.ts'

/** The newest merged pull request's number, read with `gh pr list`; a refusal when gh fails or there is none. */
export function newestMergedPullRequest(params: {
	run: typeof runGh
	root: string
}): { number: number } | HostRefusal {
	const answer = params.run({
		root: params.root,
		call: GITHUB_SUBJECT_CALL,
		options: { '--state': MERGED_STATE, '--limit': ONE_PULL_REQUEST },
	})
	if ('refusal' in answer) return answer
	const listed = listOf({ text: answer.output })
	if (listed === undefined)
		return {
			refusal: fillMessage({
				template: GITHUB_PROBE_TEXTS.notTheJson,
				values: { text: answer.output.slice(0, 80) },
			}),
		}
	const [first] = listed
	if (first === undefined) return { refusal: GITHUB_PROBE_TEXTS.nothingToProbe }
	return { number: first }
}

/** The numbers of a `gh pr list --json number` answer; undefined when the text is not that list. */
function listOf(params: { text: string }): number[] | undefined {
	try {
		const parsed: unknown = JSON.parse(params.text)
		if (!Array.isArray(parsed)) return undefined
		const numbers = parsed.map(function numberOf(entry: unknown) {
			return typeof entry === 'object' && entry !== null && 'number' in entry
				? entry.number
				: undefined
		})
		return numbers.every(function isNumber(each) {
			return typeof each === 'number'
		})
			? (numbers as number[])
			: undefined
	} catch {
		return undefined
	}
}

/** The newest merged pull request as the subject's line: a warning when there is none, an error when gh fails. */
function findMergedPullRequest(
	params: Parameters<HostSubjectProbe>[0],
): ReturnType<HostSubjectProbe> {
	const found = newestMergedPullRequest({ run: params.run, root: params.root })
	if ('refusal' in found)
		return {
			line: {
				status: found.refusal === GITHUB_PROBE_TEXTS.nothingToProbe ? 'warning' : 'error',
				subject: params.subject,
				detail: found.refusal,
			},
		}
	return {
		line: {
			status: 'ok',
			subject: params.subject,
			detail: fillMessage({
				template: GITHUB_PROBE_TEXTS.newestMerged,
				values: { number: String(found.number) },
			}),
		},
		pullRequest: found.number,
	}
}

/** The subject: the newest merged pull request, which the other probes read. */
export const GITHUB_SUBJECT: { call: typeof GITHUB_SUBJECT_CALL; find: HostSubjectProbe } = {
	call: GITHUB_SUBJECT_CALL,
	find: findMergedPullRequest,
}

/** The warning of a read that needs a pull request when none was found. */
function needsPullRequest(params: { subject: string }): HostLine {
	return { status: 'warning', subject: params.subject, detail: GITHUB_PROBE_TEXTS.needsPullRequest }
}

/** The pull request read by number, then a branch that has none: it must read as no pull request. */
function probeViewPullRequest(params: Parameters<HostProbe>[0]): HostLine {
	if (params.pullRequest === undefined) return needsPullRequest(params)
	const number = String(params.pullRequest)
	const read = params.host.readPullRequest({ root: params.root, ref: number })
	if (read !== undefined && 'refusal' in read)
		return { status: 'error', subject: params.subject, detail: read.refusal }
	if (read === undefined)
		return {
			status: 'error',
			subject: params.subject,
			detail: fillMessage({ template: GITHUB_PROBE_TEXTS.pullRequestNone, values: { number } }),
		}
	const none = params.host.readPullRequest({ root: params.root, ref: NO_SUCH_BRANCH })
	if (none !== undefined)
		return {
			status: 'error',
			subject: params.subject,
			detail: fillMessage({
				template: GITHUB_PROBE_TEXTS.noPullRequestTextChanged,
				values: { refusal: 'refusal' in none ? none.refusal : `#${none.number}` },
			}),
		}
	return {
		status: 'ok',
		subject: params.subject,
		detail: fillMessage({ template: GITHUB_PROBE_TEXTS.pullRequestRead, values: { number } }),
	}
}

/** The checks on the pull request's head, in any state. */
function probeViewChecks(params: Parameters<HostProbe>[0]): HostLine {
	if (params.pullRequest === undefined) return needsPullRequest(params)
	const checks = params.host.readChecks({ root: params.root, number: params.pullRequest })
	if ('refusal' in checks)
		return { status: 'error', subject: params.subject, detail: checks.refusal }
	return {
		status: 'ok',
		subject: params.subject,
		detail: fillMessage({
			template: GITHUB_PROBE_TEXTS.checksRead,
			values: { number: String(params.pullRequest), state: checks.state },
		}),
	}
}

/** Whether the pull request is queued. */
function probeQueuedState(params: Parameters<HostProbe>[0]): HostLine {
	if (params.pullRequest === undefined) return needsPullRequest(params)
	const queued = params.host.readQueued({ root: params.root, number: params.pullRequest })
	if ('refusal' in queued)
		return { status: 'error', subject: params.subject, detail: queued.refusal }
	return {
		status: 'ok',
		subject: params.subject,
		detail: fillMessage({
			template: GITHUB_PROBE_TEXTS.queuedRead,
			values: { number: String(params.pullRequest), queued: String(queued.queued) },
		}),
	}
}

/** The reference pull request's line comments, through the adapter's own read: one on a line and one reply at least. */
function probeReviewComments(params: Parameters<HostProbe>[0]): HostLine {
	const comments = readReviewCommentsWith({
		run: params.run,
		root: params.root,
		values: REVIEW_PROBE,
	})
	if ('refusal' in comments)
		return { status: 'error', subject: params.subject, detail: comments.refusal }
	const values = {
		reference: `${REVIEW_PROBE.owner}/${REVIEW_PROBE.repo}#${REVIEW_PROBE.number}`,
		count: String(comments.length),
		lines: String(
			comments.filter(function onALine(comment) {
				return comment.line !== undefined
			}).length,
		),
		replies: String(
			comments.filter(function isReply(comment) {
				return comment.replyTo !== undefined
			}).length,
		),
	}
	if (values.lines === '0' || values.replies === '0')
		return {
			status: 'error',
			subject: params.subject,
			detail: fillMessage({ template: GITHUB_PROBE_TEXTS.commentKeysChanged, values }),
		}
	return {
		status: 'ok',
		subject: params.subject,
		detail: fillMessage({ template: GITHUB_PROBE_TEXTS.commentsRead, values }),
	}
}

/** Whether gh-stack answers: absent is a warning, stacks are then off. */
function probeStackHelp(params: Parameters<HostProbe>[0]): HostLine {
	const support = params.host.probeStacks({ root: params.root })
	if (support.stacks)
		return { status: 'ok', subject: params.subject, detail: GITHUB_PROBE_TEXTS.stacksOn }
	return {
		status: 'warning',
		subject: params.subject,
		detail: fillMessage({ template: GITHUB_PROBE_TEXTS.stacksOff, values: { why: support.why } }),
		fix: GH_STACK_INSTALL,
	}
}

/** One probe per other read call: a read that has none does not compile. */
export const GITHUB_PROBES: Record<
	Exclude<GithubReadCall, typeof GITHUB_SUBJECT_CALL>,
	HostProbe
> = {
	viewPullRequest: probeViewPullRequest,
	viewChecks: probeViewChecks,
	queuedState: probeQueuedState,
	reviewComments: probeReviewComments,
	stackHelp: probeStackHelp,
}
