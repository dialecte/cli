/**
 * The scenario table of `lot start --simulate` (33S section 8, G7): every built-in scenario, each the
 * steps its row of the table names, the questions' texts and options exact, `slow` due 2 s after the previous
 * transition and every other scenario at once.
 */
import {
	CALLER_QUESTION,
	PERSON_QUESTION,
	SLOW_DURATION_MS,
} from '../../../test/simulated-lot.constants.ts'
import { SCENARIOS } from './scenarios.constants.ts'

import { describe, expect, it } from 'vitest'

import type { ScenarioStep } from './scenarios.types.ts'

const STATIONS_BEFORE_QUESTION = ['station:test-writer', 'station:test-reviewer']
const STATIONS_AFTER_QUESTION = ['station:implementer', 'station:reviewer', 'station:hand-over']

type ShapeRow = { name: string; steps: string[] }

const SHAPE_ROWS: ShapeRow[] = [
	{
		name: 'ready',
		steps: [...STATIONS_BEFORE_QUESTION, ...STATIONS_AFTER_QUESTION, 'ready:hand-over'],
	},
	{
		name: 'question',
		steps: [
			...STATIONS_BEFORE_QUESTION,
			'question:test-reviewer',
			...STATIONS_AFTER_QUESTION,
			'ready:hand-over',
		],
	},
	{
		name: 'person',
		steps: [
			...STATIONS_BEFORE_QUESTION,
			'station:implementer',
			'station:reviewer',
			'question:reviewer',
			'station:hand-over',
			'ready:hand-over',
		],
	},
	{
		name: 'two-questions',
		steps: [
			...STATIONS_BEFORE_QUESTION,
			'question:test-reviewer',
			'question:test-reviewer',
			...STATIONS_AFTER_QUESTION,
			'ready:hand-over',
		],
	},
	{
		name: 'limit',
		steps: [
			...STATIONS_BEFORE_QUESTION,
			'station:implementer',
			'limit:implementer',
			'station:reviewer',
			'station:hand-over',
			'ready:hand-over',
		],
	},
	{
		name: 'failure',
		steps: [
			...STATIONS_BEFORE_QUESTION,
			'station:implementer',
			'station:reviewer',
			'fail:full-gate',
		],
	},
	{
		name: 'slow',
		steps: [...STATIONS_BEFORE_QUESTION, ...STATIONS_AFTER_QUESTION, 'ready:hand-over'],
	},
]

function stepsOf(name: string): readonly ScenarioStep[] {
	return SCENARIOS[name] ?? []
}

describe('the scenario table', () => {
	for (const row of SHAPE_ROWS)
		it(`${row.name} -> its steps are ${row.steps.length}, kind and station in order`, () => {
			expect(stepsOf(row.name).map((step) => `${step.kind}:${step.station}`)).toEqual(row.steps)
		})

	for (const name of Object.keys(SCENARIOS))
		it(`${name} -> every step is due at once, except in slow where each is due 2 s after the previous transition`, () => {
			const expected = name === 'slow' ? SLOW_DURATION_MS : 0

			expect(stepsOf(name).map((step) => step.durationMs)).toEqual(
				stepsOf(name).map(() => expected),
			)
			expect(stepsOf(name).length).toBeGreaterThan(0)
		})

	for (const name of Object.keys(SCENARIOS))
		it(`${name} -> a step holds kind, station, position and durationMs, and a question only on a question step`, () => {
			expect(
				stepsOf(name).map((step) => ({
					keys: Object.keys(step)
						.filter((key) => key !== 'question')
						.sort(),
					hasQuestion: step.question !== undefined,
					isQuestion: step.kind === 'question',
				})),
			).toEqual(
				stepsOf(name).map((step) => ({
					keys: ['durationMs', 'kind', 'position', 'station'],
					hasQuestion: step.kind === 'question',
					isQuestion: step.kind === 'question',
				})),
			)
			expect(stepsOf(name).length).toBeGreaterThan(0)
		})

	for (const name of Object.keys(SCENARIOS))
		it(`${name} -> each position is { step, of, station, round } with the step's own station`, () => {
			expect(
				stepsOf(name).map((step) => ({
					keys: Object.keys(step.position).sort(),
					station: step.position.station,
				})),
			).toEqual(
				stepsOf(name).map((step) => ({
					keys: ['of', 'round', 'station', 'step'],
					station: step.station,
				})),
			)
			expect(stepsOf(name).length).toBeGreaterThan(0)
		})

	for (const name of Object.keys(SCENARIOS))
		it(`${name} -> every reviewer step is at round 1 and every other step at no round`, () => {
			expect(stepsOf(name).map((step) => step.position.round)).toEqual(
				stepsOf(name).map((step) => (step.station === 'reviewer' ? 1 : null)),
			)
			expect(stepsOf(name).length).toBeGreaterThan(0)
		})

	for (const name of Object.keys(SCENARIOS))
		it(`${name} -> step i of n is numbered i from 1 of the n steps the scenario holds`, () => {
			expect(
				stepsOf(name).map((step) => ({ step: step.position.step, of: step.position.of })),
			).toEqual(
				stepsOf(name).map((_step, index) => ({
					step: index + 1,
					of: stepsOf(name).length,
				})),
			)
			expect(stepsOf(name).length).toBeGreaterThan(0)
		})

	it('question -> the caller question after the test-reviewer asks to keep or replace', () => {
		expect(stepsOf('question').find((step) => step.kind === 'question')?.question).toEqual(
			CALLER_QUESTION,
		)
	})

	it('person -> the person question after round 1 asks to accept or fix', () => {
		expect(stepsOf('person').find((step) => step.kind === 'question')?.question).toEqual(
			PERSON_QUESTION,
		)
	})

	it('two-questions -> the caller question then the person question, back to back', () => {
		expect(
			stepsOf('two-questions')
				.filter((step) => step.kind === 'question')
				.map((step) => step.question),
		).toEqual([CALLER_QUESTION, PERSON_QUESTION])
	})

	it('the scenarios without a question step -> ask nothing', () => {
		expect(
			['ready', 'limit', 'failure', 'slow'].flatMap((name) =>
				stepsOf(name).filter((step) => step.question !== undefined),
			),
		).toEqual([])
		expect(stepsOf('ready').length).toBeGreaterThan(0)
	})
})
