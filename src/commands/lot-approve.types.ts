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
