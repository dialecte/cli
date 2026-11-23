/** A line of a lot folder's `approvals.jsonl`: who approved which head of which change request, when and why. */
export type ApprovalLine = {
	schema: number
	at: string
	by: string
	reason?: string
	number: number
	head: string
}
