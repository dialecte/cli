/**
 * `review.jsonl` read from its sources as they are on disk (33CI CI2a): a finding's `file` only when git lists it as
 * a file of the lot's tree, a hand-written ledger row read cell by cell, a folder without a lot, a record that cannot
 * be written, a station end retried after a crash, and the free words that reach a verdict row.
 */
import { appendFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { lotWithStory } from '../../test/late-fixes-workspace.ts'
import { station } from '../../test/lot-station-workspace.ts'
import { NIT_ROW, PRIVATE_TEXT, TREE_FILE } from '../../test/review-record-workspace.constants.ts'
import {
	finding,
	lotVerb,
	reviewedLot,
	reviewRowsOf,
	reviewTextOf,
} from '../../test/review-record-workspace.ts'
import { git, temporaryFolder, writeFiles } from '../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { STORE_FILES } from '../lib/store/store.constants.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** The row of an open nit of round 1 that names no file. */
const NIT_ROW_NO_FILE = {
	schema: 1,
	kind: 'finding',
	id: 'R1-1',
	round: 1,
	severity: 'nit',
	state: 'open',
}

describe('review.jsonl - the file of a finding', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('--at a file on disk that git ignores -> the row has no file', () => {
		const lot = reviewedLot()
		writeFiles({ root: lot.cwd, files: { '.gitignore': 'notes/\n', 'notes/plan.md': '# plan\n' } })

		finding({ lot, severity: 'nit', at: 'notes/plan.md:3' })

		expect(reviewRowsOf(lot.lotFolder)).toEqual([NIT_ROW_NO_FILE])
	})

	it('--at ./ and a tree file -> the row names the file without ./', () => {
		const lot = reviewedLot()

		finding({ lot, severity: 'nit', at: `./${TREE_FILE}:3` })

		expect(reviewRowsOf(lot.lotFolder)).toEqual([NIT_ROW])
	})

	it('--at a committed file the lot deleted from disk -> the row keeps the file', () => {
		const lot = reviewedLot()
		git({ root: lot.cwd, args: ['add', TREE_FILE] })
		git({ root: lot.cwd, args: ['commit', '-q', '-m', 'reviewed'] })
		rmSync(join(lot.cwd, TREE_FILE))

		finding({ lot, severity: 'nit', at: `${TREE_FILE}:3` })

		expect(reviewRowsOf(lot.lotFolder)).toEqual([NIT_ROW])
	})

	it('a hand-over folder with no lot -> the rows written, none with a file', () => {
		const lot = reviewedLot()
		const folder = temporaryFolder('review-handover-')

		finding({ lot, severity: 'nit', at: `${TREE_FILE}:3`, folder })

		expect(reviewRowsOf(folder)).toEqual([NIT_ROW_NO_FILE])
	})

	it('a finding and an --at holding a | -> the row read whole, never the text', () => {
		const lot = reviewedLot()

		finding({ lot, severity: 'nit', at: `${TREE_FILE}:3|4`, text: `${PRIVATE_TEXT} | more` })

		expect({
			rows: reviewRowsOf(lot.lotFolder),
			leaks: reviewTextOf(lot.lotFolder).includes(PRIVATE_TEXT),
		}).toEqual({ rows: [NIT_ROW_NO_FILE], leaks: false })
	})
})

describe('review.jsonl - a hand-written ledger row', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('an unescaped | inside the finding -> the state read from the last cell', () => {
		const lot = reviewedLot()
		finding({ lot, severity: 'nit', at: `${TREE_FILE}:3` })
		const ledger = join(lot.lotFolder, 'findings-ledger.md')
		writeFileSync(
			ledger,
			`${readFileSync(ledger, 'utf8').trimEnd()}\n| I-1 | 2 | nit | ${TREE_FILE}:9 | see a | open later | fixed 3 |\n`,
		)

		lotVerb({ lot, verb: 'decide', words: ['R1-1', 'open'] })

		expect(reviewRowsOf(lot.lotFolder)).toEqual([
			NIT_ROW,
			{
				schema: 1,
				kind: 'finding',
				id: 'I-1',
				round: 2,
				severity: 'nit',
				file: TREE_FILE,
				state: 'fixed',
				closedBy: { round: 3 },
			},
		])
	})
})

