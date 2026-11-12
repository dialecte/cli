import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import {
	factDraft,
	readFactFile,
	readHistoryFile,
	readPointerText,
	writeFactFile,
} from '../../../../test/fact-fixtures.ts'
import { temporaryFolder } from '../../../../test/scratch-repository.ts'
import { factKeyOf } from './fact-key.ts'
import { recordFact } from './record-fact.ts'

import { describe, expect, it } from 'vitest'

import type { FactDraft, FactStoredState } from './facts.types.ts'

const NOW = new Date('2026-11-11T10:00:00.000Z')

/** The key of a draft, as the ledger derives it. */
function keyOfDraft(draft: FactDraft): string {
	return factKeyOf({
		question: draft.question,
		subject: draft.subject,
		kind: draft.kind,
		package: draft.subject.package,
	})
}

/** The same draft, another answer: the second writer's. */
const SECOND_ANSWER = { verdict: 'no', value: null, text: 'D is optional in A.' }

describe('recordFact: the first record of a key', () => {
	it('→ created F-0001: the fact file whole, the pointer, one created line', () => {
		const folder = temporaryFolder('facts-first-')
		const draft = factDraft()

		expect({
			outcome: recordFact({ folder, draft, lot: '0025', ask: 'q1', now: () => NOW }),
			fact: readFactFile({ folder, id: 'F-0001' }),
			pointer: readPointerText({ folder, key: keyOfDraft(draft) }),
			history: readHistoryFile({ folder, id: 'F-0001' }),
		}).toEqual({
			outcome: { outcome: 'created', id: 'F-0001', previous: null },
			fact: {
				...draft,
				id: 'F-0001',
				key: keyOfDraft(draft),
				at: NOW.toISOString(),
				state: 'valid',
				supersedes: null,
				supersededBy: null,
			},
			pointer: 'F-0001\n',
			history: [
				{ at: NOW.toISOString(), event: 'created', fact: 'F-0001', lot: '0025', ask: 'q1' },
			],
		})
	})

	it('an outside fact → stored unchecked', () => {
		const folder = temporaryFolder('facts-outside-')
		const draft = factDraft({
			source: 'outside',
			sources: [{ kind: 'outside', url: 'https://example.com' }],
		})

		expect({
			outcome: recordFact({ folder, draft, now: () => NOW }).outcome,
			state: readFactFile({ folder, id: 'F-0001' }).state,
		}).toEqual({ outcome: 'created', state: 'unchecked' })
	})

	it('a person fact with unchecked: true → stored valid, the flag kept', () => {
		const folder = temporaryFolder('facts-person-unchecked-')
		const draft = factDraft({ source: 'person', sources: [], unchecked: true })

		expect({
			outcome: recordFact({ folder, draft, now: () => NOW }).outcome,
			fact: readFactFile({ folder, id: 'F-0001' }),
		}).toMatchObject({
			outcome: 'created',
			fact: { state: 'valid', unchecked: true, source: 'person' },
		})
	})

	it('a second key → F-0002, its own pointer, the first fact untouched', () => {
		const folder = temporaryFolder('facts-second-key-')
		const first = factDraft()
		const second = factDraft({ question: 'Is DD_1 required in D?' })
		expect(recordFact({ folder, draft: first, now: () => NOW }).id).toBe('F-0001')
		const firstText = readFileSync(join(folder, 'F-0001.json'), 'utf8')

		expect({
			outcome: recordFact({ folder, draft: second, now: () => NOW }),
			pointers: [
				readPointerText({ folder, key: keyOfDraft(first) }),
				readPointerText({ folder, key: keyOfDraft(second) }),
			],
			firstKept: readFileSync(join(folder, 'F-0001.json'), 'utf8') === firstText,
		}).toEqual({
			outcome: { outcome: 'created', id: 'F-0002', previous: null },
			pointers: ['F-0001\n', 'F-0002\n'],
			firstKept: true,
		})
	})
})

