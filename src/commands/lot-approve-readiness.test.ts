/**
 * One reader of what `lot approve` would refuse: on the same lot, `lot review`'s approve line and `lot approve` give the
 * same reasons, every one at once, and `lot approve` records nothing.
 */
import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { parentChangeRequest, recordingHost } from '../../test/land-lot.ts'
import { LOT_NAME } from '../../test/lot-describe.constants.ts'
import {
	REVIEW_CHANGE_REQUEST_NUMBER,
	REVIEWER,
	STACK_PARENT_LOT,
} from '../../test/lot-review.constants.ts'
import { landedLot, stackedLandedLot } from '../../test/lot-review.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { STACK_QUEUE_LINES } from '../lib/handover/stack-queue.constants.ts'
import { fillMessage } from '../lib/knowledge/standard/fill-message.ts'
import { appendFinding } from '../lib/review-rounds/findings-ledger.ts'
import { LEDGER_FILE } from '../lib/review-rounds/review-rounds.constants.ts'
import { STORE_FILES } from '../lib/store/store.constants.ts'
import { runLotApprove } from './lot-approve.ts'
import { runLotReview } from './lot-review.ts'

import { describe, expect, it } from 'vitest'

import type { LandedLot } from '../../test/lot-review.types.ts'
import type { ChangeRequestChecks } from '../lib/host/host.types.ts'

type HostParams = NonNullable<Parameters<typeof recordingHost>[0]>

const PARENT_NOT_QUEUED = `${LOT_NAME} stacks on #5 (${STACK_PARENT_LOT}), not queued yet: approve ${STACK_PARENT_LOT} first, the stack queues with it`
const PARENT_MERGED = fillMessage({
	template: STACK_QUEUE_LINES.parentMerged,
	values: { lot: LOT_NAME, parent: STACK_PARENT_LOT, number: '5' },
})
const PARENT_WAITS = fillMessage({
	template: STACK_QUEUE_LINES.waits,
	values: { lot: LOT_NAME, parent: STACK_PARENT_LOT, number: '5' },
})
const READY_LINE = `approve: ready: dialecte lot approve ${LOT_NAME} --by <who>`
const SHOULD_FIX_OPEN = 'findings open: R1-1 should-fix'
const RENDER_DROPS =
	"the change request body holds text the render would drop (no '### Checklist for the reviewer when doing the PR review' heading): move it under that heading or clear it, nothing sent"
const TDD_BASE_TORN =
	'tdd base: stack.json does not read as a stack record; the lot is never measured as one not stacked'
const STACK_DAMAGED = `${LOT_NAME} is damaged: its stack.json does not read as a stack record`

/** Green checks on `head`. */
function greenOn(head: string): ChangeRequestChecks {
	return { head, state: 'green', failing: [], pending: [] }
}

/** A should-fix finding open in the lot's ledger. */
function openShouldFix(lot: LandedLot): void {
	appendFinding({
		path: join(lot.lotFolder, LEDGER_FILE),
		title: LOT_NAME,
		round: 1,
		severity: 'should-fix',
		at: 'src/x.ts:1',
		finding: 'a point',
	})
}

/**
 * The host of a stacked lot: its pull request merging into `feat/p`, the parent's read by that branch; `stacks` true when
 * the host links stacks, else its answer to the stacks probe (no stacks).
 */
function stackedHost(params: { lot: LandedLot; parent: 'open' | 'merged'; stacks: true | string }) {
	return {
		existing: { ...params.lot.changeRequest, base: 'feat/p' },
		checks: greenOn(params.lot.head),
		stacks: params.stacks,
		parent: parentChangeRequest({ state: params.parent }),
		parentBranch: 'feat/p',
	} satisfies HostParams
}

/** On a lot `lot approve` would approve: `lot review`'s approve line, and how `lot approve` ends. */
function readyAnswers(params: { lot: LandedLot; host: HostParams }) {
	const { lot } = params
	const review = runLotReview({
		cwd: lot.workspace.repository,
		argv: [LOT_NAME, '--no-open'],
		host: recordingHost(params.host).host,
	})
	const approve = runLotApprove({
		cwd: lot.workspace.repository,
		argv: [LOT_NAME, '--by', REVIEWER],
		host: recordingHost(params.host).host,
		now: new Date('2026-11-23T10:00:00Z'),
	})
	return {
		review: review.output.split('\n').find((line) => line.startsWith('approve: ')),
		exitCode: approve.exitCode,
		recorded: existsSync(join(lot.lotFolder, STORE_FILES.approvals)),
	}
}

