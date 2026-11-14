/** Late fixes after the independent review (R4-1): a stale fact keeps the check's reason in its history line. */
import { keyOfDraft } from '../../../../test/fact-check-fixtures.ts'
import { factDraft, readFactFile, readHistoryFile } from '../../../../test/fact-fixtures.ts'
import { READ_NAMES } from '../../../../test/read-via.constants.ts'
import { readVia } from '../../../../test/read-via.ts'
import { temporaryFolder } from '../../../../test/scratch-repository.ts'
import { recordFact } from './record-fact.ts'

import { describe, expect, it } from 'vitest'

import type { CheckOutcome } from './facts.types.ts'

const NOW = new Date('2026-11-11T10:00:00.000Z')
const STALE_REASON =
	'the files of standard example-0000 changed since the fact was recorded: ask the question again'

function staleWithReason(): CheckOutcome {
	return { state: 'stale', reason: STALE_REASON }
}

function neverCalled(): CheckOutcome {
	throw new Error('the check is never called for a stale fact')
}

describe('a stale fact keeps its reason', () => {
	for (const readName of READ_NAMES) {
		it(`the stale line holds the check's reason, read by ${readName}`, () => {
			const folder = temporaryFolder('facts-late-stale-line-')
			const draft = factDraft()
			recordFact({ folder, draft, now: () => NOW })

			readVia({ name: readName, folder, key: keyOfDraft(draft), check: staleWithReason })

			expect(
				readHistoryFile({ folder, id: 'F-0001' }).find((line) => line.event === 'stale'),
			).toMatchObject({ event: 'stale', fact: 'F-0001', reason: STALE_REASON })
		})

		it(`a later read with no check shows the stored reason, read by ${readName}`, () => {
			const folder = temporaryFolder('facts-late-stale-view-')
			const draft = factDraft()
			recordFact({ folder, draft, now: () => NOW })
			const key = keyOfDraft(draft)
			readVia({ name: readName, folder, key, check: staleWithReason })

			expect(readVia({ name: readName, folder, key })).toMatchObject([
				{ id: 'F-0001', state: 'stale', reason: STALE_REASON },
			])
		})

		it(`a later read whose check is never called for a stale fact shows the stored reason, read by ${readName}`, () => {
			const folder = temporaryFolder('facts-late-stale-check-')
			const draft = factDraft()
			recordFact({ folder, draft, now: () => NOW })
			const key = keyOfDraft(draft)
			readVia({ name: readName, folder, key, check: staleWithReason })

			expect(readVia({ name: readName, folder, key, check: neverCalled })).toMatchObject([
				{ id: 'F-0001', state: 'stale', reason: STALE_REASON },
			])
		})
	}

	it('a stale fact read twice writes the stale line once and keeps the fact as it was', () => {
		const folder = temporaryFolder('facts-late-stale-once-')
		const draft = factDraft()
		recordFact({ folder, draft, now: () => NOW })
		const key = keyOfDraft(draft)
		readVia({ name: 'currentFact', folder, key, check: staleWithReason })
		const afterFirst = readFactFile({ folder, id: 'F-0001' })

		readVia({ name: 'currentFact', folder, key })

		expect({
			fact: readFactFile({ folder, id: 'F-0001' }),
			staleLines: readHistoryFile({ folder, id: 'F-0001' }).filter(
				(line) => line.event === 'stale',
			),
		}).toMatchObject({ fact: afterFirst, staleLines: [{ reason: STALE_REASON }] })
	})

	it('a stale check without a reason keeps a stale line without one, and a later view says none', () => {
		const folder = temporaryFolder('facts-late-stale-bare-')
		const draft = factDraft()
		recordFact({ folder, draft, now: () => NOW })
		const key = keyOfDraft(draft)
		readVia({ name: 'currentFact', folder, key, check: () => ({ state: 'stale' }) })

		expect(readVia({ name: 'currentFact', folder, key })).toMatchObject([
			{ id: 'F-0001', state: 'stale' },
		])
		expect(readVia({ name: 'currentFact', folder, key })[0]).not.toHaveProperty('reason')
	})
})
