import type { ChangeRequest } from '../host/host.types.ts'

/**
 * How a stacked lot lands this time: the branch its change request merges into, the ref its text is rendered against,
 * the route, whether it queues as a stack, the parent's change request, and the lines the stack step printed.
 */
export type StackLanding = {
	changeRequestBase: string
	textBase: string
	/** native: the host has stacks here (linked, or to link); branch: based on the parent's branch only. */
	route: StackRoute
	/** Whether the host holds the link already (a change request opened on a host with stacks, or rewritten by it). */
	linked: boolean
	parentMerged: boolean
	/** The parent's change request; undefined only for a parent merged without one (its work in the base). */
	parentChangeRequest: ChangeRequest | undefined
	/** The head origin's branch holds after the host's own rewrite: the lease of the next push. */
	lease?: string
	lines: string[]
}

/** How a stacked change request stacks: linked by the host (`native`), or based on the parent's branch (`branch`). */
export type StackRoute = 'native' | 'branch'

/** A stack step's refusal: its line and its exit (2 for a conflict, 1 otherwise). */
export type StackRefusal = { refusal: string; exitCode: number }
