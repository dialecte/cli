import { EARLIER_TIME, LATER_TIME, RECORD_TIME } from '../../../test/store-records.constants.ts'
import {
	answerOf,
	entryOf,
	identityOf,
	questionOf,
	questionTransitionOf,
	transitionOf,
} from '../../../test/store-records.ts'
import { lotState } from './lot-state.ts'

import { describe, expect, it } from 'vitest'

import type { StoreEntry } from '../handover/handover.types.ts'
import type { AnswerRecord, LotStateInput, LotStateName, Transition } from './store.types.ts'

/** The records a lot holds; absent fields are the plain defaults (one `working` transition, nothing else). */
type Records = {
	transitions?: Transition[]
	answers?: AnswerRecord[]
	entry?: StoreEntry
	abandonedMarker?: boolean
	runMarker?: boolean
}

function inputOf(records: Records): LotStateInput {
	return {
		identity: identityOf(),
		transitions: records.transitions ?? [transitionOf({ seq: 1 })],
		answers: records.answers ?? [],
		registryEntry: records.entry,
		abandonedMarker: records.abandonedMarker ? { at: RECORD_TIME } : undefined,
		runMarker: records.runMarker ? { pid: process.pid, startedAt: RECORD_TIME } : undefined,
	}
}

const WORKING = transitionOf({ seq: 1 })
const READY = transitionOf({ seq: 2, state: 'ready', kind: 'ready' })
const FAILED = transitionOf({ seq: 2, state: 'failed', kind: 'fail' })
const CANCELED = transitionOf({ seq: 2, state: 'canceled', kind: 'stop' })
const ASKED = questionTransitionOf({ seq: 2, number: 1 })

const COMMITTED = entryOf({ state: 'committed' })
const ABANDONED = entryOf({ state: 'abandoned' })
const PENDING = entryOf({ state: 'pending' })

type StateRow = { name: string; records: Records; state: LotStateName }

