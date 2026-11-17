/** What `gh` writes for a pull request's checks and its line comments, read into the host's types. */
import {
	COMPLETED_STATUS,
	PASSING_CONCLUSIONS,
	PASSING_STATUS_STATE,
	PENDING_STATUS_STATES,
} from './host.constants.ts'

import type { HostRefusal, PullRequestChecks, ReviewComment } from './host.types.ts'

/**
 * The checks of `gh pr view --json headRefOid,statusCheckRollup`: failing when one failed, else pending when one runs,
 * else green; none when the head has no check (never read as green).
 *
 * @intent tell whether a pull request's head passed its checks
 * @internal
 */
export function checksOf(params: { text: string }): PullRequestChecks | HostRefusal {
	const parsed = objectOf(params.text)
	if (parsed === undefined || typeof parsed.headRefOid !== 'string')
		return { refusal: `gh pr view: no head in ${params.text.slice(0, 80)}` }
	const rollup = Array.isArray(parsed.statusCheckRollup) ? parsed.statusCheckRollup : []
	const failing: string[] = []
	const pending: string[] = []
	for (const entry of rollup) {
		const check =
			typeof entry === 'object' && entry !== null ? (entry as Record<string, unknown>) : {}
		const outcome = outcomeOf(check)
		const name = String(check.name ?? check.context ?? '')
		if (outcome === 'failing') failing.push(name)
		else if (outcome === 'pending') pending.push(name)
	}
	const state =
		failing.length > 0
			? 'failing'
			: pending.length > 0
				? 'pending'
				: rollup.length === 0
					? 'none'
					: 'green'
	return { head: parsed.headRefOid, state, failing, pending }
}

/**
 * The comments of `gh api .../comments --jq`, one JSON object per line; a line that is no comment refuses the whole
 * list (never a partial one).
 *
 * @intent read a pull request's line comments
 * @internal
 */
export function reviewCommentsOf(params: { text: string }): ReviewComment[] | HostRefusal {
	const comments: ReviewComment[] = []
	for (const line of params.text.split('\n')) {
		if (line.trim() === '') continue
		const parsed = objectOf(line)
		if (
			parsed === undefined ||
			typeof parsed.id !== 'number' ||
			typeof parsed.path !== 'string' ||
			typeof parsed.body !== 'string'
		)
			return { refusal: `gh api: not a review comment: ${line.slice(0, 80)}` }
		comments.push({
			id: parsed.id,
			path: parsed.path,
			...(typeof parsed.line === 'number' && { line: parsed.line }),
			body: parsed.body,
			...(typeof parsed.replyTo === 'number' && { replyTo: parsed.replyTo }),
		})
	}
	return comments
}

/** A rollup entry's outcome: a check run by its status and conclusion, a commit status by its state. */
function outcomeOf(check: Record<string, unknown>): 'passed' | 'failing' | 'pending' {
	if (typeof check.state === 'string' && check.status === undefined) {
		if (check.state === PASSING_STATUS_STATE) return 'passed'
		return PENDING_STATUS_STATES.includes(check.state) ? 'pending' : 'failing'
	}
	if (check.status !== COMPLETED_STATUS) return 'pending'
	return PASSING_CONCLUSIONS.includes(String(check.conclusion)) ? 'passed' : 'failing'
}

/** The text read as a JSON object; undefined otherwise. */
function objectOf(text: string): Record<string, unknown> | undefined {
	try {
		const parsed: unknown = JSON.parse(text)
		return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
			? (parsed as Record<string, unknown>)
			: undefined
	} catch {
		return undefined
	}
}
