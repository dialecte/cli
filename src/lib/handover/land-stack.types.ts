import type { PullRequest } from '../host/host.types.ts'
import type { StackRoute } from '../store/stack.types.ts'

/**
 * How a stacked lot lands this time: the branch its pull request merges into, the ref its text is rendered against,
 * the route, whether it queues as a stack, the parent's pull request, and the lines the stack step printed.
 */
export type StackLanding = {
	pullBase: string
	textBase: string
	/** native: the host has stacks here (linked, or to link); branch: based on the parent's branch only. */
	route: StackRoute
	/** Whether the host took the link already (`route: native` in stack.json). */
	linked: boolean
	parentMerged: boolean
	parentPull: PullRequest
	/** The head origin's branch holds after the host's own rewrite: the lease of the next push. */
	lease?: string
	lines: string[]
}

/** A stack step's refusal: its line and its exit (2 for a conflict, 1 otherwise). */
export type StackRefusal = { refusal: string; exitCode: number }