const ROWS: StateRow[] = [
	// rows 1-6 alone
	{ name: 'registry committed -> committed', records: { entry: COMMITTED }, state: 'committed' },
	{
		name: 'last transition canceled -> canceled',
		records: { transitions: [WORKING, CANCELED] },
		state: 'canceled',
	},
	{ name: 'registry abandoned -> canceled', records: { entry: ABANDONED }, state: 'canceled' },
	{
		name: 'abandoned.json and no run marker -> canceled',
		records: { abandonedMarker: true },
		state: 'canceled',
	},
	{
		name: 'last transition failed -> failed',
		records: { transitions: [WORKING, FAILED] },
		state: 'failed',
	},
	{
		name: 'an unanswered question -> input-required',
		records: { transitions: [WORKING, ASKED] },
		state: 'input-required',
	},
	{
		name: 'last transition ready -> ready',
		records: { transitions: [WORKING, READY] },
		state: 'ready',
	},
	{ name: 'registry pending -> ready', records: { entry: PENDING }, state: 'ready' },
	{ name: 'one working transition and nothing else -> working', records: {}, state: 'working' },

	// row 1 over rows 2-6
	{
		name: 'registry committed, last transition canceled -> committed',
		records: { entry: COMMITTED, transitions: [WORKING, CANCELED] },
		state: 'committed',
	},
	{
		name: 'registry committed, abandoned.json -> committed',
		records: { entry: COMMITTED, abandonedMarker: true },
		state: 'committed',
	},
	{
		name: 'registry committed, last transition failed -> committed',
		records: { entry: COMMITTED, transitions: [WORKING, FAILED] },
		state: 'committed',
	},
	{
		name: 'registry committed, an unanswered question -> committed',
		records: { entry: COMMITTED, transitions: [WORKING, ASKED] },
		state: 'committed',
	},
	{
		name: 'registry committed, last transition ready -> committed',
		records: { entry: COMMITTED, transitions: [WORKING, READY] },
		state: 'committed',
	},

	// row 2 over rows 3-6
	{
		name: 'last transition canceled, registry pending -> canceled',
		records: { entry: PENDING, transitions: [WORKING, CANCELED] },
		state: 'canceled',
	},
	{
		name: 'last transition canceled after an unanswered question -> canceled',
		records: { transitions: [WORKING, ASKED, CANCELED].map(renumbered) },
		state: 'canceled',
	},
	{
		name: 'registry abandoned, last transition failed -> canceled',
		records: { entry: ABANDONED, transitions: [WORKING, FAILED] },
		state: 'canceled',
	},
	{
		name: 'registry abandoned, an unanswered question -> canceled',
		records: { entry: ABANDONED, transitions: [WORKING, ASKED] },
		state: 'canceled',
	},
	{
		name: 'registry abandoned, last transition ready -> canceled',
		records: { entry: ABANDONED, transitions: [WORKING, READY] },
		state: 'canceled',
	},
	{
		name: 'abandoned.json, last transition failed -> canceled',
		records: { abandonedMarker: true, transitions: [WORKING, FAILED] },
		state: 'canceled',
	},
	{
		name: 'abandoned.json, an unanswered question -> canceled',
		records: { abandonedMarker: true, transitions: [WORKING, ASKED] },
		state: 'canceled',
	},
	{
		name: 'abandoned.json, last transition ready -> canceled',
		records: { abandonedMarker: true, transitions: [WORKING, READY] },
		state: 'canceled',
	},
	{
		name: 'abandoned.json, registry pending -> canceled',
		records: { abandonedMarker: true, entry: PENDING },
		state: 'canceled',
	},

	// row 2's exception: a live run marker takes the abandoned.json evidence back, nothing else
	{
		name: 'abandoned.json and a live run marker -> working',
		records: { abandonedMarker: true, runMarker: true },
		state: 'working',
	},
	{
		name: 'abandoned.json, a live run marker, registry pending -> ready',
		records: { abandonedMarker: true, runMarker: true, entry: PENDING },
		state: 'ready',
	},
	{
		name: 'abandoned.json, a live run marker, last transition failed -> failed',
		records: { abandonedMarker: true, runMarker: true, transitions: [WORKING, FAILED] },
		state: 'failed',
	},
	{
		name: 'abandoned.json, a live run marker, last transition canceled -> canceled',
		records: { abandonedMarker: true, runMarker: true, transitions: [WORKING, CANCELED] },
		state: 'canceled',
	},
	{
		name: 'abandoned.json, a live run marker, registry abandoned -> canceled',
		records: { abandonedMarker: true, runMarker: true, entry: ABANDONED },
		state: 'canceled',
	},
	{
		name: 'a live run marker alone -> working',
		records: { runMarker: true },
		state: 'working',
	},

	// row 3 over rows 4-6
	{
		name: 'last transition failed after an unanswered question -> failed',
		records: { transitions: [WORKING, ASKED, FAILED].map(renumbered) },
		state: 'failed',
	},
	{
		name: 'last transition failed, registry pending -> failed',
		records: { entry: PENDING, transitions: [WORKING, FAILED] },
		state: 'failed',
	},

	// row 4 over rows 5-6
	{
		name: 'an unanswered question, then a ready transition -> input-required',
		records: { transitions: [WORKING, ASKED, READY].map(renumbered) },
		state: 'input-required',
	},
	{
		name: 'an unanswered question, registry pending -> input-required',
		records: { entry: PENDING, transitions: [WORKING, ASKED] },
		state: 'input-required',
	},

	// row 4 and the answers
	{
		name: 'a question answered -> working',
		records: { transitions: [WORKING, ASKED], answers: [answerOf(1)] },
		state: 'working',
	},
	{
		name: 'a question answered, then a ready transition -> ready',
		records: { transitions: [WORKING, ASKED, READY].map(renumbered), answers: [answerOf(1)] },
		state: 'ready',
	},
	{
		name: 'q1 answered, q2 unanswered -> input-required',
		records: {
			transitions: [WORKING, ASKED, questionTransitionOf({ seq: 3, number: 2 })],
			answers: [answerOf(1)],
		},
		state: 'input-required',
	},
	{
		name: 'an answer to a question nobody asked, no question -> working',
		records: { answers: [answerOf(7)] },
		state: 'working',
	},

	// limit does not change the state
	{
		name: 'last transition a limit (still working) -> working',
		records: { transitions: [WORKING, transitionOf({ seq: 2, kind: 'limit' })] },
		state: 'working',
	},
]

/** A transition list given in order gets its numbers 1..n. */
function renumbered(transition: Transition, position: number): Transition {
	return { ...transition, seq: position + 1 }
}

describe('lotState: the state of a lot', () => {
	it.each(ROWS)('$name', ({ records, state }) => {
		expect(lotState(inputOf(records)).state).toBe(state)
	})
})

type SinceRow = { name: string; records: Records; since: string }

