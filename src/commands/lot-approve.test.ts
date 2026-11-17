/**
 * `dialecte lot approve <id> --by <who> [--reason <text>]`: a person's approval recorded in the lot's review, the pull
 * request's body rendered again and the pull request queued; refused, nothing recorded or queued, while its checks are
 * not green on the landed head or a blocking finding is open.
 */
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

import { recordingHost } from '../../test/land-lot.ts'
import { FORBIDDEN_WORD, LOT_NAME } from '../../test/lot-pr.constants.ts'
import {
	OTHER_HEAD,
	OTHER_PACKAGE,
	REVIEW_PULL_NUMBER,
	REVIEWER,
} from '../../test/lot-review.constants.ts'
import { landedLot } from '../../test/lot-review.ts'
import { git } from '../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { LANDING_FILE } from '../lib/handover/land-lot.constants.ts'
import { appendFinding } from '../lib/review-rounds/findings-ledger.ts'
import { LEDGER_FILE } from '../lib/review-rounds/review-rounds.constants.ts'
import { STORE_FILES } from '../lib/store/store.constants.ts'
import { runLotApprove } from './lot-approve.ts'

import { describe, expect, it } from 'vitest'

import type { PullRequestChecks } from '../lib/host/host.types.ts'

/** The checks on `head` in `state`, naming one failing or pending check when the state asks for it. */
function checksOn(params: { head: string; state: PullRequestChecks['state'] }): PullRequestChecks {
	return {
		head: params.head,
		state: params.state,
		failing: params.state === 'failing' ? ['ci-ok'] : [],
		pending: params.state === 'pending' ? ['ci-ok'] : [],
	}
}

