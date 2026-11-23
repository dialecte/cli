import type { StackRoute } from '../lib/handover/stack-queue.types.ts'
import type { HostRefusal, QueueSupport } from '../lib/host/host.types.ts'

/** A line of a lot folder's `approvals.jsonl`: who approved which head of which change request, when and why. */
export type ApprovalLine = {
	schema: number
	at: string
	by: string
	reason?: string
	number: number
	head: string
}

/** The host's queue kind as `lot approve` read it once: its answer, its refusal, or undefined when not read (a stacked lot). */
export type QueueRead = QueueSupport | HostRefusal | undefined

/**
 * Whether `lot approve` would approve the lot (`approvalReadinessOf`): every reason it would refuse, or the route and the
 * queue kind it goes on with.
 */
export type ApprovalReadiness =
	| { reasons: readonly [string, ...string[]] }
	| { route: Exclude<StackRoute, { refusal: string }>; queue: QueueRead }
