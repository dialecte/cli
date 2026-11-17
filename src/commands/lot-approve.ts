/**
 * `dialecte lot approve <id> --by <who> [--reason <text>]`: a person's approval of the lot's pull request (33CI CI7).
 * Refused, nothing recorded and nothing queued, unless the pull request is open at the lot's landed head, its checks
 * are green there and no blocking finding is open. Then the approval is appended to the lot folder's `approvals.jsonl`
 * (a person's verdict row of `review.jsonl`), the pull request's text rendered again from the records and the pull
 * request queued (made ready when a draft). `--by orchestrator` approves the cli's own lots only.
 */
import { join } from 'node:path'

import { renderLotUsage } from '../lib/command-map/render-help.ts'
import { resultOf } from '../lib/command-result.ts'
import { EVENT_LINE_LIMIT } from '../lib/events/events.constants.ts'
import { appendLine } from '../lib/events/write-event.ts'
import { readLanding } from '../lib/handover/land-record.ts'
import { createGithubHost } from '../lib/host/github-host.ts'
import { fillMessage } from '../lib/knowledge/standard/fill-message.ts'
import { readPackageJson } from '../lib/package-json.ts'
import { preparePullRequest } from '../lib/pr/pull-request-sources.ts'
import { forbiddenWordRefusal, isOneLine } from '../lib/review-rounds/option-checks.ts'
import { openBlockingFindings, refreshReviewRecord } from '../lib/review-rounds/review-record.ts'
import { readArguments } from '../lib/review-rounds/round-arguments.ts'
import { PUBLIC_TEXT_REFUSAL } from '../lib/store/public-text.constants.ts'
import { folderPlanEntryIds, publicTextLabel } from '../lib/store/public-text.ts'
import { STORE_FILES } from '../lib/store/store.constants.ts'
import {
	APPROVABLE_STATES,
	APPROVAL_LINE_SCHEMA,
	APPROVE_OPTIONS,
	CLI_PACKAGE_NAME,
	LOT_APPROVE_LINES,
	ORCHESTRATOR_APPROVER,
	SHOWN_HEAD_LENGTH,
} from './lot-approve.constants.ts'
import { resolveLotPlace, sendRenderedText } from './lot-pr.ts'

import type { CommandResult } from '../lib/command-result.types.ts'
import type { HostAdapter, PullRequest, PullRequestChecks } from '../lib/host/host.types.ts'
import type { ApprovalLine } from './lot-approve.types.ts'
import type { LotPlace } from './lot-pr.types.ts'

