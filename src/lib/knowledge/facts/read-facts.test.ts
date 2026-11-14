import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { keyOfDraft } from '../../../../test/fact-check-fixtures.ts'
import {
	factDraft,
	readFactFile,
	readHistoryFile,
	readPointerText,
	writeFactFile,
} from '../../../../test/fact-fixtures.ts'
import { snapshotOfFolder } from '../../../../test/fact-folder-snapshot.ts'
import { READ_NAMES } from '../../../../test/read-via.constants.ts'
import { readVia } from '../../../../test/read-via.ts'
import { temporaryFolder } from '../../../../test/scratch-repository.ts'
import { currentFact, listFacts, readFact } from './read-facts.ts'
import { recordFact } from './record-fact.ts'

import { describe, expect, it, vi } from 'vitest'

import type { CheckOutcome, FactDraft, FactStoredState, FactView } from './facts.types.ts'

const NOW = new Date('2026-11-11T10:00:00.000Z')

const SECOND_ANSWER = { verdict: 'no', value: null, text: 'D is optional in A.' }

/** A seam that stops the record as a crash would. */
function crash(): never {
	throw new Error('crash')
}

/** What a view of the ledger shows of each fact, in the shape the cases compare. */
function summaryOf(views: readonly FactView[]): Array<[string, string, boolean]> {
	return views.map((view) => [view.id, view.state, view.current])
}

describe('reads: a fact published and no pointer swapped (crash) → an orphan', () => {
	it('a crash after the publish of a first record → no current fact, the file listed orphan, nothing written', () => {
		const folder = temporaryFolder('facts-read-orphan-')
		const draft = factDraft()
		expect(() =>
			recordFact({ folder, draft, now: () => NOW, seams: { afterPublish: crash } }),
		).toThrow('crash')
		const before = snapshotOfFolder({ folder })

		expect({
			current: currentFact({ folder, key: keyOfDraft(draft) }),
			listed: summaryOf(listFacts({ folder })),
			unchanged: snapshotOfFolder({ folder }),
		}).toEqual({ current: undefined, listed: [['F-0001', 'orphan', false]], unchanged: before })
	})

	it('a crash after the publish of a replacement → the earlier fact stays current, the new file is orphan', () => {
		const folder = temporaryFolder('facts-read-orphan-replacement-')
		const draft = factDraft()
		recordFact({ folder, draft, now: () => NOW })
		expect(() =>
			recordFact({
				folder,
				draft: factDraft({ effort: 'high', answer: SECOND_ANSWER }),
				now: () => NOW,
				seams: { afterPublish: crash },
			}),
		).toThrow('crash')
		const before = snapshotOfFolder({ folder })

		expect({
			current: currentFact({ folder, key: keyOfDraft(draft) })?.id,
			listed: summaryOf(listFacts({ folder })),
			unchanged: snapshotOfFolder({ folder }),
		}).toEqual({
			unchanged: before,
			current: 'F-0001',
			listed: [
				['F-0001', 'valid', true],
				['F-0002', 'orphan', false],
			],
		})
	})
})

/** A ledger whose key's previous fact F-0001 lacks `supersededBy` while the pointer names F-0002. */
type BrokenLedger = { folder: string; key: string }

/** The crash after the pointer swap of a replacement (case 16d). */
function crashedAfterPointer(): BrokenLedger {
	const folder = temporaryFolder('facts-read-repair-crash-')
	const draft = factDraft()
	recordFact({ folder, draft, now: () => NOW })
	expect(() =>
		recordFact({
			folder,
			draft: factDraft({ effort: 'high', answer: SECOND_ANSWER }),
			now: () => NOW,
			seams: { afterPointer: crash },
		}),
	).toThrow('crash')
	return { folder, key: keyOfDraft(draft) }
}

/** Two writers of one key at once: the loser of case 16 holds no `supersededBy`. */
function twoWritersOfOneKey(): BrokenLedger {
	const folder = temporaryFolder('facts-read-repair-race-')
	const draft = factDraft()
	recordFact({
		folder,
		draft,
		now: () => NOW,
		seams: {
			afterDecide: () => {
				recordFact({ folder, draft: factDraft({ answer: SECOND_ANSWER }), now: () => NOW })
			},
		},
	})
	return { folder, key: keyOfDraft(draft) }
}

