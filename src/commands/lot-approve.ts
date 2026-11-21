/**
 * `dialecte lot approve <id> --by <who> [--reason <text>]`: a person's approval of the lot's pull request (33CI CI7).
 * Refused, nothing recorded and nothing queued, unless the pull request is open at the lot's landed head, its checks
 * are green there and no blocking or should-fix finding is open. Then the approval is appended to the lot folder's `approvals.jsonl`
 * (a person's verdict row of `review.jsonl`), the pull request's text rendered again from the records and the pull
 * request queued (made ready when a draft): the only verb that queues, `lot land` never does. A lot started on another
 * whose pull request still merges into its parent's branch queues as a native stack, only behind a queued parent
 * (`stackQueueOf`). `--by orchestrator` approves the cli's own lots only.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { renderLotUsage } from '../lib/command-map/render-help.ts'
import { resultOf } from '../lib/command-result.ts'
import { designGateOf } from '../lib/design/design-gate.ts'
import { designStateWithReasons } from '../lib/design/design-line.ts'
import { DESIGN_APPROVE_REASON } from '../lib/design/design.constants.ts'
import { EVENT_LINE_LIMIT } from '../lib/events/events.constants.ts'
import { appendLine } from '../lib/events/write-event.ts'
import { SHORT_SHA_LENGTH } from '../lib/gate-records/gate-records.constants.ts'
import { readGit } from '../lib/git.ts'
import { readLanding } from '../lib/handover/land-record.ts'
import { stackQueueOf } from '../lib/handover/stack-queue.ts'
import { createHost } from '../lib/host/select-host.ts'
import { fillMessage } from '../lib/knowledge/standard/fill-message.ts'
import { readPackageJson } from '../lib/package-json.ts'
import { keptPartOf } from '../lib/pr/compose-pull-request.ts'
import { preparePullRequest } from '../lib/pr/pull-request-sources.ts'
import { forbiddenWordRefusal, isOneLine } from '../lib/review-rounds/option-checks.ts'
import { openBlockingFindings, refreshReviewRecord } from '../lib/review-rounds/review-record.ts'
import { readArguments } from '../lib/review-rounds/round-arguments.ts'
import { PUBLIC_TEXT_REFUSAL } from '../lib/store/public-text.constants.ts'
import { folderPlanEntryIds, publicTextLabel } from '../lib/store/public-text.ts'
import { ORCHESTRATOR_APPROVER } from '../lib/store/signer-rules.constants.ts'
import { recordedByOf } from '../lib/store/signer-rules.ts'
import { STORE_FILES } from '../lib/store/store.constants.ts'
import { resolveTddBase } from '../lib/tdd/tdd-base.ts'
import {
	APPROVABLE_STATES,
	APPROVAL_LINE_SCHEMA,
	APPROVE_OPTIONS,
	CLI_PACKAGE_NAME,
	LOT_APPROVE_LINES,
} from './lot-approve.constants.ts'
import { resolveLotPlace, sendRenderedText } from './lot-pr.ts'

import type { CommandResult } from '../lib/command-result.types.ts'
import type { HostAdapter, PullRequest, PullRequestChecks } from '../lib/host/host.types.ts'
import type { ApprovalLine } from './lot-approve.types.ts'
import type { LotPlace } from './lot-pr.types.ts'

export function runLotApprove(params: {
	cwd: string
	argv: string[]
	/** Where the pull request lives; default: the repository's host. */
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
	// a lot no longer at work is refused before the host is asked (approvalRefusals names it too, for lot review)
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
	const host = params.host ?? createHost()
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
	// the text must render over the live body before the approval is recorded: a refusal leaves nothing behind
	const early = preparePullRequest({ ...place, templateRefs: ['HEAD'] })
	const kept =
		'refusal' in early ? early : keptPartOf({ template: early.template, body: pullRequest.body })
	if ('refusal' in kept)
		return lineOf({ exitCode: 1, line: `${LOT_APPROVE_LINES.prefix}${kept.refusal}` })
	return recordAndQueue({
		host,
		place,
		pullRequest,
		approval: {
			schema: APPROVAL_LINE_SCHEMA,
			at: (params.now ?? new Date()).toISOString(),
			// the orchestrator in any casing is recorded as the one word the body names
			by: recordedByOf({ by }),
			...(reason !== undefined && { reason }),
			number: pullRequest.number,
			head: landing.head,
		},
	})
}

/**
 * Why `lot approve` would refuse the lot now: the lot is no longer at work, its pull request is not open or not at the
 * head the lot landed, its checks are not green on that head, or a finding other than a nit is open; none when it
 * would approve.
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
	const { place, pullRequest } = params
	return [
		...(APPROVABLE_STATES.includes(place.state)
			? []
			: [
					fillMessage({
						template: LOT_APPROVE_LINES.lotNotApprovable,
						values: { state: place.state },
					}),
				]),
		...(pullRequest.state === 'open'
			? []
			: [
					fillMessage({
						template: LOT_APPROVE_LINES.notOpen,
						values: { number: String(pullRequest.number), state: pullRequest.state },
					}),
				]),
		...headReasons(params),
		...worktreeReasons(params),
		...checksReasons(params),
		...blockingReasons({ folder: place.lotFolder }),
		...designReasons({ place }),
	]
}

/**
 * The lot's design when it does not let the lot go on, as one reason (DESIGN-GATE section 3): read at the lot base its
 * worktree resolves; none for a lot whose design is approved, waived or not needed.
 */
