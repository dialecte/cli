/**
 * How `lot approve` queues a lot (R1-16): one pull request, or a native stack up to it. A lot started on another whose
 * pull request still merges into its parent's branch queues as a stack only on a host with stacks and only once the
 * parent's pull request is queued (nothing unapproved joins the queue); otherwise refused.
 */
import { rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { parentChangeRequest, recordingHost, stackedRepository } from '../../../test/land-lot.ts'
import { SCRATCH_GIT_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { readIdentity } from '../store/identity.ts'
import { stackQueueOf, stackRouteOf } from './stack-queue.ts'

import { describe, expect, it } from 'vitest'

import type { StackedRepository } from '../../../test/land-lot.types.ts'
import type { ChangeRequest } from '../host/host.types.ts'

/** The child's pull request #7, a draft merging into `base`. */
function childChangeRequest(base: string | undefined): ChangeRequest {
	return {
		number: 7,
		url: 'https://host.test/pull/7',
		title: 'feat(y): y answers two',
		body: '',
		state: 'open',
		draft: true,
		queued: false,
		head: '',
		...(base !== undefined && { base }),
	}
}

/** The stacked route of the child of `stack`: its parent and the parent's identity, read from the fixture's records. */
function stackedOf(params: { stack: StackedRepository }) {
	const identity = readIdentity({ lotFolder: params.stack.parent.lotFolder })
	if (identity === undefined) throw new Error('the fixture parent has no identity')
	return { parent: '0001-repo-x', identity }
}

describe('stackRouteOf', { timeout: SCRATCH_GIT_CASE_TIMEOUT }, () => {
	it('a lot not stacked → its change request alone', () => {
		const stack = stackedRepository()

		expect(
			stackRouteOf({
				lot: '0001-repo-x',
				lotFolder: stack.parent.lotFolder,
				changeRequest: childChangeRequest('main'),
			}),
		).toEqual({ route: 'single' })
	})

	it('a stacked lot retargeted to the base (its parent merged) → its change request alone', () => {
		const stack = stackedRepository()

		expect(
			stackRouteOf({
				lot: '0002-repo-y',
				lotFolder: stack.child.lotFolder,
				changeRequest: childChangeRequest('main'),
			}),
		).toEqual({ route: 'single' })
	})

	it("a stacked lot merging into its parent's branch → the parent and its identity", () => {
		const stack = stackedRepository()

		expect(
			stackRouteOf({
				lot: '0002-repo-y',
				lotFolder: stack.child.lotFolder,
				changeRequest: childChangeRequest('feat/x'),
			}),
		).toEqual({
			route: 'stacked',
			parent: '0001-repo-x',
			identity: expect.objectContaining({ branch: 'feat/x' }),
		})
	})

	it('a stacked lot whose change request does not say what it merges into → refused', () => {
		const stack = stackedRepository()

		expect(
			stackRouteOf({
				lot: '0002-repo-y',
				lotFolder: stack.child.lotFolder,
				changeRequest: childChangeRequest(undefined),
			}),
		).toEqual({
			refusal: '0002-repo-y stacks on 0001-repo-x and the host does not say what #7 merges into',
		})
	})

	it('a torn stack record → refused naming its damage, never the single route', () => {
		const stack = stackedRepository()
		writeFileSync(join(stack.child.lotFolder, 'stack.json'), '{"schema":1,"parent":')

		expect(
			stackRouteOf({
				lot: '0002-repo-y',
				lotFolder: stack.child.lotFolder,
				changeRequest: childChangeRequest('feat/x'),
			}),
		).toEqual({ refusal: expect.stringMatching(/^0002-repo-y is damaged: its /) })
	})

	it("a parent whose identity does not read → refused naming the parent's records", () => {
		const stack = stackedRepository()
		rmSync(join(stack.parent.lotFolder, 'identity.json'))

		expect(
			stackRouteOf({
				lot: '0002-repo-y',
				lotFolder: stack.child.lotFolder,
				changeRequest: childChangeRequest('feat/x'),
			}),
		).toEqual({
			refusal:
				'0002-repo-y stacks on 0001-repo-x, whose records do not read: dialecte lot status 0001-repo-x says how',
		})
	})
})

describe('stackQueueOf', { timeout: SCRATCH_GIT_CASE_TIMEOUT }, () => {
	it.each([
		{
			label: 'host with stacks, the parent queued → the stack queued up to it',
			stacks: true as const,
			parent: { ...parentChangeRequest(), queued: true },
			route: undefined,
		},
		{
			label: 'host with stacks, the parent not queued → refused naming the parent',
			stacks: true as const,
			parent: parentChangeRequest(),
			route: {
				refusal:
					'0002-repo-y stacks on #5 (0001-repo-x), not queued yet: approve 0001-repo-x first, the stack queues with it',
			},
		},
		{
			label: 'host without stacks, the parent open → refused: waits for the parent to merge',
			stacks: undefined,
			parent: { ...parentChangeRequest(), queued: true },
			route: {
				refusal:
					'0002-repo-y waits for #5 (0001-repo-x) to merge: without native stacks a stacked lot queues after its parent; then lot land 0002-repo-y again',
			},
		},
		{
			label:
				'the parent merged, the pull request still on its branch → refused: land it again first',
			stacks: true as const,
			parent: parentChangeRequest({ state: 'merged' }),
			route: {
				refusal:
					'0002-repo-y stacks on #5 (0001-repo-x), merged: lot land 0002-repo-y again moves it onto the base, then approve it',
			},
		},
	])('$label', ({ stacks, parent, route }) => {
		const stack = stackedRepository()
		const { host } = recordingHost({ ...(stacks && { stacks }), parent, parentBranch: 'feat/x' })

		const answered = stackQueueOf({
			lot: '0002-repo-y',
			worktree: stack.child.worktree,
			host,
			stacked: stackedOf({ stack }),
		})

		expect(answered).toEqual(route)
	})

	it('host with stacks, the parent in the merge queue without auto-merge → the stack queued up to it', () => {
		const stack = stackedRepository()
		const { host } = recordingHost({
			stacks: true,
			parent: parentChangeRequest(),
			parentBranch: 'feat/x',
			mergeQueue: [5],
		})

		const route = stackQueueOf({
			lot: '0002-repo-y',
			worktree: stack.child.worktree,
			host,
			stacked: stackedOf({ stack }),
		})

		expect(route).toBeUndefined()
	})

	it("the parent's pull request read by its branch, the parent never recorded a landing → the stack queued up to it", () => {
		const stack = stackedRepository({ parentLanded: false })
		const { host } = recordingHost({
			stacks: true,
			parent: { ...parentChangeRequest(), queued: true },
			parentBranch: 'feat/x',
		})

		const route = stackQueueOf({
			lot: '0002-repo-y',
			worktree: stack.child.worktree,
			host,
			stacked: stackedOf({ stack }),
		})

		expect(route).toBeUndefined()
	})

	it("the parent's branch has no pull request on the host → refused naming the parent", () => {
		const stack = stackedRepository({ parentLanded: false })
		const { host } = recordingHost({ stacks: true })

		const route = stackQueueOf({
			lot: '0002-repo-y',
			worktree: stack.child.worktree,
			host,
			stacked: stackedOf({ stack }),
		})

		expect(route).toEqual({
			refusal:
				'0002-repo-y stacks on 0001-repo-x, whose branch feat/x has no open change request: lot land 0001-repo-x first',
		})
	})
})
