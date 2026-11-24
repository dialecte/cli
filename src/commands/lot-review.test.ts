/**
 * `dialecte lot review <id> [--no-open]`: the private half of a lot's review printed locally (what never goes on the
 * pull request page), then its changed files opened in the browser; nothing written.
 */
import { readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { recordingHost } from '../../test/land-lot.ts'
import { LOT_NAME } from '../../test/lot-describe.constants.ts'
import {
	REVIEW_CHANGE_REQUEST_NUMBER,
	REVIEW_CHANGE_REQUEST_URL,
} from '../../test/lot-review.constants.ts'
import { landedLot } from '../../test/lot-review.ts'
import { git } from '../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { LANDING_FILE } from '../lib/handover/land-lot.constants.ts'
import { appendDecision } from '../lib/review-rounds/decisions-file.ts'
import { appendFinding } from '../lib/review-rounds/findings-ledger.ts'
import { DECISIONS_FILE, LEDGER_FILE } from '../lib/review-rounds/review-rounds.constants.ts'
import { STANDARD_FILE } from '../lib/standard/standard.constants.ts'
import { STORE_FILES } from '../lib/store/store.constants.ts'
import { runLotReview } from './lot-review.ts'

import { describe, expect, it } from 'vitest'

import type { LandedLot } from '../../test/lot-review.types.ts'

/** A landed lot holding a decision, a blocking finding still open and a standard note, all private records. */
function reviewedLot(): LandedLot {
	const lot = landedLot()
	appendDecision({
		path: join(lot.lotFolder, DECISIONS_FILE),
		title: LOT_NAME,
		decision: 'x stays a constant',
		by: 'person-a',
		when: '2026-11-17',
	})
	appendFinding({
		path: join(lot.lotFolder, LEDGER_FILE),
		title: LOT_NAME,
		round: 1,
		severity: 'blocking',
		at: 'src/x.ts:1',
		finding: 'x is wrong',
	})
	writeStandard({ folder: lot.lotFolder, note: 'the rule read' })
	return lot
}

function writeStandard(params: { folder: string; note: string }): void {
	writeFileSync(
		join(params.folder, STANDARD_FILE),
		JSON.stringify({ state: 'consulted', note: params.note, at: '2026-11-17T00:00:00Z' }),
	)
}

/** Every file of the folder with its size and modification time: what a read-only verb leaves as it was. */
function folderState(folder: string): string[] {
	return readdirSync(folder, { recursive: true, encoding: 'utf8' })
		.sort()
		.map((path) => {
			const stat = statSync(join(folder, path))
			return `${path} ${stat.size} ${stat.mtimeMs}`
		})
}

describe('dialecte lot review', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a lot with a pull request → its private half printed, then the changed files opened, nothing written', () => {
		const lot = reviewedLot()
		const { host, calls } = recordingHost({
			existing: lot.changeRequest,
			checks: { head: lot.head, state: 'pending', failing: [], pending: ['ci-ok'] },
		})
		const before = folderState(lot.lotFolder)
		const brief = JSON.parse(readFileSync(join(lot.lotFolder, STORE_FILES.brief), 'utf8')) as {
			goal: string
		}

		const result = runLotReview({ cwd: lot.workspace.repository, argv: [LOT_NAME], host })

		expect(result.exitCode).toBe(0)
		const lines = result.output.split('\n')
		const head = lot.head.slice(0, 12)
		expect(lines.slice(0, 4)).toEqual([
			`lot review ${LOT_NAME} · working · feat/x`,
			`change request #${REVIEW_CHANGE_REQUEST_NUMBER} draft · ${REVIEW_CHANGE_REQUEST_URL}`,
			`heads: change request ${head}, landed ${head}, worktree ${head}`,
			'checks: pending (ci-ok)',
		])
		expect(lines).toContain(`goal: ${brief.goal}`)
		expect(lines).toContain('step 1: x answers')
		expect(lines).toContain('  spec: ## Step 1')
		expect(lines).toContain('  - x asked -> one')
		expect(lines).toContain('  - x stays a constant (person-a, 2026-11-17)')
		expect(lines).toContain('  - R1-1 round 1 blocking open src/x.ts:1: x is wrong')
		expect(
			lines.some((line) => line.startsWith('standard: ') && line.includes('the rule read')),
		).toBe(true)
		expect(lines).toContain(
			'approve: would refuse: checks pending on the head: ci-ok; findings open: R1-1 blocking',
		)
		expect(lines.filter((line) => line !== '').at(-1)).toBe(
			`files: ${REVIEW_CHANGE_REQUEST_URL}/files opened`,
		)
		expect(calls).toEqual([
			`read ${REVIEW_CHANGE_REQUEST_NUMBER}`,
			`checks ${REVIEW_CHANGE_REQUEST_NUMBER}`,
			`files ${REVIEW_CHANGE_REQUEST_URL}`,
		])
		expect(folderState(lot.lotFolder)).toEqual(before)
	})

	it('green checks on the landed head and no open blocking finding → approve ready, the command named', () => {
		const lot = landedLot()
		const { host } = recordingHost({
			existing: lot.changeRequest,
			checks: { head: lot.head, state: 'green', failing: [], pending: [] },
		})

		const result = runLotReview({ cwd: lot.workspace.repository, argv: [LOT_NAME], host })

		expect(result.output.split('\n')).toContain(
			`approve: ready: dialecte lot approve ${LOT_NAME} --by <who>`,
		)
	})

	it('--no-open → printed, the browser never opened', () => {
		const lot = landedLot()
		const { host, calls } = recordingHost({ existing: lot.changeRequest })

		const result = runLotReview({
			cwd: lot.workspace.repository,
			argv: [LOT_NAME, '--no-open'],
			host,
		})

		expect(result.exitCode).toBe(0)
		expect(calls).toEqual([
			`read ${REVIEW_CHANGE_REQUEST_NUMBER}`,
			`checks ${REVIEW_CHANGE_REQUEST_NUMBER}`,
		])
		expect(
			result.output
				.split('\n')
				.filter((line) => line !== '')
				.at(-1),
		).toBe(`files: ${REVIEW_CHANGE_REQUEST_URL}/files`)
	})

	it.each([
		{
			name: 'a files page the host names → that page printed, the pull request url still handed to the opener',
			filesUrl: 'https://host.test/pull/7/changes' as string | undefined,
			printed: 'https://host.test/pull/7/changes',
		},
		{
			name: 'no files page → the pull request url printed',
			filesUrl: undefined,
			printed: REVIEW_CHANGE_REQUEST_URL,
		},
	])('$name', ({ filesUrl, printed }) => {
		const lot = landedLot()
		const { host, calls } = recordingHost({ existing: { ...lot.changeRequest, filesUrl } })

		const result = runLotReview({
			cwd: lot.workspace.repository,
			argv: [LOT_NAME],
			host,
		})

		expect(
			result.output
				.split('\n')
				.filter((line) => line !== '')
				.at(-1),
		).toBe(`files: ${printed} opened`)
		expect(calls).toContain(`files ${REVIEW_CHANGE_REQUEST_URL}`)
	})

	it.each([
		{ origin: 'a local origin', url: '/srv/git/repo.git', noun: 'change request' },
		{ origin: 'a GitHub origin', url: 'https://github.com/o/r.git', noun: 'pull request' },
	])(
		'a lot without a change request, $origin → the private half printed, lot land named with the $noun noun, the host never asked',
		({ url, noun }) => {
			const lot = reviewedLot()
			rmSync(join(lot.lotFolder, LANDING_FILE))
			git({ root: lot.workspace.repository, args: ['remote', 'set-url', 'origin', url] })
			const { host, calls } = recordingHost()

			const result = runLotReview({ cwd: lot.workspace.repository, argv: [LOT_NAME], host })

			expect(result.exitCode).toBe(0)
			const lines = result.output.split('\n')
			expect(lines[1]).toBe(`no ${noun} yet: dialecte lot land ${LOT_NAME} opens it`)
			expect(lines).toContain('  - R1-1 round 1 blocking open src/x.ts:1: x is wrong')
			expect(calls).toEqual([])
		},
	)

	it('an unknown option → usage, exit 2, the host never asked', () => {
		const lot = landedLot()
		const { host, calls } = recordingHost({ existing: lot.changeRequest })

		const result = runLotReview({
			cwd: lot.workspace.repository,
			argv: [LOT_NAME, '--open-all'],
			host,
		})

		expect(result.exitCode).toBe(2)
		expect(result.output).toContain('review <id> [--no-open]')
		expect(calls).toEqual([])
	})
})