describe('review.jsonl - writing it', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a review.jsonl that cannot be written -> exit 0, the finding line, then the ! line', () => {
		const lot = reviewedLot()
		mkdirSync(join(lot.lotFolder, STORE_FILES.review, 'blocked'), { recursive: true })

		const result = finding({ lot, severity: 'nit', at: `${TREE_FILE}:3` })

		expect({ exitCode: result.exitCode, lines: result.output.trimEnd().split('\n') }).toEqual({
			exitCode: 0,
			lines: [
				expect.stringMatching(/^lot finding: R1-1 open - /),
				expect.stringMatching(/^! review\.jsonl not written: /),
			],
		})
	})

	it('a review station end retried after review.jsonl was lost -> already recorded, the record written again', () => {
		const lot = reviewedLot()
		const words = ['end', 'reviewer', '--round', '1', '--verdict', 'approve']
		station(lot, words)
		rmSync(join(lot.lotFolder, STORE_FILES.review))

		station(lot, words)

		expect(reviewRowsOf(lot.lotFolder)).toEqual([
			expect.objectContaining({ kind: 'verdict', verdict: 'approve' }),
		])
	})
})

describe('review.jsonl - the free words of a verdict', { timeout: STORE_CASE_TIMEOUT }, () => {
	for (const by of ['per plans/review/BRIEF.md', 'see https://example.org/x'])
		it(`lot verify --by "${by}" -> exit 2, --by holds a path or a link, nothing written`, () => {
			const lot = lotWithStory([{ snapshot: 1 }])

			const result = lotVerb({ lot, verb: 'verify', words: ['--by', by, '--note', 'checked'] })

			expect({ result, review: reviewTextOf(lot.lotFolder) }).toEqual({
				result: {
					exitCode: 2,
					output: 'lot verify: --by holds a path or a link: nothing written',
				},
				review: '',
			})
		})

	it('a station model holding a path -> the row without the model, the vendor kept', () => {
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
			'plans/model.md',
		])

		expect(reviewRowsOf(lot.lotFolder)).toEqual([
			expect.not.objectContaining({ model: expect.anything() }),
		])
	})
})

describe(
	'review.jsonl - sources written by hand or by an older cli',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it('a verify line whose by holds a path -> its verdict row names no one', () => {
			const lot = reviewedLot()
			appendFileSync(
				join(lot.lotFolder, STORE_FILES.verify),
				`${JSON.stringify({ schema: 1, at: '2026-11-16T10:00:00.000Z', by: 'per plans/x/BRIEF.md', note: PRIVATE_TEXT, state: 'a'.repeat(64) })}\n`,
			)

			finding({ lot, severity: 'nit', at: `${TREE_FILE}:3` })

			expect(reviewRowsOf(lot.lotFolder)).toEqual([
				NIT_ROW,
				{
					schema: 1,
					kind: 'verdict',
					at: '2026-11-16T10:00:00.000Z',
					by: { kind: 'verify' },
					verdict: 'verified',
				},
			])
		})

		it('a review station end whose verdict is no station verdict -> no verdict row', () => {
			const lot = reviewedLot()
			station(lot, ['end', 'reviewer', '--round', '1', '--verdict', 'approve'])
			const events = join(lot.lotFolder, STORE_FILES.events)
			writeFileSync(events, readFileSync(events, 'utf8').replace('"approve"', '"see plans/x.md"'))

			finding({ lot, severity: 'nit', at: `${TREE_FILE}:3` })

			expect(reviewRowsOf(lot.lotFolder)).toEqual([NIT_ROW])
		})
	},
)
