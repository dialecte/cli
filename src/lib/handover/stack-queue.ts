/**
 * How `lot approve` queues a lot (R1-16): its change request alone, or a native stack up to it. A lot started on another
 * (its stack.json) whose change request still merges into the parent's branch queues as a stack only on a host with
 * stacks and only once the parent's change request is queued, so nothing a person has not approved joins the queue; a
 * parent merged, not queued, or a host without stacks is refused. A change request retargeted to the base queues alone.
 * The parent's change request is read by its branch (the host's newest of it), so a parent that never recorded a
 * landing still answers.
 */
import { dirname, join } from 'node:path'

import { hostNounsOf } from '../host/select-host.ts'
import { fillMessage } from '../knowledge/standard/fill-message.ts'
import { readIdentity } from '../store/identity.ts'
import { readStack } from '../store/stack.ts'
import { STACK_QUEUE_LINES } from './stack-queue.constants.ts'

import type { HostAdapter, ChangeRequest } from '../host/host.types.ts'
import type { LotIdentity } from '../store/store.types.ts'
import type { StackRoute } from './stack-queue.types.ts'

/**
 * The route of the lot in `lotFolder` whose change request is `changeRequest`, read offline from its stack record: alone
 * when it has none or merges into another branch than its parent's (retargeted once the parent merged); stacked on its
 * parent when it merges into the parent's branch; the refusal when the record is damaged, the parent's records do not
 * read, or the host does not say what the change request merges into.
 *
 * @intent decide offline whether a lot queues alone or on its parent
 * @internal
 */
export function stackRouteOf(params: {
	lot: string
	lotFolder: string
	changeRequest: ChangeRequest
}): StackRoute {
	const { lot, changeRequest } = params
	const record = readStack({ lotFolder: params.lotFolder })
	if (record === undefined) return { route: 'single' }
	if ('damage' in record)
		return refusalOf({
			template: STACK_QUEUE_LINES.damaged,
			values: { lot, damage: record.damage },
		})
	const { parent } = record
	const identity = readIdentity({ lotFolder: join(dirname(params.lotFolder), parent) })
	if (identity === undefined)
		return refusalOf({ template: STACK_QUEUE_LINES.noParent, values: { lot, parent } })
	if (changeRequest.base === undefined)
		return refusalOf({
			template: STACK_QUEUE_LINES.noBase,
			values: { lot, parent, number: String(changeRequest.number) },
		})
	if (changeRequest.base !== identity.branch) return { route: 'single' }
	return { route: 'stacked', parent, identity }
}

/**
 * Whether a stacked lot (`stacked`, from `stackRouteOf`) may queue as a native stack now: undefined when it may; the
 * refusal when its parent's change request is missing, merged or not queued, or the host has no stacks. Only the host
 * is asked here, about the parent.
 *
 * @intent queue a stacked lot only behind a queued parent
 * @internal
 */
export function stackQueueOf(params: {
	lot: string
	worktree: string
	host: HostAdapter
	stacked: { parent: string; identity: LotIdentity }
}): { refusal: string } | undefined {
	const { lot, host } = params
	const { parent, identity } = params.stacked
	const parentChangeRequest = host.readChangeRequest({
		root: params.worktree,
		ref: identity.branch,
	})
	if (parentChangeRequest !== undefined && 'refusal' in parentChangeRequest)
		return parentChangeRequest
	if (parentChangeRequest === undefined || parentChangeRequest.state === 'closed')
		return refusalOf({
			template: STACK_QUEUE_LINES.noParentChangeRequest,
			values: {
				...hostNounsOf({ root: params.worktree }),
				lot,
				parent,
				branch: identity.branch,
			},
		})
	const values = { lot, parent, number: String(parentChangeRequest.number) }
	if (parentChangeRequest.state === 'merged')
		return refusalOf({ template: STACK_QUEUE_LINES.parentMerged, values })
	if (!host.probeStacks({ root: params.worktree }).stacks)
		return refusalOf({ template: STACK_QUEUE_LINES.waits, values })
	// auto-merge on, else the queue asked (a parent queued by a stack merge has no auto-merge)
	const parentQueued = parentChangeRequest.queued
		? { queued: true }
		: host.readQueued({ root: params.worktree, number: parentChangeRequest.number })
	if ('refusal' in parentQueued) return parentQueued
	if (!parentQueued.queued)
		return refusalOf({ template: STACK_QUEUE_LINES.parentNotQueued, values })
	return undefined
}

/** `template` filled with `values`, as a refusal. */
function refusalOf(params: { template: string; values: Record<string, string> }): {
	refusal: string
} {
	return { refusal: fillMessage(params) }
}
