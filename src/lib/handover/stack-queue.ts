/**
 * How `lot approve` queues a lot (R1-16): its pull request alone, or a native stack up to it. A lot started on another
 * (its stack.json) whose pull request still merges into the parent's branch queues as a stack only on a host with
 * stacks and only once the parent's pull request is queued, so nothing a person has not approved joins the queue; a
 * parent merged, not queued, or a host without stacks is refused. A pull request retargeted to the base queues alone.
 * The parent's pull request is read by its branch (the host's newest of it), so a parent that never recorded a
 * landing still answers.
 */
import { dirname, join } from 'node:path'

import { fillMessage } from '../knowledge/standard/fill-message.ts'
import { readIdentity } from '../store/identity.ts'
import { readStack } from '../store/stack.ts'
import { STACK_QUEUE_LINES } from './stack-queue.constants.ts'

import type { HostAdapter, PullRequest } from '../host/host.types.ts'
import type { StackQueueRoute } from './stack-queue.types.ts'

/**
 * The queue route of the lot in `lotFolder` whose pull request is `pullRequest`; the refusal when it cannot queue now.
 * The host is asked only for a stacked lot whose pull request merges into its parent's branch.
 *
 * @intent queue a stacked lot only behind a queued parent
 * @internal
 */
export function stackQueueOf(params: {
	lot: string
	lotFolder: string
	worktree: string
	host: HostAdapter
	pullRequest: PullRequest
}): StackQueueRoute | { refusal: string } {
	const { lot, host, pullRequest } = params
	const record = readStack({ lotFolder: params.lotFolder })
	if (record === undefined) return { route: 'single' }
	if ('damage' in record)
		return refusalOf({
			template: STACK_QUEUE_LINES.damaged,
			values: { lot, damage: record.damage },
		})
	const { parent } = record
	const parentFolder = join(dirname(params.lotFolder), parent)
	const identity = readIdentity({ lotFolder: parentFolder })
	if (identity === undefined)
		return refusalOf({ template: STACK_QUEUE_LINES.noParent, values: { lot, parent } })
	if (pullRequest.base === undefined)
		return refusalOf({
			template: STACK_QUEUE_LINES.noBase,
			values: { lot, parent, number: String(pullRequest.number) },
		})
	// retargeted to the base once the parent merged: it queues alone
	if (pullRequest.base !== identity.branch) return { route: 'single' }
	const parentPull = host.readPullRequest({ root: params.worktree, ref: identity.branch })
	if (parentPull !== undefined && 'refusal' in parentPull) return parentPull
	if (parentPull === undefined || parentPull.state === 'closed')
		return refusalOf({
			template: STACK_QUEUE_LINES.noParentPull,
			values: { lot, parent, branch: identity.branch },
		})
	const values = { lot, parent, number: String(parentPull.number) }
	if (parentPull.state === 'merged')
		return refusalOf({ template: STACK_QUEUE_LINES.parentMerged, values })
	if (!host.probeStacks({ root: params.worktree }).stacks)
		return refusalOf({ template: STACK_QUEUE_LINES.waits, values })
	// auto-merge on, else the merge queue asked (a parent queued by a stack merge has no auto-merge)
	const parentQueued = parentPull.queued
		? { queued: true }
		: host.readQueued({ root: params.worktree, number: parentPull.number })
	if ('refusal' in parentQueued) return parentQueued
	if (!parentQueued.queued)
		return refusalOf({ template: STACK_QUEUE_LINES.parentNotQueued, values })
	return { route: 'stack' }
}

/** `template` filled with `values`, as a refusal. */
function refusalOf(params: { template: string; values: Record<string, string> }): {
	refusal: string
} {
	return { refusal: fillMessage(params) }
}
