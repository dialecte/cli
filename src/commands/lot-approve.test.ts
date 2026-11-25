/**
 * `dialecte lot approve <id> --by <who> [--reason <text>]`: a person's approval recorded in the lot's review, the pull
 * request's body rendered again and the pull request queued; refused, nothing recorded or queued, while its checks are
 * not green on the landed head or a blocking finding is open.
 */
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

import { recordingHost } from '../../test/land-lot.ts'
import { FORBIDDEN_WORD, LOT_NAME } from '../../test/lot-describe.constants.ts'
import {
	OTHER_HEAD,
	OTHER_PACKAGE,
	REVIEW_CHANGE_REQUEST_NUMBER,
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

import type { ChangeRequestChecks } from '../lib/host/host.types.ts'

/** The checks on `head` in `state`, naming one failing or pending check when the state asks for it. */
function checksOn(params: {
	head: string
	state: ChangeRequestChecks['state']
}): ChangeRequestChecks {
	return {
		head: params.head,
		state: params.state,
		failing: params.state === 'failing' ? ['ci-ok'] : [],
		pending: params.state === 'pending' ? ['ci-ok'] : [],
	}
}

/** How many approvals the lot folder records. */
function approvalCount(folder: string): number {
	const file = join(folder, STORE_FILES.approvals)
	return existsSync(file) ? readFileSync(file, 'utf8').trim().split('\n').length : 0
}

describe('dialecte lot approve', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('green checks on the landed head and no open blocking finding → a person approves, the body rendered again, queued', () => {
		const lot = landedLot()
		const { host, calls, bodies } = recordingHost({
			existing: lot.changeRequest,
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
			`read ${REVIEW_CHANGE_REQUEST_NUMBER}`,
			`checks ${REVIEW_CHANGE_REQUEST_NUMBER}`,
			`read ${REVIEW_CHANGE_REQUEST_NUMBER}`,
			`edit ${REVIEW_CHANGE_REQUEST_NUMBER} "feat(x): x answers one"`,
			`queue ${REVIEW_CHANGE_REQUEST_NUMBER}`,
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
			head: lot.head,
		})
		expect(bodies.at(-1)).toContain('- person: approve')
		expect(bodies.at(-1)).not.toContain(REVIEWER)
		expect(result.output).toBe(
			`lot approve: ${LOT_NAME} approved by ${REVIEWER} on ${lot.head.slice(0, 12)}, change request #${REVIEW_CHANGE_REQUEST_NUMBER} queued`,
		)
	})

	it.each([
		{
			answer: 'a merge queue',
			queueKind: { kind: 'queue', noun: 'merge queue' },
			via: ' (merge queue)',
		},
		{
			answer: 'auto-merge',
			queueKind: { kind: 'auto-merge', noun: 'auto-merge' },
			via: ' (auto-merge)',
		},
		{ answer: 'a refused read', queueKind: { refusal: 'gh api graphql: HTTP 502' }, via: '' },
	] as const)(
		'the host answering $answer for the queue → approved, queued, the queue named only when there is one',
		({ queueKind, via }) => {
			const lot = landedLot()
			const { host } = recordingHost({
				existing: lot.changeRequest,
				checks: checksOn({ head: lot.head, state: 'green' }),
				queueKind,
			})

			const result = runLotApprove({
				cwd: lot.workspace.repository,
				argv: [LOT_NAME, '--by', REVIEWER],
				host,
				now: new Date('2026-11-17T10:00:00Z'),
			})

			expect([result.exitCode, result.output, approvalCount(lot.lotFolder)]).toEqual([
				0,
				`lot approve: ${LOT_NAME} approved by ${REVIEWER} on ${lot.head.slice(0, 12)}, change request #${REVIEW_CHANGE_REQUEST_NUMBER} queued${via}`,
				1,
			])
		},
	)

	it('the host offering no queue → refused naming it, nothing recorded, nothing sent or queued', () => {
		const lot = landedLot()
		const { host, calls } = recordingHost({
			existing: lot.changeRequest,
			checks: checksOn({ head: lot.head, state: 'green' }),
			queueKind: { kind: 'none', noun: 'no queue' },
		})

		const result = runLotApprove({
			cwd: lot.workspace.repository,
			argv: [LOT_NAME, '--by', REVIEWER],
			host,
			now: new Date('2026-11-17T10:00:00Z'),
		})

		expect({
			exitCode: result.exitCode,
			output: result.output,
			approvals: approvalCount(lot.lotFolder),
			calls,
		}).toEqual({
			exitCode: 1,
			output: `lot approve: ${LOT_NAME} not approved: the host queues no change request here: it allows no auto-merge and its base branch has no queue; turn one on, then approve again; nothing recorded, nothing queued`,
			approvals: 0,
			calls: [
				`read ${REVIEW_CHANGE_REQUEST_NUMBER}`,
				`checks ${REVIEW_CHANGE_REQUEST_NUMBER}`,
				`queue-kind ${REVIEW_CHANGE_REQUEST_NUMBER}`,
			],
		})
	})

	it('the host offering a merge queue → the queue kind read once, before the queue', () => {
		const lot = landedLot()
		const { host, calls } = recordingHost({
			existing: lot.changeRequest,
			checks: checksOn({ head: lot.head, state: 'green' }),
			queueKind: { kind: 'queue', noun: 'merge queue' },
		})

		runLotApprove({
			cwd: lot.workspace.repository,
			argv: [LOT_NAME, '--by', REVIEWER],
			host,
			now: new Date('2026-11-17T10:00:00Z'),
		})

		expect(calls.filter((call) => call.startsWith('queue'))).toEqual([
			`queue-kind ${REVIEW_CHANGE_REQUEST_NUMBER}`,
			`queue ${REVIEW_CHANGE_REQUEST_NUMBER}`,
		])
	})

	it('a GitHub origin whose base has a merge queue → the pull request noun and the merge queue named', () => {
		const lot = landedLot()
		git({
			root: lot.workspace.repository,
			args: ['remote', 'set-url', 'origin', 'https://github.com/o/r.git'],
		})
		const { host } = recordingHost({
			existing: lot.changeRequest,
			checks: checksOn({ head: lot.head, state: 'green' }),
			queueKind: { kind: 'queue', noun: 'merge queue' },
		})

		const result = runLotApprove({
			cwd: lot.workspace.repository,
			argv: [LOT_NAME, '--by', REVIEWER],
			host,
			now: new Date('2026-11-17T10:00:00Z'),
		})

		expect(result.output).toBe(
			`lot approve: ${LOT_NAME} approved by ${REVIEWER} on ${lot.head.slice(0, 12)}, pull request #${REVIEW_CHANGE_REQUEST_NUMBER} queued (merge queue)`,
		)
	})

	it.each([
		{ state: 'failing' as const, why: 'checks failing on the head: ci-ok' },
		{ state: 'pending' as const, why: 'checks pending on the head: ci-ok' },
		{ state: 'none' as const, why: 'no check on the head yet' },
	])('$state checks → refused, nothing recorded, nothing queued', ({ state, why }) => {
		const lot = landedLot()
		const { host, calls } = recordingHost({
			existing: lot.changeRequest,
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
		expect(calls).toEqual([
			`read ${REVIEW_CHANGE_REQUEST_NUMBER}`,
			`checks ${REVIEW_CHANGE_REQUEST_NUMBER}`,
		])
		expect(existsSync(join(lot.lotFolder, STORE_FILES.approvals))).toBe(false)
	})

	it("the pull request's head is not the lot's landed head → refused naming both heads", () => {
		const lot = landedLot({ changeRequestHead: OTHER_HEAD })
		const { host, calls } = recordingHost({
			existing: lot.changeRequest,
			checks: checksOn({ head: OTHER_HEAD, state: 'green' }),
		})

		const result = runLotApprove({
			cwd: lot.workspace.repository,
			argv: [LOT_NAME, '--by', REVIEWER],
			host,
		})

		expect(result.exitCode).toBe(1)
		expect(result.output).toBe(
			`lot approve: ${LOT_NAME} not approved: change request #${REVIEW_CHANGE_REQUEST_NUMBER} is at ${OTHER_HEAD.slice(0, 12)}, the lot landed ${lot.head.slice(0, 12)} (lot land ${LOT_NAME} pushes it); nothing recorded, nothing queued`,
		)
		expect(calls).not.toContain(`queue ${REVIEW_CHANGE_REQUEST_NUMBER}`)
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
			existing: lot.changeRequest,
			checks: checksOn({ head: lot.head, state: 'green' }),
		})

		const result = runLotApprove({
			cwd: lot.workspace.repository,
			argv: [LOT_NAME, '--by', REVIEWER],
			host,
		})

		expect(result.exitCode).toBe(1)
		expect(result.output).toBe(
			`lot approve: ${LOT_NAME} not approved: findings open: R1-1 blocking; nothing recorded, nothing queued`,
		)
		expect(calls).not.toContain(`queue ${REVIEW_CHANGE_REQUEST_NUMBER}`)
	})

	it('the send refused after the approval is recorded → approved, not queued; approve again, the host taking it → queued', () => {
		const lot = landedLot()
		const refusing = recordingHost({
			existing: lot.changeRequest,
			checks: checksOn({ head: lot.head, state: 'green' }),
			editRefusal: 'gh pr edit: HTTP 502',
		})
		const first = runLotApprove({
			cwd: lot.workspace.repository,
			argv: [LOT_NAME, '--by', REVIEWER],
			host: refusing.host,
		})
		const { host, calls } = recordingHost({
			existing: lot.changeRequest,
			checks: checksOn({ head: lot.head, state: 'green' }),
		})

		const again = runLotApprove({
			cwd: lot.workspace.repository,
			argv: [LOT_NAME, '--by', REVIEWER],
			host,
		})

		expect({
			first: first.output,
			approvals: approvalCount(lot.lotFolder),
			again: again.exitCode,
			queued: calls.includes(`queue ${REVIEW_CHANGE_REQUEST_NUMBER}`),
		}).toEqual({
			first: `lot approve: ${LOT_NAME} approved by ${REVIEWER} on ${lot.head.slice(0, 12)}, change request #${REVIEW_CHANGE_REQUEST_NUMBER} not queued: gh pr edit: HTTP 502`,
			approvals: 1,
			again: 0,
			queued: true,
		})
	})

	it('a hand section written above the kept heading on the host → refused naming it, nothing recorded, nothing queued', () => {
		const lot = landedLot()
		const { host, calls } = recordingHost({
			existing: {
				...lot.changeRequest,
				body: '### Hand section\n\nA note by hand.\n\n### Checklist for the reviewer when doing the PR review\n\n- [ ] Tests are complete\n',
			},
			checks: checksOn({ head: lot.head, state: 'green' }),
		})

		const result = runLotApprove({
			cwd: lot.workspace.repository,
			argv: [LOT_NAME, '--by', REVIEWER],
			host,
		})

		expect({
			exitCode: result.exitCode,
			output: result.output,
			approvals: approvalCount(lot.lotFolder),
			queued: calls.includes(`queue ${REVIEW_CHANGE_REQUEST_NUMBER}`),
		}).toEqual({
			exitCode: 1,
			output: expect.stringMatching(
				/^lot approve: \S+ not approved: the change request body holds 1 line above '[^']+' that the render would drop \('### Hand section'\): .*; nothing recorded, nothing queued$/,
			) as unknown as string,
			approvals: 0,
			queued: false,
		})
	})

	it('an open should-fix finding beside a nit → refused naming the should-fix only, a nit never blocks', () => {
		const lot = landedLot()
		for (const severity of ['nit', 'should-fix'])
			appendFinding({
				path: join(lot.lotFolder, LEDGER_FILE),
				title: LOT_NAME,
				round: 1,
				severity,
				at: 'src/x.ts:1',
				finding: 'a point',
			})
		const { host, calls } = recordingHost({
			existing: lot.changeRequest,
			checks: checksOn({ head: lot.head, state: 'green' }),
		})

		const result = runLotApprove({
			cwd: lot.workspace.repository,
			argv: [LOT_NAME, '--by', REVIEWER],
			host,
		})

		expect(result.exitCode).toBe(1)
		expect(result.output).toBe(
			`lot approve: ${LOT_NAME} not approved: findings open: R1-2 should-fix; nothing recorded, nothing queued`,
		)
		expect(calls).not.toContain(`queue ${REVIEW_CHANGE_REQUEST_NUMBER}`)
	})

	it('--by orchestrator on a package other than the cli → refused before the host is asked, a person approves', () => {
		const lot = landedLot({ packageName: OTHER_PACKAGE })
		const { host, calls } = recordingHost({
			existing: lot.changeRequest,
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
			existing: lot.changeRequest,
			checks: checksOn({ head: lot.head, state: 'green' }),
		})

		const result = runLotApprove({
			cwd: lot.workspace.repository,
			argv: [LOT_NAME, '--by', 'orchestrator'],
			host,
		})

		expect(result.exitCode).toBe(0)
		expect(calls.at(-1)).toBe(`queue ${REVIEW_CHANGE_REQUEST_NUMBER}`)
		expect(bodies.at(-1)).toContain('- orchestrator: approve')
	})

	it('a forbidden word in --reason → refused before the host is asked, nothing recorded', () => {
		const lot = landedLot()
		git({
			root: lot.workspace.repository,
			args: ['config', 'dialecte.forbiddenWords', FORBIDDEN_WORD],
		})
		const { host, calls } = recordingHost({ existing: lot.changeRequest })

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

	it('a lot never landed → refused naming lot land', () => {
		const lot = landedLot()
		rmSync(join(lot.lotFolder, LANDING_FILE))
		const { host, calls } = recordingHost({ existing: lot.changeRequest })

		const result = runLotApprove({
			cwd: lot.workspace.repository,
			argv: [LOT_NAME, '--by', REVIEWER],
			host,
		})

		expect(result.exitCode).toBe(1)
		expect(result.output).toBe(
			`lot approve: ${LOT_NAME} has no change request yet: dialecte lot land ${LOT_NAME} opens it`,
		)
		expect(calls).toEqual([])
	})

	it('no landing, on a GitHub origin → refused naming the pull request', () => {
		const lot = landedLot()
		rmSync(join(lot.lotFolder, LANDING_FILE))
		git({
			root: lot.workspace.repository,
			args: ['config', 'remote.origin.url', 'https://github.com/o/r.git'],
		})
		const { host } = recordingHost({ existing: lot.changeRequest })

		const result = runLotApprove({
			cwd: lot.workspace.repository,
			argv: [LOT_NAME, '--by', REVIEWER],
			host,
		})

		expect(result.output).toBe(
			`lot approve: ${LOT_NAME} has no pull request yet: dialecte lot land ${LOT_NAME} opens it`,
		)
	})

	it('no --by → usage, exit 2', () => {
		const lot = landedLot()
		const { host, calls } = recordingHost({ existing: lot.changeRequest })

		const result = runLotApprove({ cwd: lot.workspace.repository, argv: [LOT_NAME], host })

		expect(result.exitCode).toBe(2)
		expect(result.output).toContain('approve <id> --by <who> [--reason <text>]')
		expect(calls).toEqual([])
	})
})
