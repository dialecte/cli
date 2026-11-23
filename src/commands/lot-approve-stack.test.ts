/**
 * `lot approve` of a lot started on another (R1-16): its pull request still merging into the parent's branch queues as
 * a native stack once the parent's pull request is queued; otherwise refused, nothing recorded, nothing queued.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { parentChangeRequest, recordingHost } from '../../test/land-lot.ts'
import { LOT_NAME } from '../../test/lot-describe.constants.ts'
import {
	REVIEW_CHANGE_REQUEST_NUMBER,
	REVIEWER,
	STACK_PARENT_LOT as PARENT,
} from '../../test/lot-review.constants.ts'
import { stackedLandedLot } from '../../test/lot-review.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { STORE_FILES } from '../lib/store/store.constants.ts'
import { runLotApprove } from './lot-approve.ts'

import { describe, expect, it } from 'vitest'

import type { ChangeRequest, QueueSupport } from '../lib/host/host.types.ts'

/** Approve the lot as a person, its pull request merging into `feat/p`, the parent `parent`, on a host with stacks. */
function approveOnParent(params: { parent: ChangeRequest; queueKind?: QueueSupport }) {
	const lot = stackedLandedLot()
	const recording = recordingHost({
		existing: { ...lot.changeRequest, base: 'feat/p' },
		checks: { head: lot.head, state: 'green', failing: [], pending: [] },
		stacks: true,
		parent: params.parent,
		parentBranch: 'feat/p',
		queueKind: params.queueKind ?? { kind: 'queue', noun: 'merge queue' },
	})
	const result = runLotApprove({
		cwd: lot.workspace.repository,
		argv: [LOT_NAME, '--by', REVIEWER],
		host: recording.host,
		now: new Date('2026-11-18T10:00:00Z'),
	})
	return { lot, result, calls: recording.calls }
}

describe('dialecte lot approve of a stacked lot', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('the parent queued, host with stacks → the stack queued up to it, never auto-merge', () => {
		const { result, calls } = approveOnParent({
			parent: { ...parentChangeRequest(), queued: true },
		})

		expect({
			exitCode: result.exitCode,
			stackQueued: calls.includes(`stack-queue ${REVIEW_CHANGE_REQUEST_NUMBER}`),
			autoQueued: calls.includes(`queue ${REVIEW_CHANGE_REQUEST_NUMBER}`),
			queueNamed: result.output.endsWith(`#${REVIEW_CHANGE_REQUEST_NUMBER} queued`),
			queueKindRead: calls.some((call) => call.startsWith('queue-kind')),
		}).toEqual({
			exitCode: 0,
			stackQueued: true,
			autoQueued: false,
			queueNamed: true,
			queueKindRead: false,
		})
	})

	it('the parent queued, the host offering no queue → the stack queued all the same, the queue kind never read', () => {
		const { result, calls } = approveOnParent({
			parent: { ...parentChangeRequest(), queued: true },
			queueKind: { kind: 'none', noun: 'no queue' },
		})

		expect({
			exitCode: result.exitCode,
			stackQueued: calls.includes(`stack-queue ${REVIEW_CHANGE_REQUEST_NUMBER}`),
			queueKindRead: calls.some((call) => call.startsWith('queue-kind')),
		}).toEqual({ exitCode: 0, stackQueued: true, queueKindRead: false })
	})

	it('the parent not queued → refused naming the parent, nothing recorded, nothing queued', () => {
		const { lot, result, calls } = approveOnParent({ parent: parentChangeRequest() })

		expect({
			result,
			queued: calls.some((call) => call.includes('queue')),
			approvals: existsSync(join(lot.lotFolder, STORE_FILES.approvals)),
		}).toEqual({
			result: {
				exitCode: 1,
				output: `lot approve: ${LOT_NAME} not approved: ${LOT_NAME} stacks on #5 (${PARENT}), not queued yet: approve ${PARENT} first, the stack queues with it; nothing recorded, nothing queued`,
			},
			queued: false,
			approvals: false,
		})
	})
})
