/** Review round 1 of the record: a stale check replaces (R1-1), lines are cut to fit (R1-3), a change re-reads the file (R1-5), the members' order (R1-10). */
import {
	factDraft,
	readFactFile,
	readHistoryFile,
	readPointerText,
	writeFactFile,
} from '../../../../test/fact-fixtures.ts'
import { temporaryFolder } from '../../../../test/scratch-repository.ts'
import { factKeyOf } from './fact-key.ts'
import { historyLineOf, markSuperseded, recordFact, updateFact } from './record-fact.ts'

import { describe, expect, it } from 'vitest'

import type { FactDraft } from './facts.types.ts'

const NOW = new Date('2026-11-11T10:00:00.000Z')
const SECOND_ANSWER = { verdict: 'no', value: null, text: 'D is optional in A.' }

describe('recordFact: a check that says stale (R1-1, D10b)', () => {
	it('current valid standard medium, the check says stale, new standard medium → replaced: the old file stale and superseded, its history created, stale, superseded', () => {
		const folder = temporaryFolder('facts-stale-by-check-')
		const draft = factDraft()
		recordFact({ folder, draft, lot: '0025', ask: 'q1', now: () => NOW })
		const before = readFactFile({ folder, id: 'F-0001' })

		const outcome = recordFact({
			folder,
			draft: factDraft({ answer: SECOND_ANSWER }),
			lot: '0025',
			ask: 'q2',
			now: () => NOW,
			check: () => ({ state: 'stale' }),
		})

		expect(outcome).toEqual({ outcome: 'replaced', id: 'F-0002', previous: 'F-0001' })
		expect({
			oldFact: readFactFile({ folder, id: 'F-0001' }),
			oldEvents: readHistoryFile({ folder, id: 'F-0001' }).map((line) => line.event),
			pointer: readPointerText({
				folder,
				key: factKeyOf({
					question: draft.question,
					subject: draft.subject,
					kind: draft.kind,
					package: draft.subject.package,
				}),
			}),
			supersedes: readFactFile({ folder, id: 'F-0002' }).supersedes,
		}).toEqual({
			oldFact: { ...before, state: 'stale', supersededBy: 'F-0002' },
			oldEvents: ['created', 'stale', 'superseded'],
			pointer: 'F-0002\n',
			supersedes: 'F-0001',
		})
	})
})

describe('recordFact: a history line that would pass 4,096 bytes is cut, never refused (R1-3)', () => {
	const rows: Record<string, { lot?: string; ask?: string; member: 'lot' | 'ask' }> = {
		'a 5,000-character ask': { ask: 'q'.repeat(5000), member: 'ask' },
		'a 5,000-character lot': { lot: 'l'.repeat(5000), member: 'lot' },
	}

	for (const [name, row] of Object.entries(rows))
		it(`${name} → the created line fits, the member is cut at 200 characters, cut: true`, () => {
			const folder = temporaryFolder('facts-cut-line-')

			expect(
				recordFact({ folder, draft: factDraft(), lot: row.lot, ask: row.ask, now: () => NOW }),
			).toMatchObject({ outcome: 'created', id: 'F-0001' })

			const lines = readHistoryFile({ folder, id: 'F-0001' })
			expect({
				events: lines.map((written) => written.event),
				fits: Buffer.byteLength(`${JSON.stringify(lines[0])}\n`) <= 4096,
				cut: lines[0]?.cut,
				length: String(lines[0]?.[row.member]).length,
			}).toEqual({ events: ['created'], fits: true, cut: true, length: 200 })
		})
})

describe('updateFact: it replaces the copy on disk, not an earlier snapshot (R1-5)', () => {
	const context = { at: NOW.toISOString(), lot: null, ask: null }

	it('the fact forgotten on disk after it was read, then marked superseded from the earlier copy → the file keeps forgotten and gains supersededBy', () => {
		const folder = temporaryFolder('facts-reread-forgotten-')
		recordFact({ folder, draft: factDraft(), now: () => NOW })
		const earlier = readFactFile({ folder, id: 'F-0001' })
		writeFactFile({ folder, fact: { ...earlier, state: 'forgotten' } })

		markSuperseded({ folder, fact: earlier, by: 'F-0002', line: context })

		expect(readFactFile({ folder, id: 'F-0001' })).toEqual({
			...earlier,
			state: 'forgotten',
			supersededBy: 'F-0002',
		})
	})

	it('supersededBy written on disk after it was read, then the state changed from the earlier copy → the file keeps supersededBy and gains the state', () => {
		const folder = temporaryFolder('facts-reread-superseded-')
		recordFact({ folder, draft: factDraft(), now: () => NOW })
		const earlier = readFactFile({ folder, id: 'F-0001' })
		writeFactFile({ folder, fact: { ...earlier, supersededBy: 'F-0002' } })

		updateFact({
			folder,
			fact: earlier,
			changes: { state: 'stale' },
			line: historyLineOf({ context, event: 'stale', fact: 'F-0001' }),
		})

		expect(readFactFile({ folder, id: 'F-0001' })).toEqual({
			...earlier,
			state: 'stale',
			supersededBy: 'F-0002',
		})
	})
})

describe("recordFact: a fact file's members follow the ledger's order (R1-10)", () => {
	const SHAPE = [
		'id',
		'key',
		'question',
		'subject',
		'kind',
		'answer',
		'source',
		'effort',
		'evidence',
		'by',
		'sources',
		'at',
		'state',
		'supersedes',
		'supersededBy',
	]

	/** A draft whose members come in another order than the ledger's. */
	function scrambledDraft(): FactDraft {
		const { sources, by, evidence, effort, source, answer, kind, subject, question } = factDraft()
		return { sources, by, evidence, effort, source, answer, kind, subject, question }
	}

	it('a draft given with its members in another order → the file lists them in the ledger order', () => {
		const folder = temporaryFolder('facts-order-')

		recordFact({ folder, draft: scrambledDraft(), now: () => NOW })

		expect(Object.keys(readFactFile({ folder, id: 'F-0001' }))).toEqual(SHAPE)
	})

	it('a person fact with unchecked: true → unchecked comes right after state', () => {
		const folder = temporaryFolder('facts-order-unchecked-')

		recordFact({
			folder,
			draft: { ...factDraft({ source: 'person', sources: [] }), unchecked: true },
			now: () => NOW,
		})

		expect(Object.keys(readFactFile({ folder, id: 'F-0001' }))).toEqual([
			...SHAPE.slice(0, SHAPE.indexOf('state') + 1),
			'unchecked',
			'supersedes',
			'supersededBy',
		])
	})
})