/** One row of the replacement rule: the current fact (and what is done to it), the new draft, the outcome. */
type ReplacementRow = {
	name: string
	current: Partial<FactDraft>
	/** The state the current fact's file is rewritten to after its record. */
	currentState?: FactStoredState
	/** The check the second record runs. */
	unverifiable?: true
	next: Partial<FactDraft>
	expected: 'replaced' | 'reused'
}

const REPLACEMENT_ROWS: ReplacementRow[] = [
	{ name: 'current stale', current: {}, currentState: 'stale', next: {}, expected: 'replaced' },
	{
		name: 'current forgotten',
		current: {},
		currentState: 'forgotten',
		next: {},
		expected: 'replaced',
	},
	{
		name: 'current unverifiable by the check',
		current: {},
		unverifiable: true,
		next: {},
		expected: 'replaced',
	},
	{
		name: 'current medium, new high',
		current: { effort: 'medium' },
		next: { effort: 'high' },
		expected: 'replaced',
	},
	{
		name: 'current high, new medium',
		current: { effort: 'high' },
		next: { effort: 'medium' },
		expected: 'reused',
	},
	{ name: 'equal effort', current: {}, next: {}, expected: 'reused' },
	{
		name: 'new person fact over a high standard fact',
		current: { effort: 'high' },
		next: { source: 'person', effort: 'low', sources: [] },
		expected: 'replaced',
	},
	{
		name: 'current outside (unchecked), new standard',
		current: {
			source: 'outside',
			effort: 'high',
			sources: [{ kind: 'outside', url: 'https://example.com' }],
		},
		next: { effort: 'low' },
		expected: 'replaced',
	},
	{
		name: 'current person fact with unchecked: true, new standard',
		current: { source: 'person', effort: 'high', sources: [], unchecked: true },
		next: { effort: 'low' },
		expected: 'replaced',
	},
	{
		name: 'current valid standard medium, new outside (unchecked) high',
		current: { effort: 'medium' },
		next: {
			source: 'outside',
			effort: 'high',
			sources: [{ kind: 'outside', url: 'https://example.com' }],
		},
		expected: 'reused',
	},
	{
		name: 'current outside (unchecked) low, new outside (unchecked) high',
		current: {
			source: 'outside',
			effort: 'low',
			sources: [{ kind: 'outside', url: 'https://example.com' }],
		},
		next: {
			source: 'outside',
			effort: 'high',
			sources: [{ kind: 'outside', url: 'https://example.org' }],
		},
		expected: 'replaced',
	},
	{
		name: 'current outside (unchecked) high, new outside (unchecked) low',
		current: {
			source: 'outside',
			effort: 'high',
			sources: [{ kind: 'outside', url: 'https://example.com' }],
		},
		next: {
			source: 'outside',
			effort: 'low',
			sources: [{ kind: 'outside', url: 'https://example.org' }],
		},
		expected: 'reused',
	},
	{
		name: 'current outside (unchecked), new outside (unchecked) at equal effort',
		current: {
			source: 'outside',
			effort: 'medium',
			sources: [{ kind: 'outside', url: 'https://example.com' }],
		},
		next: {
			source: 'outside',
			effort: 'medium',
			sources: [{ kind: 'outside', url: 'https://example.org' }],
		},
		expected: 'reused',
	},
	{
		name: 'current valid standard medium, new person fact with unchecked: true',
		current: { effort: 'medium' },
		next: { source: 'person', effort: 'high', sources: [], unchecked: true },
		expected: 'reused',
	},
]