function designReasons(params: { place: LotPlace }): string[] {
	const { place } = params
	const base = resolveTddBase({
		root: place.worktree,
		packageJson: readPackageJson(place.worktree),
	})
	if ('failure' in base) return [base.failure]
	const gate = designGateOf({
		lotFolder: place.lotFolder,
		root: place.worktree,
		base: base.commit,
		verb: 'approve',
	})
	return gate.refusal === undefined
		? []
		: [
				fillMessage({
					template: DESIGN_APPROVE_REASON,
					values: { state: designStateWithReasons(gate.standing) },
				}),
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
	if (by.toLowerCase() === ORCHESTRATOR_APPROVER && packageName !== CLI_PACKAGE_NAME)
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

/** The lot's pull request `number`; the line of one the host refuses or cannot find. */
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
			.replace('{pushed}', pullRequest.head.slice(0, SHORT_SHA_LENGTH))
			.replace('{landed}', landed.slice(0, SHORT_SHA_LENGTH))
			.replace('{lot}', () => params.place.lot),
	]
}

/** Why the worktree's head is not the one approved: it holds commits the lot has not landed (pushed) yet. */
function worktreeReasons(params: { place: LotPlace; landed: string }): string[] {
	const { place, landed } = params
	const head = readGit({ root: place.worktree, args: ['rev-parse', 'HEAD'] }).trim()
	if (head === landed) return []
	return [
		fillMessage({
			template: LOT_APPROVE_LINES.worktreeElsewhere,
			values: {
				head: head.slice(0, SHORT_SHA_LENGTH),
				landed: landed.slice(0, SHORT_SHA_LENGTH),
				lot: place.lot,
			},
		}),
	]
}

/**
 * Why the checks do not let the approval through: they ran on another head than the landed one (a push between the
 * two reads), one failed, one still runs, or the head has none.
 */
function checksReasons(params: {
	pullRequest: PullRequest
	checks: PullRequestChecks
	landed: string
}): string[] {
	const { checks, landed } = params
	// a pull request at another head is named once, by headReasons
	if (params.pullRequest.head === landed && checks.head !== landed)
		return [
			fillMessage({
				template: LOT_APPROVE_LINES.checksElsewhere,
				values: {
					checked: checks.head.slice(0, SHORT_SHA_LENGTH),
					landed: landed.slice(0, SHORT_SHA_LENGTH),
				},
			}),
		]
	if (checks.state === 'green') return []
	if (checks.state === 'none') return [LOT_APPROVE_LINES.checksNone]
	const failing =
		checks.failing.length === 0
			? []
			: [
					fillMessage({
						template: LOT_APPROVE_LINES.checksFailing,
						values: { names: checks.failing.join(', ') },
					}),
				]
	const pending =
		checks.state === 'pending'
			? [
					fillMessage({
						template: LOT_APPROVE_LINES.checksPending,
						values: { names: checks.pending.join(', ') },
					}),
				]
			: []
	return [...failing, ...pending]
}

/** The findings other than nits still open, each with its severity, as one reason. */
function blockingReasons(params: { folder: string }): string[] {
	const rows = openBlockingFindings(params)
	if (rows.length === 0) return []
	return [
		fillMessage({
			template: LOT_APPROVE_LINES.blocking,
			values: { rows: rows.map((row) => `${row.id} ${row.severity}`).join(', ') },
		}),
	]
}

/**
 * How the lot queues, then the approval appended and the review record written, the text rendered again and sent, and
 * the queue asked: the pull request alone, or the native stack up to it. A lot on an open parent queues only behind a
 * queued parent: refused before anything is recorded.
 */
function recordAndQueue(params: {
	host: HostAdapter
	place: LotPlace
	pullRequest: PullRequest
	approval: ApprovalLine
}): CommandResult {
	const { host, place, pullRequest, approval } = params
	const route = stackQueueOf({ ...place, host, pullRequest })
	if ('refusal' in route)
		return lineOf({
			exitCode: 1,
			line: LOT_APPROVE_LINES.refused
				.replace('{lot}', () => place.lot)
				.replace('{reasons}', () => route.refusal),
		})
	const already = isApproved({ folder: place.lotFolder, approval })
	try {
		if (!already)
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
		head: approval.head.slice(0, SHORT_SHA_LENGTH),
		number: String(pullRequest.number),
	}
	const prepared = preparePullRequest({ ...place, templateRefs: ['HEAD'] })
	const sent =
		'refusal' in prepared
			? prepared
			: sendRenderedText({ host, worktree: place.worktree, prepared, pullRequest })
	const queueParams = {
		root: place.worktree,
		number: pullRequest.number,
		draft: pullRequest.draft,
	}
	const queued =
		'refusal' in sent
			? sent
			: route.route === 'stack'
				? host.queueStack(queueParams)
				: host.queuePullRequest(queueParams)
	const line =
		queued === undefined
			? fillMessage({
					template: already ? LOT_APPROVE_LINES.alreadyApproved : LOT_APPROVE_LINES.approved,
					values,
				})
			: fillMessage({
					template: LOT_APPROVE_LINES.notQueued,
					values: { ...values, refusal: queued.refusal },
				})
	return resultOf({
		exitCode: queued === undefined ? 0 : 1,
		lines: warning === undefined ? [line] : [line, warning],
	})
}

/** Whether the folder holds this approver's approval of this head of this pull request already. */
function isApproved(params: { folder: string; approval: ApprovalLine }): boolean {
	const { approval } = params
	const file = join(params.folder, STORE_FILES.approvals)
	if (!existsSync(file)) return false
	return readFileSync(file, 'utf8')
		.split('\n')
		.some(function sameApproval(line) {
			try {
				const parsed = JSON.parse(line) as Partial<ApprovalLine>
				return (
					parsed.by === approval.by &&
					parsed.head === approval.head &&
					parsed.number === approval.number
				)
			} catch {
				return false
			}
		})
}

function lineOf(params: { exitCode: number; line: string }): CommandResult {
	return resultOf({ exitCode: params.exitCode, lines: [params.line] })
}
