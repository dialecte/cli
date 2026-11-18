/**
 * `dialecte lot approve`: the approval stands for the head it was given on, once; a refusal found after the checks
 * leaves nothing written; a pull request the host will not queue keeps the approval for a later run.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { recordingHost } from '../../test/land-lot.ts'
import { LOT_NAME } from '../../test/lot-pr.constants.ts'
import {
	OTHER_HEAD,
	OTHER_PACKAGE,
	REVIEW_PULL_NUMBER,
	REVIEWER,
} from '../../test/lot-review.constants.ts'
import { landedLot } from '../../test/lot-review.ts'
import { git } from '../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { readReviewRecord } from '../lib/review-rounds/review-record.ts'
import { STORE_FILES } from '../lib/store/store.constants.ts'
import { runLotApprove } from './lot-approve.ts'
import { runLotPr } from './lot-pr.ts'

import { describe, expect, it } from 'vitest'

/** The lines of the lot folder's approvals record; none without it. */
function approvalLines(folder: string): string[] {
	const file = join(folder, STORE_FILES.approvals)
	return existsSync(file) ? readFileSync(file, 'utf8').trim().split('\n') : []
}

describe(
	'dialecte lot approve: an approval stands for its head, once',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it('green checks of another head than the landed one → refused naming both, nothing recorded', () => {
			const lot = landedLot()
			const { host, calls } = recordingHost({
				existing: lot.pullRequest,
				checks: { head: OTHER_HEAD, state: 'green', failing: [], pending: [] },
			})

			const result = runLotApprove({
				cwd: lot.workspace.repository,
				argv: [LOT_NAME, '--by', REVIEWER],
				host,
			})

			expect(result.exitCode).toBe(1)
			expect(result.output).toBe(
				`lot approve: ${LOT_NAME} not approved: checks ran on ${OTHER_HEAD.slice(0, 12)}, not the landed ${lot.head.slice(0, 12)}; nothing recorded, nothing queued`,
			)
			expect(calls).not.toContain(`queue ${REVIEW_PULL_NUMBER}`)
			expect(approvalLines(lot.lotFolder)).toEqual([])
		})

		it("a body holding a person's text the render would drop → refused before anything is recorded", () => {
			const lot = landedLot()
			const { host, calls } = recordingHost({
				existing: { ...lot.pullRequest, body: 'notes of my own' },
				checks: { head: lot.head, state: 'green', failing: [], pending: [] },
			})

			const result = runLotApprove({
				cwd: lot.workspace.repository,
				argv: [LOT_NAME, '--by', REVIEWER],
				host,
			})

			expect(result.exitCode).toBe(1)
			expect(result.output).toContain('the pull request body holds text the render would drop')
			expect(calls).not.toContain(`queue ${REVIEW_PULL_NUMBER}`)
			expect(approvalLines(lot.lotFolder)).toEqual([])
		})

		it('the host refusing the queue → approved, not queued, exit 1; run again → already approved, queued, one approval', () => {
			const lot = landedLot()
			const checks = { head: lot.head, state: 'green' as const, failing: [], pending: [] }
			const refusing = recordingHost({
				existing: lot.pullRequest,
				checks,
				queueRefusal: 'gh pr merge: HTTP 502',
			})

			const first = runLotApprove({
				cwd: lot.workspace.repository,
				argv: [LOT_NAME, '--by', REVIEWER],
				host: refusing.host,
			})
			const queuing = recordingHost({
				existing: { ...lot.pullRequest, body: refusing.bodies.at(-1) ?? '' },
				checks,
			})
			const second = runLotApprove({
				cwd: lot.workspace.repository,
				argv: [LOT_NAME, '--by', REVIEWER],
				host: queuing.host,
			})

			expect(first.exitCode).toBe(1)
			expect(first.output).toBe(
				`lot approve: ${LOT_NAME} approved by ${REVIEWER} on ${lot.head.slice(0, 12)}, pull request #${REVIEW_PULL_NUMBER} not queued: gh pr merge: HTTP 502`,
			)
			expect(second.exitCode).toBe(0)
			expect(second.output).toBe(
				`lot approve: ${LOT_NAME} already approved by ${REVIEWER} on ${lot.head.slice(0, 12)}, pull request #${REVIEW_PULL_NUMBER} queued`,
			)
			expect(queuing.calls.at(-1)).toBe(`queue ${REVIEW_PULL_NUMBER}`)
			expect(approvalLines(lot.lotFolder)).toHaveLength(1)
			expect(readReviewRecord({ folder: lot.lotFolder })?.verdicts).toHaveLength(1)
		})

		it('a commit after the approval → lot pr renders the body without it', () => {
			const lot = landedLot()
			const { host } = recordingHost({
				existing: lot.pullRequest,
				checks: { head: lot.head, state: 'green', failing: [], pending: [] },
			})
			const approved = runLotApprove({
				cwd: lot.workspace.repository,
				argv: [LOT_NAME, '--by', REVIEWER],
				host,
			})
			expect(approved.exitCode).toBe(0)
			writeFileSync(join(lot.worktree, 'src', 'x.ts'), 'export const x = 2\n')
			git({ root: lot.worktree, args: ['commit', '-qam', 'fix(x): two'] })

			const rendered = runLotPr({ cwd: lot.workspace.repository, argv: [LOT_NAME, '--print'] })

			expect(rendered.exitCode).toBe(0)
			expect(rendered.output).not.toContain('person: approve')
		})

		it('the worktree a commit ahead of the landed head → refused naming both, nothing recorded', () => {
			const lot = landedLot()
			writeFileSync(join(lot.worktree, 'src', 'x.ts'), 'export const x = 2\n')
			git({ root: lot.worktree, args: ['commit', '-qam', 'fix(x): two'] })
			const local = git({ root: lot.worktree, args: ['rev-parse', 'HEAD'] }).trim()
			const { host, calls } = recordingHost({
				existing: lot.pullRequest,
				checks: { head: lot.head, state: 'green', failing: [], pending: [] },
			})

			const result = runLotApprove({
				cwd: lot.workspace.repository,
				argv: [LOT_NAME, '--by', REVIEWER],
				host,
			})

			expect(result.exitCode).toBe(1)
			expect(result.output).toBe(
				`lot approve: ${LOT_NAME} not approved: the worktree is at ${local.slice(0, 12)}, the lot landed ${lot.head.slice(0, 12)} (lot land ${LOT_NAME} pushes it); nothing recorded, nothing queued`,
			)
			expect(calls).not.toContain(`queue ${REVIEW_PULL_NUMBER}`)
			expect(approvalLines(lot.lotFolder)).toEqual([])
		})

		it('--by Orchestrator on the cli → the body names the orchestrator', () => {
			const lot = landedLot()
			const { host, bodies } = recordingHost({
				existing: lot.pullRequest,
				checks: { head: lot.head, state: 'green', failing: [], pending: [] },
			})

			const result = runLotApprove({
				cwd: lot.workspace.repository,
				argv: [LOT_NAME, '--by', 'Orchestrator'],
				host,
			})

			expect(result.exitCode).toBe(0)
			expect(bodies.at(-1)).toContain('- orchestrator: approve')
		})

		it('--by in another casing of orchestrator on a package other than the cli → refused, a person approves', () => {
			const lot = landedLot({ packageName: OTHER_PACKAGE })
			const { host, calls } = recordingHost({ existing: lot.pullRequest })

			const result = runLotApprove({
				cwd: lot.workspace.repository,
				argv: [LOT_NAME, '--by', 'Orchestrator'],
				host,
			})

			expect(result.exitCode).toBe(2)
			expect(calls).toEqual([])
		})
	},
)