describe(
	'dialecte lot review: the tests line of a seeded gate part',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it('a gate part with no mode and one unknown entry → the tests line names the unknown failure, never a null mode', () => {
			const lot = landedLot()
			const unknown = 'tests.json did not read (it holds no object): its failures cannot be told'
			writeFileSync(
				join(lot.lotFolder, STORE_FILES.tests),
				JSON.stringify({
					schema: 1,
					gate: {
						mode: null,
						at: 'T1',
						head: lot.head,
						stateHash: '9'.repeat(64),
						failures: [{ key: null, unknown, at: 'T1' }],
					},
				}),
			)
			const { host } = recordingHost({ existing: lot.changeRequest })

			const result = runLotReview({
				cwd: lot.workspace.repository,
				argv: [LOT_NAME, '--no-open'],
				host,
			})

			expect(result.output.split('\n').find((line) => line.startsWith('tests: '))).toBe(
				`tests: tdd not recorded · gate: ${unknown}: only a whole-suite pass clears it`,
			)
		})

		it('a gate part whose ledger is no list → the tests line names the unreadable field, no crash', () => {
			const lot = landedLot()
			writeFileSync(
				join(lot.lotFolder, STORE_FILES.tests),
				JSON.stringify({
					schema: 1,
					gate: { mode: null, at: 'T1', head: lot.head, stateHash: '9'.repeat(64), failures: {} },
				}),
			)
			const { host } = recordingHost({ existing: lot.changeRequest })

			const result = runLotReview({
				cwd: lot.workspace.repository,
				argv: [LOT_NAME, '--no-open'],
				host,
			})

			expect(result.output.split('\n').find((line) => line.startsWith('tests: '))).toBe(
				'tests: tests.json cannot be read: its field failures holds what no writer writes',
			)
		})
	},
)
