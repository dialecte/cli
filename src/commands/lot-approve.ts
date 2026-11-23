/**
 * `dialecte lot approve <id> --by <who> [--reason <text>]`: a person's approval of the lot's change request (33CI CI7).
 * Refused, nothing recorded and nothing queued, with every reason at once, while `approvalReadinessOf` names one (the
 * reader `lot review`'s approve line prints too). Then the approval is appended to the lot folder's `approvals.jsonl`
 * (a person's verdict row of `review.jsonl`), the change request's text rendered again from the records and the change
 * request queued (made ready when a draft): the only verb that queues, `lot land` never does. A lot started on another
 * whose change request still merges into its parent's branch queues as a native stack. `--by orchestrator` approves the
 * cli's own lots only.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { prepareChangeRequest } from '../lib/change-request/change-request-sources.ts'
import { renderLotUsage } from '../lib/command-map/render-help.ts'
import { resultOf } from '../lib/command-result.ts'
import { EVENT_LINE_LIMIT } from '../lib/events/events.constants.ts'
import { appendLine } from '../lib/events/write-event.ts'
import { SHORT_SHA_LENGTH } from '../lib/gate-records/gate-records.constants.ts'
import { readLanding } from '../lib/handover/land-record.ts'
import { createHost, hostNounsOf } from '../lib/host/select-host.ts'
import { fillMessage } from '../lib/knowledge/standard/fill-message.ts'
import { readPackageJson } from '../lib/package-json.ts'
import { forbiddenWordRefusal, isOneLine } from '../lib/review-rounds/option-checks.ts'
import { refreshReviewRecord } from '../lib/review-rounds/review-record.ts'
import { readArguments } from '../lib/review-rounds/round-arguments.ts'
import { PUBLIC_TEXT_REFUSAL } from '../lib/store/public-text.constants.ts'
import { folderPlanEntryIds, publicTextLabel } from '../lib/store/public-text.ts'
import { approvalSignerRefusal, recordedByOf } from '../lib/store/signer-rules.ts'
import { STORE_FILES } from '../lib/store/store.constants.ts'
import { approvalReadinessOf } from './lot-approve-readiness.ts'
import {
	APPROVABLE_STATES,
	APPROVAL_LINE_SCHEMA,
	APPROVE_OPTIONS,
	LOT_APPROVE_LINES,
	QUEUE_VIA,
} from './lot-approve.constants.ts'
import { resolveLotPlace, sendRenderedText } from './lot-describe.ts'

import type { CommandResult } from '../lib/command-result.types.ts'
import type { StackRoute } from '../lib/handover/stack-queue.types.ts'
import type { HostAdapter, HostRefusal, ChangeRequest } from '../lib/host/host.types.ts'
import type { ApprovalLine, QueueRead } from './lot-approve.types.ts'
import type { LotPlace } from './lot-describe.types.ts'

export function runLotApprove(params: {
	cwd: string
	argv: string[]
	/** Where the change request lives; default: the repository's host. */
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
			line: noLandingLine({ place }),
		})
	const host = params.host ?? createHost()
	const changeRequest = openChangeRequestOf({ host, place, number: landing.number })
	if ('exitCode' in changeRequest) return changeRequest
	const readiness = approvalReadinessOf({
		host,
		place,
		changeRequest,
		checks: host.readChecks({ root: place.worktree, number: changeRequest.number }),
		landed: landing.head,
	})
	if ('reasons' in readiness) return refusedLine({ place, reasons: readiness.reasons })
	return recordAndQueue({
		host,
		place,
		changeRequest,
		route: readiness.route,
		queue: readiness.queue,
		approval: {
			schema: APPROVAL_LINE_SCHEMA,
			at: (params.now ?? new Date()).toISOString(),
			// the orchestrator in any casing is recorded as the one word the body names
			by: recordedByOf({ by }),
			...(reason !== undefined && { reason }),
			number: changeRequest.number,
			head: landing.head,
		},
	})
}

