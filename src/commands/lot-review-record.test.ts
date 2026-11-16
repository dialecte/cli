/**
 * `review.jsonl` (33CI CI2a): the public rows of a lot's review, written whole by the verbs that change one of its
 * sources - `lot finding` and `lot decide` (the findings ledger), `lot station end` of a review station (`events.jsonl`),
 * `lot verify` (`verify.jsonl`). A finding row never holds the finding's text, a fix's note, an acceptance's reason
 * or a logged finding's where; a verdict row never holds a verify note. Each case runs on a scratch store lot whose
 * repository is its worktree.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { SNAPSHOT_TIME } from '../../test/late-fixes-workspace.constants.ts'
import { lotWithStory } from '../../test/late-fixes-workspace.ts'
import { eventsOf, station } from '../../test/lot-station-workspace.ts'
import { NIT_ROW, PRIVATE_TEXT, TREE_FILE } from '../../test/review-record-workspace.constants.ts'
import {
	finding,
	lotVerb,
	reviewedLot,
	reviewRowsOf,
	reviewTextOf,
} from '../../test/review-record-workspace.ts'
import { writeFiles } from '../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

describe('review.jsonl - findings', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('lot finding -> one open finding row: id, round, severity, file; no text', () => {
		const lot = reviewedLot()

		finding({ lot, severity: 'should-fix', at: `${TREE_FILE}:3` })

		expect(reviewRowsOf(lot.lotFolder)).toEqual([
			{
				schema: 1,
				kind: 'finding',
				id: 'R1-1',
				round: 1,
				severity: 'should-fix',
				file: TREE_FILE,
				state: 'open',
			},
		])
	})

	it('lot decide fixed in a later round with a note -> state fixed, closedBy that round; never the note', () => {
		const lot = reviewedLot()
		finding({ lot, severity: 'blocking', at: `${TREE_FILE}:3` })

		lotVerb({ lot, verb: 'decide', words: ['R1-1', 'fixed', '2', PRIVATE_TEXT] })

		expect({
			rows: reviewRowsOf(lot.lotFolder),
			leaks: reviewTextOf(lot.lotFolder).includes(PRIVATE_TEXT),
		}).toEqual({
			rows: [
				{
					schema: 1,
					kind: 'finding',
					id: 'R1-1',
					round: 1,
					severity: 'blocking',
					file: TREE_FILE,
					state: 'fixed',
					closedBy: { round: 2 },
				},
			],
			leaks: false,
		})
	})

	for (const [state, words] of [
		['accepted', ['accepted', PRIVATE_TEXT]],
		['logged', ['logged', PRIVATE_TEXT]],
		['fix-to-verify', ['fix-to-verify']],
	] as const)
		it(`lot decide ${state} -> state ${state}, no closedBy, never the reason or where`, () => {
			const lot = reviewedLot()
			finding({ lot, severity: 'nit', at: `${TREE_FILE}:3` })

			lotVerb({ lot, verb: 'decide', words: ['R1-1', ...words] })

			expect({
				rows: reviewRowsOf(lot.lotFolder),
				leaks: reviewTextOf(lot.lotFolder).includes(PRIVATE_TEXT),
			}).toEqual({
				rows: [
					{
						schema: 1,
						kind: 'finding',
						id: 'R1-1',
						round: 1,
						severity: 'nit',
						file: TREE_FILE,
						state,
					},
				],
				leaks: false,
			})
		})

	for (const at of [
		'../plan/BRIEF.md:12',
		'/tmp/elsewhere/reviewed.ts:3',
		'plans/not-in-the-tree.md:40',
		`${TREE_FILE}:3, src/other.ts:4`,
	])
		it(`--at ${at} (not a file of the lot's tree) -> the row has no file`, () => {
			const lot = reviewedLot()

			finding({ lot, severity: 'nit', at })

			expect(reviewRowsOf(lot.lotFolder)).toEqual([
				{ schema: 1, kind: 'finding', id: 'R1-1', round: 1, severity: 'nit', state: 'open' },
			])
		})

	it('a hand-written row with an unreadable severity and state -> those cells left out, the row kept', () => {
		const lot = reviewedLot()
		finding({ lot, severity: 'nit', at: `${TREE_FILE}:3` })
		const ledger = join(lot.lotFolder, 'findings-ledger.md')
		writeFileSync(
			ledger,
			`${readFileSync(ledger, 'utf8').trimEnd()}\n| I-1 | 2 | major | ${TREE_FILE}:9 | ${PRIVATE_TEXT} | done by hand |\n`,
		)

		lotVerb({ lot, verb: 'decide', words: ['R1-1', 'open'] })

		expect(reviewRowsOf(lot.lotFolder)).toEqual([
			{
				schema: 1,
				kind: 'finding',
				id: 'R1-1',
				round: 1,
				severity: 'nit',
				file: TREE_FILE,
				state: 'open',
			},
			{ schema: 1, kind: 'finding', id: 'I-1', round: 2, file: TREE_FILE },
		])
	})
})

describe('review.jsonl - verdicts', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a reviewer end with its round, an approve verdict, a vendor and a model -> one verdict row by the station', () => {
		const lot = reviewedLot()

		station(lot, [
			'end',
			'reviewer',
			'--round',
			'1',
			'--verdict',
			'approve',
			'--vendor',
			'anthropic',
			'--model',
			'opus',
		])

		expect(reviewRowsOf(lot.lotFolder)).toEqual([
			{
				schema: 1,
				kind: 'verdict',
				at: eventsOf(lot)[0].at,
				by: { kind: 'station', station: 'reviewer', round: 1 },
				vendor: 'anthropic',
				model: 'opus',
				verdict: 'approve',
			},
		])
	})

	it('the model given on the start, not on the end -> the row takes it from the start the end pairs with', () => {
		const lot = reviewedLot()
		const started = station(lot, ['start', 'independent-reviewer', '--model', 'opus', '--json'])

		station(lot, [
			'end',
			'independent-reviewer',
			'--run',
			JSON.parse(started.output).run,
			'--verdict',
			'approve',
		])

		expect(reviewRowsOf(lot.lotFolder)).toEqual([
			{
				schema: 1,
				kind: 'verdict',
				at: eventsOf(lot)[1].at,
				by: { kind: 'station', station: 'independent-reviewer' },
				model: 'opus',
				verdict: 'approve',
			},
		])
	})

	for (const verdict of ['failed', 'limit'])
		it(`a review station end with verdict ${verdict} (it runs again) -> the finding row alone, no verdict row`, () => {
			const lot = reviewedLot()
			finding({ lot, severity: 'nit', at: `${TREE_FILE}:3` })

			station(lot, ['end', 'reviewer', '--round', '1', '--verdict', verdict])

			expect(reviewRowsOf(lot.lotFolder)).toEqual([NIT_ROW])
		})

	it('a test-reviewer end with a verdict -> the finding row alone, no verdict row (the tests record holds it)', () => {
		const lot = reviewedLot()
		finding({ lot, severity: 'nit', at: `${TREE_FILE}:3` })

		station(lot, ['end', 'test-reviewer', '--step', '1', '--verdict', 'approve'])

		expect(reviewRowsOf(lot.lotFolder)).toEqual([NIT_ROW])
	})

	it('lot verify -> one verdict row by verify with its name, verdict verified; never the note', () => {
		const lot = lotWithStory([{ snapshot: 1 }])

		lotVerb({ lot, verb: 'verify', words: ['--by', 'person-a', '--note', PRIVATE_TEXT] })

		expect({
			rows: reviewRowsOf(lot.lotFolder),
			leaks: reviewTextOf(lot.lotFolder).includes(PRIVATE_TEXT),
		}).toEqual({
			rows: [
				{
					schema: 1,
					kind: 'verdict',
					at: SNAPSHOT_TIME.toISOString(),
					by: { kind: 'verify', name: 'person-a' },
					verdict: 'verified',
				},
			],
			leaks: false,
		})
	})

	it('findings and verdicts -> the findings in ledger order, then the verdicts by time', () => {
		const lot = lotWithStory([{ snapshot: 1 }])
		writeFiles({ root: lot.cwd, files: { [TREE_FILE]: 'export const reviewed = 2\n' } })
		station(lot, ['end', 'reviewer', '--round', '1', '--verdict', 'fix-then-repass'])
		finding({ lot, severity: 'blocking', at: `${TREE_FILE}:1` })
		finding({ lot, severity: 'nit', at: `${TREE_FILE}:2` })

		lotVerb({ lot, verb: 'verify', words: ['--by', 'person-a', '--note', PRIVATE_TEXT] })

		expect(
			reviewRowsOf(lot.lotFolder).map((row) => {
				const { kind, id, verdict } = row as { kind: string; id?: string; verdict?: string }
				return id ?? `${kind} ${verdict}`
			}),
		).toEqual(['R1-1', 'R1-2', 'verdict verified', 'verdict fix-then-repass'])
	})
})
