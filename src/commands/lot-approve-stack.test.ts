/**
 * `lot approve` of a lot started on another (R1-16): its pull request still merging into the parent's branch queues as
 * a native stack once the parent's pull request is queued; otherwise refused, nothing recorded, nothing queued.
 */
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { parentChangeRequest, recordingHost } from '../../test/land-lot.ts'
import { LOT_NAME } from '../../test/lot-pr.constants.ts'
import { REVIEW_CHANGE_REQUEST_NUMBER, REVIEWER } from '../../test/lot-review.constants.ts'
import { landedLot } from '../../test/lot-review.ts'
import { git, writeFiles } from '../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { STORE_FILES } from '../lib/store/store.constants.ts'
import { runLotApprove } from './lot-approve.ts'

import { describe, expect, it } from 'vitest'

import type { ChangeRequest } from '../lib/host/host.types.ts'

const PARENT = '0000-repo-p'

/** A landed lot started on `PARENT` (its stack.json), the parent's identity on `feat/p` and its pull request #5. */
function stackedLandedLot() {
	const lot = landedLot()
	// the parent's branch, which the lot's tdd base reads from
	git({ root: lot.workspace.repository, args: ['branch', 'feat/p', 'main'] })
	writeFiles({
		root: dirname(lot.lotFolder),
		files: {
			[`${PARENT}/identity.json`]: JSON.stringify({
				name: PARENT,
				branch: 'feat/p',
				base: {
					ref: 'main',
					commit: git({ root: lot.workspace.repository, args: ['rev-parse', 'main'] }).trim(),
				},
			}),
			[`${PARENT}/landing.json`]: JSON.stringify({
				schema: 1,
				number: 5,
				url: 'https://host.test/pull/5',
				branch: 'feat/p',
				head: '',
				at: '',
			}),
		},
	})
	writeFiles({
		root: lot.lotFolder,
		files: { 'stack.json': JSON.stringify({ schema: 1, parent: PARENT }) },
	})
	return lot
}

/** Approve the lot as a person, its pull request merging into `feat/p`, the parent `parent`, on a host with stacks. */
function approveOnParent(params: { parent: ChangeRequest }) {
	const lot = stackedLandedLot()
	const recording = recordingHost({
		existing: { ...lot.changeRequest, base: 'feat/p' },
		checks: { head: lot.head, state: 'green', failing: [], pending: [] },
		stacks: true,
		parent: params.parent,
		parentBranch: 'feat/p',
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
		}).toEqual({ exitCode: 0, stackQueued: true, autoQueued: false })
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