describe('dialecte lot approve', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('green checks on the landed head and no open blocking finding → a person approves, the body rendered again, queued', () => {
		const lot = landedLot()
		const { host, calls, bodies } = recordingHost({
			existing: lot.pullRequest,
			checks: checksOn({ head: lot.head, state: 'green' }),
		})

		const result = runLotApprove({
			cwd: lot.workspace.repository,
			argv: [LOT_NAME, '--by', REVIEWER, '--reason', 'read on the page'],
			host,
			now: new Date('2026-11-17T10:00:00Z'),
		})

		expect(result.exitCode).toBe(0)
		expect(calls).toEqual([
			`read ${REVIEW_PULL_NUMBER}`,
			`checks ${REVIEW_PULL_NUMBER}`,
			`edit ${REVIEW_PULL_NUMBER} "feat(x): x answers one"`,
			`queue ${REVIEW_PULL_NUMBER}`,
		])
		const review = readFileSync(join(lot.lotFolder, STORE_FILES.review), 'utf8')
			.trim()
			.split('\n')
			.map((line) => JSON.parse(line) as Record<string, unknown>)
		expect(review).toContainEqual({
			schema: 1,
			kind: 'verdict',
			at: '2026-11-17T10:00:00.000Z',
			by: { kind: 'person', name: REVIEWER },
			verdict: 'approve',
		})
		expect(bodies.at(-1)).toContain('- person: approve')
		expect(bodies.at(-1)).not.toContain(REVIEWER)
		expect(result.output).toBe(
			`lot approve: ${LOT_NAME} approved by ${REVIEWER} on ${lot.head.slice(0, 12)}, pull request #${REVIEW_PULL_NUMBER} queued`,
		)
	})

	it.each([
		{ state: 'failing' as const, why: 'checks failing on the head: ci-ok' },
		{ state: 'pending' as const, why: 'checks pending on the head: ci-ok' },
		{ state: 'none' as const, why: 'no check on the head yet' },
	])('$state checks → refused, nothing recorded, nothing queued', ({ state, why }) => {
		const lot = landedLot()
		const { host, calls } = recordingHost({
			existing: lot.pullRequest,
			checks: checksOn({ head: lot.head, state }),
		})

		const result = runLotApprove({
			cwd: lot.workspace.repository,
			argv: [LOT_NAME, '--by', REVIEWER],
			host,
		})

		expect(result.exitCode).toBe(1)
		expect(result.output).toBe(
			`lot approve: ${LOT_NAME} not approved: ${why}; nothing recorded, nothing queued`,
		)
		expect(calls).toEqual([`read ${REVIEW_PULL_NUMBER}`, `checks ${REVIEW_PULL_NUMBER}`])
		expect(existsSync(join(lot.lotFolder, STORE_FILES.approvals))).toBe(false)
	})

	it("the pull request's head is not the lot's landed head → refused naming both heads", () => {
		const lot = landedLot({ pullHead: OTHER_HEAD })
		const { host, calls } = recordingHost({
			existing: lot.pullRequest,
			checks: checksOn({ head: OTHER_HEAD, state: 'green' }),
		})

		const result = runLotApprove({
			cwd: lot.workspace.repository,
			argv: [LOT_NAME, '--by', REVIEWER],
			host,
		})

		expect(result.exitCode).toBe(1)
		expect(result.output).toBe(
			`lot approve: ${LOT_NAME} not approved: pull request #${REVIEW_PULL_NUMBER} is at ${OTHER_HEAD.slice(0, 12)}, the lot landed ${lot.head.slice(0, 12)} (lot land ${LOT_NAME} --draft pushes it); nothing recorded, nothing queued`,
		)
		expect(calls).not.toContain(`queue ${REVIEW_PULL_NUMBER}`)
		expect(existsSync(join(lot.lotFolder, STORE_FILES.approvals))).toBe(false)
	})

	it('an open blocking finding → refused naming it', () => {
		const lot = landedLot()
		appendFinding({
			path: join(lot.lotFolder, LEDGER_FILE),
			title: LOT_NAME,
			round: 1,
			severity: 'blocking',
			at: 'src/x.ts:1',
			finding: 'x is wrong',
		})
		appendFinding({
			path: join(lot.lotFolder, LEDGER_FILE),
			title: LOT_NAME,
			round: 1,
			severity: 'nit',
			at: 'src/x.ts:1',
			finding: 'a word',
		})
		const { host, calls } = recordingHost({
			existing: lot.pullRequest,
			checks: checksOn({ head: lot.head, state: 'green' }),
		})

		const result = runLotApprove({
			cwd: lot.workspace.repository,
			argv: [LOT_NAME, '--by', REVIEWER],
			host,
		})

		expect(result.exitCode).toBe(1)
		expect(result.output).toBe(
			`lot approve: ${LOT_NAME} not approved: blocking finding open: R1-1; nothing recorded, nothing queued`,
		)
		expect(calls).not.toContain(`queue ${REVIEW_PULL_NUMBER}`)
	})

	it('--by orchestrator on a package other than the cli → refused before the host is asked, a person approves', () => {
		const lot = landedLot({ packageName: OTHER_PACKAGE })
		const { host, calls } = recordingHost({
			existing: lot.pullRequest,
			checks: checksOn({ head: lot.head, state: 'green' }),
		})

		const result = runLotApprove({
			cwd: lot.workspace.repository,
			argv: [LOT_NAME, '--by', 'orchestrator'],
			host,
		})

		expect(result.exitCode).toBe(2)
		expect(result.output).toBe(
			`lot approve: ${OTHER_PACKAGE} lots are approved by a person: --by orchestrator is for the cli's own lots`,
		)
		expect(calls).toEqual([])
	})

	it('--by orchestrator on the cli → approved, the body naming the orchestrator', () => {
		const lot = landedLot()
		const { host, calls, bodies } = recordingHost({
			existing: lot.pullRequest,
			checks: checksOn({ head: lot.head, state: 'green' }),
		})

		const result = runLotApprove({
			cwd: lot.workspace.repository,
			argv: [LOT_NAME, '--by', 'orchestrator'],
			host,
		})

		expect(result.exitCode).toBe(0)
		expect(calls.at(-1)).toBe(`queue ${REVIEW_PULL_NUMBER}`)
		expect(bodies.at(-1)).toContain('- orchestrator: approve')
	})

	it('a forbidden word in --reason → refused before the host is asked, nothing recorded', () => {
		const lot = landedLot()
		git({
			root: lot.workspace.repository,
			args: ['config', 'dialecte.forbiddenWords', FORBIDDEN_WORD],
		})
		const { host, calls } = recordingHost({ existing: lot.pullRequest })

		const result = runLotApprove({
			cwd: lot.workspace.repository,
			argv: [LOT_NAME, '--by', REVIEWER, '--reason', `asked by ${FORBIDDEN_WORD}`],
			host,
		})

		expect(result.exitCode).toBe(2)
		expect(result.output).toContain('--reason')
		expect(calls).toEqual([])
		expect(existsSync(join(lot.lotFolder, STORE_FILES.approvals))).toBe(false)
	})

	it('a lot never landed → refused naming lot land --draft', () => {
		const lot = landedLot()
		rmSync(join(lot.lotFolder, LANDING_FILE))
		const { host, calls } = recordingHost({ existing: lot.pullRequest })

		const result = runLotApprove({
			cwd: lot.workspace.repository,
			argv: [LOT_NAME, '--by', REVIEWER],
			host,
		})

		expect(result.exitCode).toBe(1)
		expect(result.output).toBe(
			`lot approve: ${LOT_NAME} has no pull request yet: dialecte lot land ${LOT_NAME} --draft opens it`,
		)
		expect(calls).toEqual([])
	})

	it('no --by → usage, exit 2', () => {
		const lot = landedLot()
		const { host, calls } = recordingHost({ existing: lot.pullRequest })

		const result = runLotApprove({ cwd: lot.workspace.repository, argv: [LOT_NAME], host })

		expect(result.exitCode).toBe(2)
		expect(result.output).toContain('approve <id> --by <who> [--reason <text>]')
		expect(calls).toEqual([])
	})
})