describe('recordFact: the replacement rule', () => {
	it.each(REPLACEMENT_ROWS)('$name → $expected', (row) => {
		const folder = temporaryFolder('facts-rule-')
		const currentDraft = factDraft(row.current)
		const nextDraft = factDraft({ answer: SECOND_ANSWER, ...row.next })
		expect(
			recordFact({ folder, draft: currentDraft, lot: '0025', ask: 'q1', now: () => NOW }).id,
		).toBe('F-0001')
		if (row.currentState !== undefined)
			writeFactFile({
				folder,
				fact: { ...readFactFile({ folder, id: 'F-0001' }), state: row.currentState },
			})
		const before = readFileSync(join(folder, 'F-0001.json'), 'utf8')
		const oldBefore = readFactFile({ folder, id: 'F-0001' })

		const outcome = recordFact({
			folder,
			draft: nextDraft,
			lot: '0025',
			ask: 'q2',
			now: () => NOW,
			check: row.unverifiable ? () => ({ state: 'unverifiable' }) : undefined,
		})
		const key = keyOfDraft(currentDraft)

		if (row.expected === 'reused') {
			expect({
				outcome,
				pointer: readPointerText({ folder, key }),
				secondFactFile: existsSync(join(folder, 'F-0002.json')),
				currentFileKept: readFileSync(join(folder, 'F-0001.json'), 'utf8') === before,
				events: readHistoryFile({ folder, id: 'F-0001' }).map((line) => [line.event, line.ask]),
			}).toEqual({
				outcome: { outcome: 'reused', id: 'F-0001', previous: null },
				pointer: 'F-0001\n',
				secondFactFile: false,
				currentFileKept: true,
				events: [
					['created', 'q1'],
					['reused', 'q2'],
				],
			})
			return
		}
		expect({
			outcome,
			pointer: readPointerText({ folder, key }),
			replacement: {
				answer: readFactFile({ folder, id: 'F-0002' }).answer,
				supersedes: readFactFile({ folder, id: 'F-0002' }).supersedes,
				supersededBy: readFactFile({ folder, id: 'F-0002' }).supersededBy,
			},
			oldFact: readFactFile({ folder, id: 'F-0001' }),
			oldEvents: readHistoryFile({ folder, id: 'F-0001' }).map((line) => line.event),
			newEvents: readHistoryFile({ folder, id: 'F-0002' }).map((line) => line.event),
		}).toEqual({
			outcome: { outcome: 'replaced', id: 'F-0002', previous: 'F-0001' },
			pointer: 'F-0002\n',
			replacement: { answer: SECOND_ANSWER, supersedes: 'F-0001', supersededBy: null },
			oldFact: { ...oldBefore, supersededBy: 'F-0002' },
			oldEvents: ['created', 'superseded'],
			newEvents: ['created'],
		})
	})
})

describe('recordFact: the id claim', () => {
	it('F-0001.json published by someone else between the pick and the claim → F-0002, the other file untouched', () => {
		const folder = temporaryFolder('facts-claim-')
		const draft = factDraft()
		const otherText = `${JSON.stringify(
			{
				...factDraft({ question: 'Is DD_1 required in D?' }),
				id: 'F-0001',
				key: 'b'.repeat(64),
				at: NOW.toISOString(),
				state: 'valid',
				supersedes: null,
				supersededBy: null,
			},
			null,
			2,
		)}\n`
		let claimed = false

		expect({
			outcome: recordFact({
				folder,
				draft,
				now: () => NOW,
				seams: {
					beforeIdClaim: (id) => {
						if (claimed) return
						claimed = true
						writeFileSync(join(folder, `${id}.json`), otherText)
					},
				},
			}),
			claimed,
			other: readFileSync(join(folder, 'F-0001.json'), 'utf8'),
			mine: readFactFile({ folder, id: 'F-0002' }).id,
			histories: [
				readHistoryFile({ folder, id: 'F-0001' }),
				readHistoryFile({ folder, id: 'F-0002' }).map((line) => line.event),
			],
			pointer: readPointerText({ folder, key: keyOfDraft(draft) }),
		}).toEqual({
			outcome: { outcome: 'created', id: 'F-0002', previous: null },
			claimed: true,
			other: otherText,
			mine: 'F-0002',
			histories: [[], ['created']],
			pointer: 'F-0002\n',
		})
	})
})

