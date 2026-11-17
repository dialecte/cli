/** What `gh` writes for a pull request's checks and its line comments, read into the host's types. */
import {
	COMPLETED_STATUS,
	PASSING_CONCLUSIONS,
	PASSING_STATUS_STATE,
	PENDING_STATUS_STATES,
	STATUS_CONTEXT_TYPE,
} from './host.constants.ts'

import type { HostRefusal, PullRequestChecks, ReviewComment } from './host.types.ts'

/**
 * The checks of `gh pr view --json headRefOid,statusCheckRollup`: failing when one failed, else pending when one runs,
 * else green; none when the head has no check (never read as green). A check run again counts by its newest run only
 * (the rollup keeps the runs it superseded).
 *
 * @intent tell whether a pull request's head passed its checks
 * @internal
 */
export function checksOf(params: { text: string }): PullRequestChecks | HostRefusal {
	const parsed = objectOf(params.text)
	if (parsed === undefined || typeof parsed.headRefOid !== 'string')
		return { refusal: `gh pr view: no head in ${params.text.slice(0, 80)}` }
	const rollup = newestRuns(Array.isArray(parsed.statusCheckRollup) ? parsed.statusCheckRollup : [])
	const failing: string[] = []
	const pending: string[] = []
	for (const check of rollup) {
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

/**
 * The rollup's entries as objects, one per check: a check run by its workflow and name, a commit status by its
 * context; of several runs of one check the one started last (else completed last) kept, in the order first met.
 */
function newestRuns(rollup: unknown[]): Record<string, unknown>[] {
	const newest = new Map<string, Record<string, unknown>>()
	for (const entry of rollup) {
		const check =
			typeof entry === 'object' && entry !== null ? (entry as Record<string, unknown>) : {}
		const key =
			check.__typename === STATUS_CONTEXT_TYPE
				? `${STATUS_CONTEXT_TYPE}:${String(check.context ?? '')}`
				: `${String(check.workflowName ?? '')}:${String(check.name ?? '')}`
		const kept = newest.get(key)
		if (kept === undefined || timeOf(check) >= timeOf(kept)) newest.set(key, check)
	}
	return [...newest.values()]
}

/** When a run started, else completed (ISO time, compared as text); empty when neither is given. */
function timeOf(check: Record<string, unknown>): string {
	return String(check.startedAt ?? check.completedAt ?? '')
}

/** A rollup entry's outcome: a commit status by its state, a check run by its status and conclusion. */
function outcomeOf(check: Record<string, unknown>): 'passed' | 'failing' | 'pending' {
	if (check.__typename === STATUS_CONTEXT_TYPE) {
		const state = String(check.state ?? '')
		if (state === PASSING_STATUS_STATE) return 'passed'
		return PENDING_STATUS_STATES.includes(state) ? 'pending' : 'failing'
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