/** D9b: the key read follows the pointer only, so it repairs the crash case but leaves a race loser to the other reads. */
function readsRepairing(setup: () => BrokenLedger): readonly (typeof READ_NAMES)[number][] {
	return setup === twoWritersOfOneKey
		? READ_NAMES.filter((name) => name !== 'currentFact')
		: READ_NAMES
}

describe('reads: a race loser is left by the key read, repaired by the next list read (D9b)', () => {
	it('currentFact leaves F-0001 untouched; a following listFacts gives it supersededBy F-0002 and a repaired line', () => {
		const { folder, key } = twoWritersOfOneKey()
		const before = {
			fact: readFactFile({ folder, id: 'F-0001' }),
			history: readHistoryFile({ folder, id: 'F-0001' }),
		}

		expect(currentFact({ folder, key })?.id).toBe('F-0002')
		const afterKeyRead = {
			fact: readFactFile({ folder, id: 'F-0001' }),
			history: readHistoryFile({ folder, id: 'F-0001' }),
		}
		expect(listFacts({ folder })).toHaveLength(2)

		expect({
			untouchedByKeyRead: afterKeyRead,
			repaired: readFactFile({ folder, id: 'F-0001' }),
			events: readHistoryFile({ folder, id: 'F-0001' }).map((line) => line.event),
		}).toEqual({
			untouchedByKeyRead: before,
			repaired: { ...before.fact, supersededBy: 'F-0002' },
			events: ['created', 'superseded'],
		})
	})
})

describe('reads: the previous fact without supersededBy is repaired once', () => {
	const scenarios: Record<string, () => BrokenLedger> = {
		'a crash after the pointer swap': crashedAfterPointer,
		'the loser of two writers of one key': twoWritersOfOneKey,
	}
	for (const [scenario, setup] of Object.entries(scenarios))
		for (const readName of readsRepairing(setup))
			it(`${scenario}, read by ${readName} → supersededBy F-0002 and one repaired superseded line, none on a second read`, () => {
				const { folder, key } = setup()
				const before = readFactFile({ folder, id: 'F-0001' })
				expect(before.supersededBy).toBeNull()

				expect(readVia({ name: readName, folder, key })).not.toHaveLength(0)
				const afterFirst = {
					fact: readFactFile({ folder, id: 'F-0001' }),
					history: readHistoryFile({ folder, id: 'F-0001' }),
				}
				expect(readVia({ name: readName, folder, key })).not.toHaveLength(0)

				expect({
					fact: afterFirst.fact,
					events: afterFirst.history.map((line) => line.event),
					repairedLine: afterFirst.history.at(-1),
					afterSecond: readHistoryFile({ folder, id: 'F-0001' }).length,
					factAfterSecond: readFactFile({ folder, id: 'F-0001' }),
				}).toEqual({
					fact: { ...before, supersededBy: 'F-0002' },
					events: ['created', 'superseded'],
					repairedLine: expect.objectContaining({
						event: 'superseded',
						fact: 'F-0001',
						supersededBy: 'F-0002',
						repaired: true,
					}),
					afterSecond: 2,
					factAfterSecond: { ...before, supersededBy: 'F-0002' },
				})
			})
})

describe('reads: a pointer that dangles → no current fact, nothing written, the next record repairs it', () => {
	const draft = factDraft()
	const key = keyOfDraft(draft)

	/** A ledger holding F-0001 (the key's) and F-0002 (another key's), then the key's pointer rewritten. */
	function ledgerWithPointer(params: { pointer: string }): string {
		const folder = temporaryFolder('facts-read-dangling-')
		recordFact({ folder, draft, now: () => NOW })
		recordFact({ folder, draft: factDraft({ question: 'Is DD_1 required in D?' }), now: () => NOW })
		writeFileSync(join(folder, 'by-key', key), params.pointer)
		return folder
	}

	const pointers: Record<string, string> = {
		'a pointer naming a missing fact': 'F-0009\n',
		"a pointer naming another key's fact": 'F-0002\n',
		'a pointer holding garbage': 'not an id at all\u0000\n',
	}

	for (const [name, pointer] of Object.entries(pointers)) {
		it(`${name} → currentFact undefined, the folder untouched by the read`, () => {
			const folder = ledgerWithPointer({ pointer })
			const before = snapshotOfFolder({ folder })

			expect({
				current: currentFact({ folder, key }),
				unchanged: snapshotOfFolder({ folder }),
			}).toEqual({ current: undefined, unchanged: before })
		})

		it(`${name} → the next record of the key is created (previous null) and repairs the pointer`, () => {
			const folder = ledgerWithPointer({ pointer })

			expect({
				outcome: recordFact({ folder, draft, now: () => NOW }),
				pointer: readPointerText({ folder, key }),
				current: currentFact({ folder, key })?.id,
			}).toEqual({
				outcome: { outcome: 'created', id: 'F-0003', previous: null },
				pointer: 'F-0003\n',
				current: 'F-0003',
			})
		})
	}
})