describe('recordFact: two writers of one key (forced order)', () => {
	it("writer B's whole record runs between A's decision and A's publish → both facts exist, the pointer names A's", () => {
		const folder = temporaryFolder('facts-race-')
		const draftA = factDraft()
		const draftB = factDraft({ answer: SECOND_ANSWER })

		expect({
			outcomeA: recordFact({
				folder,
				draft: draftA,
				now: () => NOW,
				seams: {
					afterDecide: () => {
						recordFact({ folder, draft: draftB, now: () => NOW })
					},
				},
			}).outcome,
			ids: [existsSync(join(folder, 'F-0001.json')), existsSync(join(folder, 'F-0002.json'))],
			answers: [
				readFactFile({ folder, id: 'F-0001' }).answer,
				readFactFile({ folder, id: 'F-0002' }).answer,
			],
			pointer: readPointerText({ folder, key: keyOfDraft(draftA) }),
			events: [
				readHistoryFile({ folder, id: 'F-0001' }).map((line) => line.event),
				readHistoryFile({ folder, id: 'F-0002' }).map((line) => line.event),
			],
		}).toEqual({
			outcomeA: 'created',
			ids: [true, true],
			answers: [SECOND_ANSWER, draftA.answer],
			pointer: 'F-0002\n',
			events: [['created'], ['created']],
		})
	})
})

/** A seam that stops the record as a crash would. */
function crash(): never {
	throw new Error('crash')
}

describe('recordFact: a crash between the steps', () => {
	/** A folder holding the key's current fact F-0001, and the draft of its replacement (higher effort). */
	function folderWithCurrent() {
		const folder = temporaryFolder('facts-crash-')
		const current = factDraft()
		expect(recordFact({ folder, draft: current, lot: '0025', ask: 'q1', now: () => NOW }).id).toBe(
			'F-0001',
		)
		return {
			folder,
			current,
			replacement: factDraft({ effort: 'high', answer: SECOND_ANSWER }),
		}
	}

	it('a crash after the publish of a first record → the fact file stays, no pointer', () => {
		const folder = temporaryFolder('facts-crash-first-')
		const draft = factDraft()

		expect(() =>
			recordFact({ folder, draft, now: () => NOW, seams: { afterPublish: crash } }),
		).toThrow('crash')

		expect({
			fact: existsSync(join(folder, 'F-0001.json')),
			history: readHistoryFile({ folder, id: 'F-0001' }),
			pointer: readPointerText({ folder, key: keyOfDraft(draft) }),
		}).toEqual({ fact: true, history: [], pointer: undefined })
	})

	it('a crash after the publish of a replacement → F-0002 exists, the pointer still names F-0001', () => {
		const { folder, current, replacement } = folderWithCurrent()

		expect(() =>
			recordFact({ folder, draft: replacement, now: () => NOW, seams: { afterPublish: crash } }),
		).toThrow('crash')

		expect({
			second: existsSync(join(folder, 'F-0002.json')),
			pointer: readPointerText({ folder, key: keyOfDraft(current) }),
			oldSupersededBy: readFactFile({ folder, id: 'F-0001' }).supersededBy,
		}).toEqual({ second: true, pointer: 'F-0001\n', oldSupersededBy: null })
	})

	it('a crash after the pointer swap → the pointer names F-0002, F-0001 has no supersededBy', () => {
		const { folder, current, replacement } = folderWithCurrent()

		expect(() =>
			recordFact({ folder, draft: replacement, now: () => NOW, seams: { afterPointer: crash } }),
		).toThrow('crash')

		expect({
			pointer: readPointerText({ folder, key: keyOfDraft(current) }),
			oldSupersededBy: readFactFile({ folder, id: 'F-0001' }).supersededBy,
			oldEvents: readHistoryFile({ folder, id: 'F-0001' }).map((line) => line.event),
		}).toEqual({ pointer: 'F-0002\n', oldSupersededBy: null, oldEvents: ['created'] })
	})

	it('a crash after the created line → F-0002 has its created line, F-0001 has no supersededBy', () => {
		const { folder, current, replacement } = folderWithCurrent()

		expect(() =>
			recordFact({ folder, draft: replacement, now: () => NOW, seams: { afterCreated: crash } }),
		).toThrow('crash')

		expect({
			pointer: readPointerText({ folder, key: keyOfDraft(current) }),
			newEvents: readHistoryFile({ folder, id: 'F-0002' }).map((line) => line.event),
			oldSupersededBy: readFactFile({ folder, id: 'F-0001' }).supersededBy,
		}).toEqual({ pointer: 'F-0002\n', newEvents: ['created'], oldSupersededBy: null })
	})
})