/** The refused line of `lot approve`: the lot and every reason, nothing recorded. */
function refusedLine(params: { place: LotPlace; reasons: readonly string[] }): CommandResult {
	return lineOf({
		exitCode: 1,
		line: fillMessage({
			template: LOT_APPROVE_LINES.refused,
			values: { lot: params.place.lot, reasons: params.reasons.join('; ') },
		}),
	})
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
	const signerRefusal = approvalSignerRefusal({ by, packageName })
	if (signerRefusal !== undefined) return signerRefusal
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

/** The lot's change request `number`; the line of one the host refuses or cannot find. */
function openChangeRequestOf(params: {
	host: HostAdapter
	place: LotPlace
	number: number
}): ChangeRequest | CommandResult {
	const { place, number } = params
	const read = params.host.readChangeRequest({ root: place.worktree, ref: String(number) })
	if (read !== undefined && 'refusal' in read)
		return lineOf({ exitCode: 1, line: `${LOT_APPROVE_LINES.prefix}${read.refusal}` })
	if (read === undefined)
		return lineOf({
			exitCode: 1,
			line: fillMessage({
				template: LOT_APPROVE_LINES.noChangeRequest,
				values: {
					...hostNounsOf({ root: place.worktree }),
					number: String(number),
					lot: place.lot,
				},
			}),
		})
	return read
}

/**
 * The approval appended and the review record written, the text rendered again and sent, and the queue asked: the
 * change request alone (named by the queue kind read before), or the native stack up to it (its parent checked by
 * `approvalReadinessOf` before).
 */
function recordAndQueue(params: {
	host: HostAdapter
	place: LotPlace
	changeRequest: ChangeRequest
	/** The route `approvalReadinessOf` answered: single or stacked (a refusal is refused before). */
	route: Exclude<StackRoute, { refusal: string }>
	/** The queue the host offers, read once (`approvalReadinessOf`); undefined for a stacked lot. */
	queue: QueueRead
	approval: ApprovalLine
}): CommandResult {
	const { host, place, changeRequest, approval, route } = params
	const stacked = route.route === 'stacked'
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
		...hostNounsOf({ root: place.worktree }),
		lot: place.lot,
		by: approval.by,
		head: approval.head.slice(0, SHORT_SHA_LENGTH),
		number: String(changeRequest.number),
	}
	const prepared = prepareChangeRequest({ ...place, templateRefs: ['HEAD'] })
	const sent =
		'refusal' in prepared
			? prepared
			: sendRenderedText({ host, worktree: place.worktree, prepared, changeRequest })
	const queueParams = {
		root: place.worktree,
		number: changeRequest.number,
		draft: changeRequest.draft,
	}
	const queued =
		'refusal' in sent
			? sent
			: stacked
				? host.queueStack(queueParams)
				: host.queueChangeRequest(queueParams)
	const line = queuedLineOf({ queued, already, values, via: viaOf({ queue: params.queue }) })
	return resultOf({
		exitCode: queued === undefined ? 0 : 1,
		lines: warning === undefined ? [line] : [line, warning],
	})
}

/** The approval's line: queued (the queue named by `via`), or not queued with the host's refusal. */
function queuedLineOf(params: {
	queued: HostRefusal | undefined
	already: boolean
	values: Record<string, string>
	via: string
}): string {
	const { queued, values } = params
	if (queued !== undefined)
		return fillMessage({
			template: LOT_APPROVE_LINES.notQueued,
			values: { ...values, refusal: queued.refusal },
		})
	return fillMessage({
		template: params.already ? LOT_APPROVE_LINES.alreadyApproved : LOT_APPROVE_LINES.approved,
		values: { ...values, via: params.via },
	})
}

/**
 * The queue the queued line names, from the one read (`approvalReadinessOf`): ` (<noun>)`; nothing when the read was refused or
 * the kind was not read (a stacked lot), so no noun is guessed. A host offering none was refused before.
 */
function viaOf(params: { queue: QueueRead }): string {
	const { queue } = params
	if (queue === undefined || 'refusal' in queue) return ''
	return fillMessage({ template: QUEUE_VIA, values: { noun: queue.noun } })
}

/** Whether the folder holds this approver's approval of this head of this change request already. */
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

/** Why a lot with no landing cannot be approved: lot land opens its change request first. */
function noLandingLine(params: { place: LotPlace }): string {
	return fillMessage({
		template: LOT_APPROVE_LINES.noLanding,
		values: { ...hostNounsOf({ root: params.place.worktree }), lot: params.place.lot },
	})
}