const SINCE_ROWS: SinceRow[] = [
	{
		name: 'working, last transition at 11:00 -> since 11:00',
		records: { transitions: [WORKING, transitionOf({ seq: 2, at: LATER_TIME })] },
		since: LATER_TIME,
	},
	{
		name: 'registry pending written after the last transition -> since the entry written',
		records: { entry: entryOf({ state: 'pending', written: LATER_TIME }) },
		since: LATER_TIME,
	},
	{
		name: 'registry pending written before the last transition -> since the transition at',
		records: { entry: entryOf({ state: 'pending', written: EARLIER_TIME }) },
		since: RECORD_TIME,
	},
	{
		name: 'registry committed written after the last transition -> since the entry written',
		records: { entry: entryOf({ state: 'committed', written: LATER_TIME }) },
		since: LATER_TIME,
	},
	{
		name: 'registry committed written before the last transition -> since the transition at',
		records: { entry: entryOf({ state: 'committed', written: EARLIER_TIME }) },
		since: RECORD_TIME,
	},
	{
		name: 'registry abandoned written after the last transition -> since the entry written',
		records: { entry: entryOf({ state: 'abandoned', written: LATER_TIME }) },
		since: LATER_TIME,
	},
	{
		name: 'registry abandoned written before the last transition -> since the transition at',
		records: { entry: entryOf({ state: 'abandoned', written: EARLIER_TIME }) },
		since: RECORD_TIME,
	},
	{
		name: 'failed, a registry entry written later but not what the state comes from -> since the transition at',
		records: {
			transitions: [
				WORKING,
				transitionOf({ seq: 2, state: 'failed', kind: 'fail', at: EARLIER_TIME }),
			],
			entry: entryOf({ state: 'pending', written: LATER_TIME }),
		},
		since: EARLIER_TIME,
	},
]

describe('lotState: since', () => {
	it.each(SINCE_ROWS)('$name', ({ records, since }) => {
		expect(lotState(inputOf(records)).since).toBe(since)
	})
})

type LimitRow = { name: string; transitions: Transition[]; limit: boolean }

const LIMIT_ROWS: LimitRow[] = [
	{
		name: 'last transition cause limit -> limit',
		transitions: [WORKING, transitionOf({ seq: 2, kind: 'limit' })],
		limit: true,
	},
	{
		name: 'a limit, then a station transition -> no limit',
		transitions: [
			WORKING,
			transitionOf({ seq: 2, kind: 'limit' }),
			transitionOf({ seq: 3, kind: 'station' }),
		],
		limit: false,
	},
	{ name: 'only a start transition -> no limit', transitions: [WORKING], limit: false },
]

describe('lotState: limit', () => {
	it.each(LIMIT_ROWS)('$name', ({ transitions, limit }) => {
		expect(lotState(inputOf({ transitions })).limit).toBe(limit)
	})
})

type QuestionRow = { name: string; records: Records; open: string[] }

const QUESTION_ROWS: QuestionRow[] = [
	{
		name: 'q1 asked, no answer -> q1 open',
		records: { transitions: [WORKING, ASKED] },
		open: ['q1'],
	},
	{
		name: 'q1 asked and answered -> none open',
		records: { transitions: [WORKING, ASKED], answers: [answerOf(1)] },
		open: [],
	},
	{
		name: 'q1 answered, q2 asked -> q2 open',
		records: {
			transitions: [WORKING, ASKED, questionTransitionOf({ seq: 3, number: 2 })],
			answers: [answerOf(1)],
		},
		open: ['q2'],
	},
	{
		name: 'q1 and q2 asked, none answered -> both open, in order',
		records: {
			transitions: [WORKING, ASKED, questionTransitionOf({ seq: 3, number: 2 })],
		},
		open: ['q1', 'q2'],
	},
	{
		name: 'q1 asked, last transition canceled -> none open',
		records: {
			transitions: [WORKING, ASKED, transitionOf({ seq: 3, state: 'canceled', kind: 'stop' })],
		},
		open: [],
	},
	{
		name: 'q1 asked, last transition failed -> none open',
		records: {
			transitions: [WORKING, ASKED, transitionOf({ seq: 3, state: 'failed', kind: 'fail' })],
		},
		open: [],
	},
	{
		name: 'q1 asked, registry committed -> none open',
		records: { transitions: [WORKING, ASKED], entry: COMMITTED },
		open: [],
	},
	{
		name: 'q1 asked, canceled only by abandoned.json -> none open',
		records: { transitions: [WORKING, ASKED], abandonedMarker: true },
		open: [],
	},
	{
		name: 'q1 asked, abandoned.json taken back by a live run marker -> q1 open',
		records: { transitions: [WORKING, ASKED], abandonedMarker: true, runMarker: true },
		open: ['q1'],
	},
	{
		name: 'q1 asked, registry abandoned -> none open',
		records: { transitions: [WORKING, ASKED], entry: ABANDONED },
		open: [],
	},
]

describe('lotState: open questions', () => {
	it.each(QUESTION_ROWS)('$name', ({ records, open }) => {
		expect(lotState(inputOf(records)).openQuestions.map((question) => question.id)).toEqual(open)
	})

	it('an open question → carried whole, as its transition holds it', () => {
		expect(lotState(inputOf({ transitions: [WORKING, ASKED] })).openQuestions).toEqual([
			questionOf(1),
		])
	})
})