describe('reads: a fact file that is not JSON → unreadable, never an answer, never a throw', () => {
	const files: Record<string, string> = {
		'plain text': 'this is not json',
		'a truncated object': '{"id": "F-0001", "question": "Is D',
		'an empty file': '',
	}

	for (const [name, text] of Object.entries(files))
		it(`${name} → readFact: unreadable with no fact; currentFact of a pointer naming it: undefined`, () => {
			const folder = temporaryFolder('facts-read-unreadable-')
			const draft = factDraft()
			recordFact({ folder, draft, now: () => NOW })
			writeFileSync(join(folder, 'F-0001.json'), text)

			expect({
				view: readFact({ folder, id: 'F-0001' }),
				current: currentFact({ folder, key: keyOfDraft(draft) }),
				listed: summaryOf(listFacts({ folder })),
			}).toEqual({
				view: {
					id: 'F-0001',
					path: join(folder, 'F-0001.json'),
					fact: undefined,
					state: 'unreadable',
					current: false,
				},
				current: undefined,
				listed: [['F-0001', 'unreadable', false]],
			})
		})

	it('an id with no file → readFact undefined', () => {
		const folder = temporaryFolder('facts-read-missing-')
		recordFact({ folder, draft: factDraft(), now: () => NOW })

		expect(readFact({ folder, id: 'F-0042' })).toBeUndefined()
	})
})

const OLD_SOURCES = factDraft().sources
const NEW_SOURCES = [{ kind: 'standard', standard: 'example-0000', files: 'sha256:bb' }]

/** One row of the invalidation: what the check says of a valid fact, and what the reads then show and write. */
type InvalidationRow = {
	outcome: CheckOutcome
	viewState: string
	fileState: FactStoredState
	/** The sources the fact file holds after the reads. */
	sources: typeof OLD_SOURCES
	/** The history after two reads: each event, a `rechecked` one with its `from` and `to`. */
	history: unknown[]
}

