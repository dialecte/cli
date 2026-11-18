/**
 * How `lot approve` queues a lot (R1-16): one pull request, or a native stack up to it. A lot started on another whose
 * pull request still merges into its parent's branch queues as a stack only on a host with stacks and only once the
 * parent's pull request is queued (nothing unapproved joins the queue); otherwise refused.
 */
import { parentPullRequest, recordingHost, stackedRepository } from '../../../test/land-lot.ts'
import { SCRATCH_GIT_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { stackQueueOf } from './stack-queue.ts'

import { describe, expect, it } from 'vitest'

import type { PullRequest } from '../host/host.types.ts'

/** The child's pull request #7, a draft merging into `base`. */
function childPullRequest(base: string | undefined): PullRequest {
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

describe('stackQueueOf', { timeout: SCRATCH_GIT_CASE_TIMEOUT }, () => {
	it('a lot not stacked → its pull request alone, nothing asked of the host', () => {
		const stack = stackedRepository()
		const { host, calls } = recordingHost()

		const route = stackQueueOf({
			lot: '0001-repo-x',
			lotFolder: stack.parent.lotFolder,
			worktree: stack.parent.worktree,
			host,
			pullRequest: childPullRequest('main'),
		})

		expect({ route, calls }).toEqual({ route: { route: 'single' }, calls: [] })
	})

	it('a stacked lot retargeted to the base (its parent merged) → its pull request alone', () => {
		const stack = stackedRepository()
		const { host } = recordingHost({ stacks: true, parent: parentPullRequest() })

		const route = stackQueueOf({
			lot: '0002-repo-y',
			lotFolder: stack.child.lotFolder,
			worktree: stack.child.worktree,
			host,
			pullRequest: childPullRequest('main'),
		})

		expect(route).toEqual({ route: 'single' })
	})

	it.each([
		{
			label: 'host with stacks, the parent queued → the stack queued up to it',
			stacks: true as const,
			parent: { ...parentPullRequest(), queued: true },
			route: { route: 'stack' },
		},
		{
			label: 'host with stacks, the parent not queued → refused naming the parent',
			stacks: true as const,
			parent: parentPullRequest(),
			route: {
				refusal:
					'0002-repo-y stacks on #5 (0001-repo-x), not queued yet: approve 0001-repo-x first, the stack queues with it',
			},
		},
		{
			label: 'host without stacks, the parent open → refused: waits for the parent to merge',
			stacks: undefined,
			parent: { ...parentPullRequest(), queued: true },
			route: {
				refusal:
					'0002-repo-y waits for #5 (0001-repo-x) to merge: without native stacks a stacked lot queues after its parent; then lot land 0002-repo-y again',
			},
		},
		{
			label:
				'the parent merged, the pull request still on its branch → refused: land it again first',
			stacks: true as const,
			parent: parentPullRequest({ state: 'merged' }),
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
			lotFolder: stack.child.lotFolder,
			worktree: stack.child.worktree,
			host,
			pullRequest: childPullRequest('feat/x'),
		})

		expect(answered).toEqual(route)
	})

	it('host with stacks, the parent in the merge queue without auto-merge → the stack queued up to it', () => {
		const stack = stackedRepository()
		const { host } = recordingHost({
			stacks: true,
			parent: parentPullRequest(),
			parentBranch: 'feat/x',
			mergeQueue: [5],
		})

		const route = stackQueueOf({
			lot: '0002-repo-y',
			lotFolder: stack.child.lotFolder,
			worktree: stack.child.worktree,
			host,
			pullRequest: childPullRequest('feat/x'),
		})

		expect(route).toEqual({ route: 'stack' })
	})

	it("the parent's pull request read by its branch, the parent never recorded a landing → the stack queued up to it", () => {
		const stack = stackedRepository({ parentLanded: false })
		const { host } = recordingHost({
			stacks: true,
			parent: { ...parentPullRequest(), queued: true },
			parentBranch: 'feat/x',
		})

		const route = stackQueueOf({
			lot: '0002-repo-y',
			lotFolder: stack.child.lotFolder,
			worktree: stack.child.worktree,
			host,
			pullRequest: childPullRequest('feat/x'),
		})

		expect(route).toEqual({ route: 'stack' })
	})

	it("the parent's branch has no pull request on the host → refused naming the parent", () => {
		const stack = stackedRepository({ parentLanded: false })
		const { host } = recordingHost({ stacks: true })

		const route = stackQueueOf({
			lot: '0002-repo-y',
			lotFolder: stack.child.lotFolder,
			worktree: stack.child.worktree,
			host,
			pullRequest: childPullRequest('feat/x'),
		})

		expect(route).toEqual({
			refusal:
				'0002-repo-y stacks on 0001-repo-x, whose branch feat/x has no open pull request: lot land 0001-repo-x first',
		})
	})

	it('a stacked lot whose pull request does not say what it merges into → refused', () => {
		const stack = stackedRepository()
		const { host } = recordingHost({
			stacks: true,
			parent: parentPullRequest(),
			parentBranch: 'feat/x',
		})

		const route = stackQueueOf({
			lot: '0002-repo-y',
			lotFolder: stack.child.lotFolder,
			worktree: stack.child.worktree,
			host,
			pullRequest: childPullRequest(undefined),
		})

		expect(route).toEqual({
			refusal: '0002-repo-y stacks on 0001-repo-x and the host does not say what #7 merges into',
		})
	})
})
