import {
	CANDIDATE_FACT,
	EVENT_ASK,
	EVENT_LOT,
	EVENT_NOW,
	HIT_FACT,
	NEW_FACT,
	SECRET_QUESTION,
	SECRET_WORDS,
	STALE_CANDIDATE_FACT,
} from '../../../../test/ask-events-fixtures.constants.ts'
import { fieldsOf, outcomeOf, secretRequestOf } from '../../../../test/ask-events-fixtures.ts'
import { factKeyOf } from '../facts/fact-key.ts'
import { fillMessage } from '../standard/fill-message.ts'
import { askEventsOf } from './ask-events-of.ts'
import { CANDIDATE_REASONS } from './ask.constants.ts'

import { describe, expect, it } from 'vitest'

import type { LotEvent } from '../../events/event.types.ts'
import type { AskEventsOfParams, AskOutcome, RungTiming } from './ask.types.ts'

const SUBJECT_COUNTS = { tags: 1, attributes: 1, codes: 0, methods: 0 }
const CONTEXT_FIELDS = { package: '@dialecte/core-test', resolved: true }

/** The timings of the rungs `rungs`, in order: the rung number tells how long it took (3, 4, ... ms). */
function timingsOf(rungs: RungTiming['rung'][]): RungTiming[] {
	return rungs.map((rung) => ({ rung, durationMs: rung + 3 }))
}

/** What `askEventsOf` takes for the outcome; the cases call it themselves, inside their `expect`. */
function paramsFor(
	params: Partial<AskEventsOfParams> & { outcome: AskOutcome },
): AskEventsOfParams {
	return {
		ask: EVENT_ASK,
		lot: null,
		request: secretRequestOf(),
		rungs: timingsOf([0, 1]),
		now: () => EVENT_NOW,
		...params,
	}
}

/** Each event as its kind and the fields it holds beside its envelope. */
function shapeOf(events: LotEvent[]): [string, Record<string, unknown>][] {
	return events.map((event) => [event.kind, fieldsOf(event)])
}

/** What the envelopes of the events say, and how many events there are with how many distinct ids. */
function envelopesOf(events: LotEvent[]) {
	return {
		envelopes: events.map((event) => ({
			schema: event.schema,
			by: event.by,
			lot: event.lot,
			simulated: event.simulated,
			hostEvent: event.hostEvent,
			at: event.at,
			pidIsNumber: typeof event.pid === 'number',
			cliIsText: typeof event.cli === 'string' && event.cli !== '',
		})),
		distinctIds: new Set(events.map((event) => event.id)).size,
	}
}

/** What the events hold that no event may. */
function leaksOf(events: LotEvent[]) {
	const text = JSON.stringify(events)
	return {
		holdsAWord: SECRET_WORDS.some((word) => text.includes(word)),
		holdsAFile: text.includes('example-0000'),
		holdsAUrl: text.includes('http') || text.includes('example.com'),
		count: events.length,
	}
}

const PARSED_FIELDS = {
	ask: EVENT_ASK,
	key: factKeyOf({
		question: SECRET_QUESTION,
		subject: outcomeOf().subject,
		kind: 'children',
		package: '@dialecte/core-test',
	}),
	length: SECRET_QUESTION.length,
	subject: SUBJECT_COUNTS,
	context: CONTEXT_FIELDS,
	questionKind: 'children',
	decision: false,
}