export function runLotApprove(params: {
	cwd: string
	argv: string[]
	/** Where the pull request lives; default: GitHub through `gh`. */
	host?: HostAdapter
	now?: Date
}): CommandResult {
	const read = readArguments({ argv: params.argv, valueOptions: APPROVE_OPTIONS })
	if (typeof read === 'string') return { exitCode: 2, output: renderLotUsage() }
	const by = read.values.get('by')
	const reason = read.values.get('reason')
	if (read.words.length !== 1 || !isOneLine(by) || (reason !== undefined && !isOneLine(reason)))
		return { exitCode: 2, output: renderLotUsage() }
	const place = resolveLotPlace({
		cwd: params.cwd,
		id: read.words[0],
		verb: 'approve',
		mode: 'write',
	})
	if ('exitCode' in place) return place
	const optionRefusal = approverRefusal({ place, by, reason })
	if (optionRefusal !== undefined) return lineOf({ exitCode: 2, line: optionRefusal })
	if (!APPROVABLE_STATES.includes(place.state))
		return lineOf({
			exitCode: 1,
			line: LOT_APPROVE_LINES.notApprovable
				.replace('{lot}', () => place.lot)
				.replace('{state}', place.state),
		})
	const landing = readLanding({ lotFolder: place.lotFolder })
	if (landing === undefined)
		return lineOf({
			exitCode: 1,
			line: LOT_APPROVE_LINES.noLanding.replaceAll('{lot}', () => place.lot),
		})
	const host = params.host ?? createGithubHost()
	const pullRequest = openPullRequestOf({ host, place, number: landing.number })
	if ('exitCode' in pullRequest) return pullRequest
	const checks = host.readChecks({ root: place.worktree, number: pullRequest.number })
	if ('refusal' in checks)
		return lineOf({ exitCode: 1, line: `${LOT_APPROVE_LINES.prefix}${checks.refusal}` })
	const reasons = approvalRefusals({ place, pullRequest, checks, landed: landing.head })
	if (reasons.length > 0)
		return lineOf({
			exitCode: 1,
			line: LOT_APPROVE_LINES.refused
				.replace('{lot}', () => place.lot)
				.replace('{reasons}', () => reasons.join('; ')),
		})
	// the text must render with the approval before it is recorded: a refusal leaves nothing behind
	const early = preparePullRequest({ ...place, templateRefs: ['HEAD'] })
	if ('refusal' in early)
		return lineOf({ exitCode: 1, line: `${LOT_APPROVE_LINES.prefix}${early.refusal}` })
	return recordAndQueue({
		host,
		place,
		pullRequest,
		approval: {
			schema: APPROVAL_LINE_SCHEMA,
			at: (params.now ?? new Date()).toISOString(),
			by,
			...(reason !== undefined && { reason }),
			number: pullRequest.number,
			head: landing.head,
		},
	})
}

/**
 * Why `lot approve` would refuse the lot now: the pull request is not at the head the lot landed, its checks are not
 * green there, or a blocking finding is open; none when it would approve.
 *
 * @intent tell what stands between a lot and its approval
 * @internal
 */
export function approvalRefusals(params: {
	place: LotPlace
	pullRequest: PullRequest
	checks: PullRequestChecks
	landed: string
}): string[] {
	return [
		...headReasons(params),
		...checksReasons(params.checks),
		...blockingReasons({ folder: params.place.lotFolder }),
	]
}

/**
 * The refusal of an approver the lot does not take: `--by orchestrator` on a package other than the cli, a forbidden
 * word in `--by` or `--reason`, a `--by` holding what a public record never holds (it is copied to `review.jsonl`).
 */
function approverRefusal(params: {
	place: LotPlace
	by: string
	reason: string | undefined
}): string | undefined {
	const { place, by } = params
	const packageName = readPackageJson(place.worktree).name ?? place.worktree
	if (by === ORCHESTRATOR_APPROVER && packageName !== CLI_PACKAGE_NAME)
		return LOT_APPROVE_LINES.orchestratorElsewhere.replace('{package}', () => packageName)
	const wordRefusal = forbiddenWordRefusal({
		root: place.worktree,
		verb: 'approve',
		options: [
			{ option: '--by', text: by },
			...(params.reason === undefined ? [] : [{ option: '--reason', text: params.reason }]),
		],
	})
	if (wordRefusal !== undefined) return wordRefusal
	const label = publicTextLabel({
		text: by,
		root: place.worktree,
		ids: folderPlanEntryIds({ folder: place.lotFolder }),
	})
	return label === undefined
		? undefined
		: fillMessage({
				template: PUBLIC_TEXT_REFUSAL,
				values: { verb: 'approve', option: '--by', label },
			})
}

/** The lot's open pull request `number`; the line of one the host refuses, cannot find or holds closed or merged. */
function openPullRequestOf(params: {
	host: HostAdapter
	place: LotPlace
	number: number
}): PullRequest | CommandResult {
	const { place, number } = params
	const read = params.host.readPullRequest({ root: place.worktree, ref: String(number) })
	if (read !== undefined && 'refusal' in read)
		return lineOf({ exitCode: 1, line: `${LOT_APPROVE_LINES.prefix}${read.refusal}` })
	if (read === undefined)
		return lineOf({
			exitCode: 1,
			line: LOT_APPROVE_LINES.noPullRequest
				.replace('{number}', String(number))
				.replace('{lot}', () => place.lot),
		})
	if (read.state !== 'open')
		return lineOf({
			exitCode: 1,
			line: LOT_APPROVE_LINES.notOpen
				.replace('{number}', String(number))
				.replace('{state}', read.state),
		})
	return read
}

