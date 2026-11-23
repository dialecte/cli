/**
 * What `lot approve` would refuse, read once for both verbs: `lot approve` refuses on it before anything is recorded, and
 * `lot review`'s approve line prints it, so the two give the same reasons. It writes nothing; it reads the lot's records,
 * git, and the host (the queue kind for a lot queued alone, a stacked lot's parent and the host's stacks).
 */
import { prepareChangeRequest } from '../lib/change-request/change-request-sources.ts'
import { keptPartOf } from '../lib/change-request/compose-change-request.ts'
import { designGateOf } from '../lib/design/design-gate.ts'
import { designStateWithReasons } from '../lib/design/design-line.ts'
import { DESIGN_APPROVE_REASON } from '../lib/design/design.constants.ts'
import { SHORT_SHA_LENGTH } from '../lib/gate-records/gate-records.constants.ts'
import { readGit } from '../lib/git.ts'
import { stackQueueOf, stackRouteOf } from '../lib/handover/stack-queue.ts'
import { hostNounsOf } from '../lib/host/select-host.ts'
import { fillMessage } from '../lib/knowledge/standard/fill-message.ts'
import { readPackageJson } from '../lib/package-json.ts'
import { openBlockingFindings } from '../lib/review-rounds/review-record.ts'
import { resolveTddBase } from '../lib/tdd/tdd-base.ts'
import { APPROVABLE_STATES, LOT_APPROVE_LINES } from './lot-approve.constants.ts'

import type { StackRoute } from '../lib/handover/stack-queue.types.ts'
import type {
	ChangeRequest,
	ChangeRequestChecks,
	HostAdapter,
	HostRefusal,
} from '../lib/host/host.types.ts'
import type { ApprovalReadiness, QueueRead } from './lot-approve.types.ts'
import type { LotPlace } from './lot-describe.types.ts'

/**
 * Whether `lot approve` would approve the lot now: every reason it would refuse, or the route and the queue kind it
 * goes on with. A refused checks read is the only reason; else the reasons of `approvalRefusals` (the queue kind read
 * once for a lot queued alone), then the stack route's (`stackRouteOf`, and `stackQueueOf` for a stacked lot), then the
 * text's: it renders over the live body, checked only once the route stands (the render reads the same stack record).
 *
 * @intent tell, once for lot approve and lot review, what stands between a lot and its approval
 * @internal
 */
export function approvalReadinessOf(params: {
	host: HostAdapter
	place: LotPlace
	changeRequest: ChangeRequest
	/** The checks the host answered, or its refusal of the read. */
	checks: ChangeRequestChecks | HostRefusal
	landed: string
}): ApprovalReadiness {
	const { host, place, changeRequest, checks } = params
	if ('refusal' in checks) return { reasons: [checks.refusal] }
	// the route first: the queue kind is read for a lot queued alone only
	const route = stackRouteOf({ lot: place.lot, lotFolder: place.lotFolder, changeRequest })
	const queue = queueReadOf({ host, place, changeRequest, route })
	const refusals = approvalRefusals({ place, changeRequest, checks, landed: params.landed, queue })
	// a route that does not stand leaves the text unchecked: the render reads the same stack record
	if ('refusal' in route) {
		const [first, ...rest] = refusals
		return { reasons: first === undefined ? [route.refusal] : [first, ...rest, route.refusal] }
	}
	return readinessOf({
		reasons: [
			...refusals,
			...stackReasons({ host, place, route }),
			...renderReasons({ place, changeRequest }),
		],
		route,
		queue,
	})
}

/** The reasons of a lot whose route stands, when there is one; else the route and the queue kind it goes on with. */
function readinessOf(params: {
	reasons: readonly string[]
	route: Exclude<StackRoute, { refusal: string }>
	queue: QueueRead
}): ApprovalReadiness {
	const [first, ...rest] = params.reasons
	return first === undefined
		? { route: params.route, queue: params.queue }
		: { reasons: [first, ...rest] }
}