describe('reads: invalidation of a valid fact by the injected check', () => {
	const rows: Record<string, InvalidationRow> = {
		'stale → the state becomes stale, one stale line, none on a second read': {
			outcome: { state: 'stale' },
			viewState: 'stale',
			fileState: 'stale',
			sources: OLD_SOURCES,
			history: [{ event: 'created' }, { event: 'stale' }],
		},
		'unverifiable → shown unverifiable, the file unchanged, no line': {
			outcome: { state: 'unverifiable' },
			viewState: 'unverifiable',
			fileState: 'valid',
			sources: OLD_SOURCES,
			history: [{ event: 'created' }],
		},
		'valid with other sources → sources rewritten, one rechecked line { from, to }': {
			outcome: { state: 'valid', sources: NEW_SOURCES },
			viewState: 'valid',
			fileState: 'valid',
			sources: NEW_SOURCES,
			history: [{ event: 'created' }, { event: 'rechecked', from: OLD_SOURCES, to: NEW_SOURCES }],
		},
		'valid with the same sources → nothing written': {
			outcome: { state: 'valid', sources: OLD_SOURCES },
			viewState: 'valid',
			fileState: 'valid',
			sources: OLD_SOURCES,
			history: [{ event: 'created' }],
		},
	}

	for (const [name, row] of Object.entries(rows))
		for (const readName of READ_NAMES)
			it(`${name}, read by ${readName}`, () => {
				const folder = temporaryFolder('facts-read-invalidation-')
				const draft = factDraft()
				recordFact({ folder, draft, now: () => NOW })
				const key = keyOfDraft(draft)
				const before = readFactFile({ folder, id: 'F-0001' })
				function check(): CheckOutcome {
					return row.outcome
				}

				expect(readVia({ name: readName, folder, key, check }).map((view) => view.state)).toEqual([
					row.viewState,
				])
				expect(readVia({ name: readName, folder, key, check })).toHaveLength(1)

				expect({
					fact: readFactFile({ folder, id: 'F-0001' }),
					history: readHistoryFile({ folder, id: 'F-0001' }).map((line) =>
						line.event === 'rechecked'
							? { event: line.event, from: line.from, to: line.to }
							: { event: line.event },
					),
				}).toEqual({
					fact: {
						...before,
						state: row.fileState,
						sources: row.sources,
					},
					history: row.history,
				})
			})

	for (const readName of READ_NAMES)
		it(`an unverifiable fact leaves the whole folder as it was, read by ${readName}`, () => {
			const folder = temporaryFolder('facts-read-unverifiable-')
			const draft = factDraft()
			recordFact({ folder, draft, now: () => NOW })
			const before = snapshotOfFolder({ folder })

			expect(
				readVia({
					name: readName,
					folder,
					key: keyOfDraft(draft),
					check: () => ({ state: 'unverifiable' }),
				}),
			).toHaveLength(1)

			expect(snapshotOfFolder({ folder })).toEqual(before)
		})
})

describe('reads: the check is called for a valid checked fact only', () => {
	type CallRow = { draft: FactDraft; called: boolean }
	type StoredCallRow = { draft: FactDraft; storedState: FactStoredState; called: boolean }

	/** Records the draft, rewrites its file to the stored state when there is one, reads it and tells if the check ran. */
	function checkWasCalled(parameters: {
		draft: FactDraft
		storedState?: FactStoredState
		readName: (typeof READ_NAMES)[number]
	}): boolean {
		const { draft, storedState, readName } = parameters
		const folder = temporaryFolder('facts-read-check-calls-')
		recordFact({ folder, draft, now: () => NOW })
		if (storedState !== undefined)
			writeFactFile({
				folder,
				fact: { ...readFactFile({ folder, id: 'F-0001' }), state: storedState },
			})
		const check = vi.fn((): CheckOutcome => ({ state: 'valid' }))

		expect(readVia({ name: readName, folder, key: keyOfDraft(draft), check })).toHaveLength(1)

		return check.mock.calls.length > 0
	}

	const rows: Record<string, CallRow> = {
		'a valid standard fact → called (the control)': { draft: factDraft(), called: true },
		'a person fact → never called': {
			draft: factDraft({ source: 'person', sources: [] }),
			called: false,
		},
		'an unchecked (outside) fact → never called': {
			draft: factDraft({
				source: 'outside',
				sources: [{ kind: 'outside', url: 'https://example.com' }],
			}),
			called: false,
		},
	}

	const storedRows: Record<string, StoredCallRow> = {
		'a forgotten fact → never called': {
			draft: factDraft(),
			storedState: 'forgotten',
			called: false,
		},
		'a stale fact → never called': { draft: factDraft(), storedState: 'stale', called: false },
	}

	for (const [name, row] of Object.entries(rows))
		for (const readName of READ_NAMES)
			it(`${name}, read by ${readName}`, () => {
				expect(checkWasCalled({ draft: row.draft, readName })).toBe(row.called)
			})

	for (const [name, row] of Object.entries(storedRows))
		for (const readName of READ_NAMES)
			it(`${name}, read by ${readName}`, () => {
				expect(checkWasCalled({ draft: row.draft, storedState: row.storedState, readName })).toBe(
					row.called,
				)
			})

	it('a fact file is never created by a read of an empty ledger', () => {
		const folder = temporaryFolder('facts-read-empty-')

		expect({
			listed: listFacts({ folder }),
			current: currentFact({ folder, key: keyOfDraft(factDraft()) }),
			made: existsSync(join(folder, 'F-0001.json')),
		}).toEqual({ listed: [], current: undefined, made: false })
	})
})