/** Each lot, built afresh, with the host it is read on and the reasons both verbs give, in order. */
const ROWS: {
	label: string
	build: () => { lot: LandedLot; host: HostParams }
	reasons: readonly string[]
}[] = [
	{
		label: 'a stacked lot whose parent is open and not queued → both name the parent not queued',
		build: function build() {
			const lot = stackedLandedLot()
			return { lot, host: stackedHost({ lot, parent: 'open', stacks: true }) }
		},
		reasons: [PARENT_NOT_QUEUED],
	},
	{
		label: 'a stacked lot whose parent merged → both name the parent merged',
		build: function build() {
			const lot = stackedLandedLot()
			return { lot, host: stackedHost({ lot, parent: 'merged', stacks: true }) }
		},
		reasons: [PARENT_MERGED],
	},
	{
		label: 'a stacked lot on a host without stacks → both name the wait for the parent',
		build: function build() {
			const lot = stackedLandedLot()
			return { lot, host: stackedHost({ lot, parent: 'open', stacks: 'no stacks here' }) }
		},
		reasons: [PARENT_WAITS],
	},
	{
		label: "a body holding a person's text the render would drop → both name the render refusal",
		build: function build() {
			const lot = landedLot()
			return {
				lot,
				host: {
					existing: { ...lot.changeRequest, body: 'notes of my own' },
					checks: greenOn(lot.head),
				},
			}
		},
		reasons: [RENDER_DROPS],
	},
	{
		label:
			'a should-fix finding open and a body the render would drop → both name the finding, then the render',
		build: function build() {
			const lot = landedLot()
			openShouldFix(lot)
			return {
				lot,
				host: {
					existing: { ...lot.changeRequest, body: 'notes of my own' },
					checks: greenOn(lot.head),
				},
			}
		},
		reasons: [SHOULD_FIX_OPEN, RENDER_DROPS],
	},
	{
		label:
			'a stacked lot with a should-fix finding open and its parent not queued → both name the finding, then the parent',
		build: function build() {
			const lot = stackedLandedLot()
			openShouldFix(lot)
			return { lot, host: stackedHost({ lot, parent: 'open', stacks: true }) }
		},
		reasons: [SHOULD_FIX_OPEN, PARENT_NOT_QUEUED],
	},
	{
		label:
			'a torn stack record and a should-fix finding open → both name the finding, the tdd base, then the damage (the render not run)',
		build: function build() {
			const lot = landedLot()
			openShouldFix(lot)
			writeFileSync(join(lot.lotFolder, 'stack.json'), '{"schema":1,"parent":')
			return {
				lot,
				host: { existing: lot.changeRequest, checks: greenOn(lot.head) },
			}
		},
		reasons: [SHOULD_FIX_OPEN, TDD_BASE_TORN, STACK_DAMAGED],
	},
	{
		label: 'the host refusing the checks read → both name its refusal alone',
		build: function build() {
			const lot = landedLot()
			return {
				lot,
				host: { existing: lot.changeRequest, refusals: { readChecks: 'checks unreadable' } },
			}
		},
		reasons: ['checks unreadable'],
	},
]

describe(
	'one reader of what lot approve would refuse: lot review and lot approve agree',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it.each(ROWS)('$label', ({ build, reasons }) => {
			const { lot, host } = build()

			const review = runLotReview({
				cwd: lot.workspace.repository,
				argv: [LOT_NAME, '--no-open'],
				host: recordingHost(host).host,
			})
			const approve = runLotApprove({
				cwd: lot.workspace.repository,
				argv: [LOT_NAME, '--by', REVIEWER],
				host: recordingHost(host).host,
			})

			expect({
				review: review.output.split('\n').find((line) => line.startsWith('approve: ')),
				approve: approve.output,
				exitCode: approve.exitCode,
				recorded: existsSync(join(lot.lotFolder, STORE_FILES.approvals)),
			}).toEqual({
				review: `approve: would refuse: ${reasons.join('; ')}`,
				approve: `lot approve: ${LOT_NAME} not approved: ${reasons.join('; ')}; nothing recorded, nothing queued`,
				exitCode: 1,
				recorded: false,
			})
		})

		it('lot review of a stacked lot → the host only read: the change request, its checks, the parent, its stacks and queue state', () => {
			const lot = stackedLandedLot()
			const recording = recordingHost(stackedHost({ lot, parent: 'open', stacks: true }))

			runLotReview({
				cwd: lot.workspace.repository,
				argv: [LOT_NAME, '--no-open'],
				host: recording.host,
			})

			expect(recording.calls).toEqual([
				`read ${REVIEW_CHANGE_REQUEST_NUMBER}`,
				`checks ${REVIEW_CHANGE_REQUEST_NUMBER}`,
				'read feat/p',
				'probe',
			])
		})

		it('a ready lot on a host with a merge queue → lot review prints the approve command, lot approve queues', () => {
			const lot = landedLot()

			expect(
				readyAnswers({
					lot,
					host: {
						existing: lot.changeRequest,
						checks: greenOn(lot.head),
						queueKind: { kind: 'queue', noun: 'merge queue' },
					},
				}),
			).toEqual({ review: READY_LINE, exitCode: 0, recorded: true })
		})

		it('a ready stacked lot whose parent is queued → lot review prints the approve command, lot approve queues the stack', () => {
			const lot = stackedLandedLot()
			const host = stackedHost({ lot, parent: 'open', stacks: true })

			expect(
				readyAnswers({ lot, host: { ...host, parent: { ...host.parent, queued: true } } }),
			).toEqual({ review: READY_LINE, exitCode: 0, recorded: true })
		})
	},
)