/** Why a stacked lot cannot queue now (`stackQueueOf`): its parent missing, merged or not queued, or no stacks. */
function stackReasons(params: {
	host: HostAdapter
	place: LotPlace
	route: Exclude<StackRoute, { refusal: string }>
}): string[] {
	const { place, route } = params
	if (route.route === 'single') return []
	const refused = stackQueueOf({
		lot: place.lot,
		worktree: place.worktree,
		host: params.host,
		stacked: route,
	})
	return refused === undefined ? [] : [refused.refusal]
}

/** Why the change request's text cannot be sent: the records do not render, or the live body holds text it would drop. */
function renderReasons(params: { place: LotPlace; changeRequest: ChangeRequest }): string[] {
	const prepared = prepareChangeRequest({ ...params.place, templateRefs: ['HEAD'] })
	const kept =
		'refusal' in prepared ? prepared : keptPartOf({ ...prepared, body: params.changeRequest.body })
	return 'refusal' in kept ? [kept.refusal] : []
}

/**
 * Why `lot approve` would refuse the lot now: the lot is no longer at work, its change request is not open or not at the
 * head the lot landed, its checks are not green on that head, or a finding other than a nit is open; none when it
 * would approve.
 *
 * @intent tell what stands between a lot and its approval
 * @internal
 */
export function approvalRefusals(params: {
	place: LotPlace
	changeRequest: ChangeRequest
	checks: ChangeRequestChecks
	landed: string
	/** The queue the host offers the change request (`readQueueKind`); undefined when not read (a stacked lot). */
	queue: QueueRead
}): string[] {
	const { place, changeRequest } = params
	return [
		...(APPROVABLE_STATES.includes(place.state)
			? []
			: [
					fillMessage({
						template: LOT_APPROVE_LINES.lotNotApprovable,
						values: { state: place.state },
					}),
				]),
		...(changeRequest.state === 'open'
			? []
			: [
					fillMessage({
						template: LOT_APPROVE_LINES.notOpen,
						values: {
							...hostNounsOf({ root: place.worktree }),
							number: String(changeRequest.number),
							state: changeRequest.state,
						},
					}),
				]),
		...headReasons(params),
		...worktreeReasons(params),
		...checksReasons(params),
		...blockingReasons({ folder: place.lotFolder }),
		...designReasons({ place }),
		...queueReasons(params),
	]
}

/**
 * The queue the host offers the change request, read once for a lot on the single route (a stacked lot merges through
 * the host's stack tool, never auto-merge, so its kind is not read); undefined for any other route.
 */
function queueReadOf(params: {
	host: HostAdapter
	place: LotPlace
	changeRequest: ChangeRequest
	route: StackRoute
}): QueueRead {
	if (!('route' in params.route) || params.route.route !== 'single') return undefined
	return params.host.readQueueKind({
		root: params.place.worktree,
		number: params.changeRequest.number,
	})
}

/** Why the change request cannot be queued: the host offers no queue for it; none for a refused or unread kind. */
function queueReasons(params: { place: LotPlace; queue: QueueRead }): string[] {
	const { queue } = params
	if (queue === undefined || 'refusal' in queue || queue.kind !== 'none') return []
	return [
		fillMessage({
			template: LOT_APPROVE_LINES.noQueue,
			values: hostNounsOf({ root: params.place.worktree }),
		}),
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

/** Why the change request's head is not the one approved: it is not the head the lot landed. */
function headReasons(params: {
	place: LotPlace
	changeRequest: ChangeRequest
	landed: string
}): string[] {
	const { changeRequest, landed } = params
	if (changeRequest.head === landed) return []
	return [
		fillMessage({
			template: LOT_APPROVE_LINES.headElsewhere,
			values: {
				...hostNounsOf({ root: params.place.worktree }),
				number: String(changeRequest.number),
				pushed: changeRequest.head.slice(0, SHORT_SHA_LENGTH),
				landed: landed.slice(0, SHORT_SHA_LENGTH),
				lot: params.place.lot,
			},
		}),
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
	changeRequest: ChangeRequest
	checks: ChangeRequestChecks
	landed: string
}): string[] {
	const { checks, landed } = params
	// a change request at another head is named once, by headReasons
	if (params.changeRequest.head === landed && checks.head !== landed)
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