describe('askEventsOf: the four kinds of one ask, in order (D17)', () => {
	it('answered at rung 1 after rung 0 -> parsed, one rung event per rung run, fact (new), state', () => {
		expect(shapeOf(askEventsOf(paramsFor({ outcome: outcomeOf({ fact: NEW_FACT }) })))).toEqual([
			['ask.parsed', PARSED_FIELDS],
			['ask.rung', { ask: EVENT_ASK, rung: 0, outcome: 'passed', durationMs: 3 }],
			['ask.rung', { ask: EVENT_ASK, rung: 1, outcome: 'answered', durationMs: 4 }],
			['ask.fact', { ask: EVENT_ASK, hit: null, candidates: 0, new: NEW_FACT, stale: 0 }],
			['ask.state', { ask: EVENT_ASK, state: 'answered', rung: 1, conflict: false }],
		])
	})

	it('answered at rung 0 by a fact -> the fact event names the hit, no new fact', () => {
		expect(
			shapeOf(
				askEventsOf(
					paramsFor({
						outcome: outcomeOf({ rung: 0, fact: HIT_FACT }),
						rungs: timingsOf([0]),
					}),
				),
			),
		).toEqual([
			['ask.parsed', PARSED_FIELDS],
			['ask.rung', { ask: EVENT_ASK, rung: 0, outcome: 'answered', durationMs: 3 }],
			['ask.fact', { ask: EVENT_ASK, hit: HIT_FACT, candidates: 0, new: null, stale: 0 }],
			['ask.state', { ask: EVENT_ASK, state: 'answered', rung: 0, conflict: false }],
		])
	})

	it('needs-readers at rung 3, two candidates one of them stale -> every rung run, candidates 2, stale 1', () => {
		expect(
			shapeOf(
				askEventsOf(
					paramsFor({
						outcome: outcomeOf({
							rung: 3,
							state: 'needs-readers',
							answer: null,
							source: 'documents',
							candidates: [
								{ fact: CANDIDATE_FACT, why: 'same subject and kind, other wording' },
								{
									fact: STALE_CANDIDATE_FACT,
									why: fillMessage({
										template: CANDIDATE_REASONS.stale,
										values: { fact: STALE_CANDIDATE_FACT },
									}),
								},
							],
						}),
						rungs: timingsOf([0, 1, 2, 3]),
					}),
				),
			),
		).toEqual([
			['ask.parsed', PARSED_FIELDS],
			['ask.rung', { ask: EVENT_ASK, rung: 0, outcome: 'passed', durationMs: 3 }],
			['ask.rung', { ask: EVENT_ASK, rung: 1, outcome: 'passed', durationMs: 4 }],
			['ask.rung', { ask: EVENT_ASK, rung: 2, outcome: 'passed', durationMs: 5 }],
			['ask.rung', { ask: EVENT_ASK, rung: 3, outcome: 'needs-readers', durationMs: 6 }],
			['ask.fact', { ask: EVENT_ASK, hit: null, candidates: 2, new: null, stale: 1 }],
			['ask.state', { ask: EVENT_ASK, state: 'needs-readers', rung: 3, conflict: false }],
		])
	})

	it('--no-facts: the rungs run start at 1 -> no rung 0 event, the fact event still says nothing was hit', () => {
		expect(
			askEventsOf(paramsFor({ outcome: outcomeOf({ fact: null }), rungs: timingsOf([1]) })).map(
				(event) => event.kind,
			),
		).toEqual(['ask.parsed', 'ask.rung', 'ask.fact', 'ask.state'])
	})
})

describe('askEventsOf: the envelope and what no event holds (D17, privacy)', () => {
	it('every event -> schema 1, by cli, the lot name given, not simulated, no host event, its own kind and id', () => {
		const expectedEnvelope = {
			schema: 1,
			by: 'cli',
			lot: EVENT_LOT,
			simulated: false,
			hostEvent: null,
			at: EVENT_NOW.toISOString(),
			pidIsNumber: true,
			cliIsText: true,
		}

		expect(
			envelopesOf(
				askEventsOf(paramsFor({ lot: EVENT_LOT, outcome: outcomeOf({ fact: NEW_FACT }) })),
			),
		).toEqual({
			envelopes: Array.from({ length: 5 }, () => expectedEnvelope),
			distinctIds: 5,
		})
	})

	it('a question, angle terms and slices naming its words -> no event holds any of them, nor a quote or a URL', () => {
		expect(
			leaksOf(
				askEventsOf(
					paramsFor({
						outcome: outcomeOf({
							rung: 3,
							state: 'needs-readers',
							answer: null,
							source: 'documents',
							angles: [{ id: 'a1', family: 'question', terms: [...SECRET_WORDS] }],
							slices: [
								{
									id: 's1',
									file: 'example-0000/tag',
									from: 3,
									to: 3,
									clause: '1',
									angles: ['a1'],
									score: 1,
									linked: false,
								},
							],
						}),
						rungs: timingsOf([0, 1, 2, 3]),
					}),
				),
			),
		).toEqual({ holdsAWord: false, holdsAFile: false, holdsAUrl: false, count: 7 })
	})

	it('the outside route, a question holding a URL -> no event holds a word of it, the URL or its host', () => {
		const request = secretRequestOf({
			question: `${SECRET_QUESTION} See https://example.com/page`,
		})

		expect({
			...leaksOf(
				askEventsOf(
					paramsFor({
						request,
						outcome: outcomeOf({
							rung: 2,
							state: 'needs-readers',
							answer: null,
							source: 'outside',
						}),
						rungs: timingsOf([0, 1, 2]),
					}),
				),
			),
		}).toEqual({ holdsAWord: false, holdsAFile: false, holdsAUrl: false, count: 6 })
	})
})