/** Why the pull request's head is not the one approved: it is not the head the lot landed. */
function headReasons(params: {
	place: LotPlace
	pullRequest: PullRequest
	landed: string
}): string[] {
	const { pullRequest, landed } = params
	if (pullRequest.head === landed) return []
	return [
		LOT_APPROVE_LINES.headElsewhere
			.replace('{number}', String(pullRequest.number))
			.replace('{pushed}', pullRequest.head.slice(0, SHOWN_HEAD_LENGTH))
			.replace('{landed}', landed.slice(0, SHOWN_HEAD_LENGTH))
			.replace('{lot}', () => params.place.lot),
	]
}

/** Why the checks do not let the approval through: one failed, one still runs, or the head has none. */
function checksReasons(checks: PullRequestChecks): string[] {
	if (checks.state === 'green') return []
	if (checks.state === 'none') return [LOT_APPROVE_LINES.checksNone]
	const failing =
		checks.failing.length === 0
			? []
			: [LOT_APPROVE_LINES.checksFailing.replace('{names}', () => checks.failing.join(', '))]
	const pending =
		checks.state === 'pending'
			? [LOT_APPROVE_LINES.checksPending.replace('{names}', () => checks.pending.join(', '))]
			: []
	return [...failing, ...pending]
}

/** The blocking findings still open, as one reason. */
function blockingReasons(params: { folder: string }): string[] {
	const ids = openBlockingFindings(params)
	return ids.length === 0 ? [] : [LOT_APPROVE_LINES.blocking.replace('{ids}', () => ids.join(', '))]
}

/** The approval appended and the review record written, the text rendered again and sent, then the queue asked. */
function recordAndQueue(params: {
	host: HostAdapter
	place: LotPlace
	pullRequest: PullRequest
	approval: ApprovalLine
}): CommandResult {
	const { host, place, pullRequest, approval } = params
	try {
		appendLine({
			file: join(place.lotFolder, STORE_FILES.approvals),
			line: Buffer.from(`${JSON.stringify(approval)}\n`, 'utf8'),
			limit: EVENT_LINE_LIMIT,
		})
	} catch (error) {
		return lineOf({ exitCode: 1, line: `${LOT_APPROVE_LINES.prefix}${(error as Error).message}` })
	}
	const warning = refreshReviewRecord({ folder: place.lotFolder })
	const values = {
		lot: place.lot,
		by: approval.by,
		head: approval.head.slice(0, SHOWN_HEAD_LENGTH),
		number: String(pullRequest.number),
	}
	const prepared = preparePullRequest({ ...place, templateRefs: ['HEAD'] })
	const sent =
		'refusal' in prepared
			? prepared
			: sendRenderedText({ host, worktree: place.worktree, prepared, pullRequest })
	const queued =
		'refusal' in sent
			? sent
			: host.queuePullRequest({
					root: place.worktree,
					number: pullRequest.number,
					draft: pullRequest.draft,
				})
	const line =
		queued === undefined
			? fillMessage({ template: LOT_APPROVE_LINES.approved, values })
			: fillMessage({
					template: LOT_APPROVE_LINES.notQueued,
					values: { ...values, refusal: queued.refusal },
				})
	return resultOf({
		exitCode: queued === undefined ? 0 : 1,
		lines: warning === undefined ? [line] : [line, warning],
	})
}

function lineOf(params: { exitCode: number; line: string }): CommandResult {
	return resultOf({ exitCode: params.exitCode, lines: [params.line] })
}
