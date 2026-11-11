/** The tables and lines of the `lot wait` cases on a simulated lot. */
import { LOT_NAME } from './lot-start.constants.ts'
import { READY_SUMMARY } from './simulated-lot.constants.ts'

import type { ScenarioStep } from '../src/lib/store/scenarios.types.ts'
import type { FlowRow, UsageRow } from './lot-wait-cases.types.ts'

export const ANSWER_LINE = `dialecte lot answer ${LOT_NAME} q1 "<answer>"`
export const STOP_LINE = `dialecte lot stop ${LOT_NAME} --reason <text>`
export const RESULT_LINE = `dialecte lot result ${LOT_NAME}`

/** The transitions every scenario starts with, up to the first question. */
export const BEFORE_QUESTION = [
	'1:working:start:null',
	'2:working:station:test-writer',
	'3:working:station:test-reviewer',
]

export const FLOW_ROWS: FlowRow[] = [
	{
		scenario: 'ready',
		steps: [{ wait: [] }],
		observed: ['wait 0 ready'],
		summary: READY_SUMMARY.slice(),
	},
	{
		scenario: 'question',
		steps: [{ wait: [] }, { answer: [LOT_NAME, 'q1', 'keep'] }, { wait: [] }],
		observed: ['wait 3 input-required q1', 'answer 0', 'wait 0 ready'],
		summary: [
			...BEFORE_QUESTION,
			'4:working:question:test-reviewer',
			'5:working:answer:implementer',
			'6:working:station:reviewer',
			'7:working:station:hand-over',
			'8:ready:ready:hand-over',
		],
	},
	{
		scenario: 'person',
		steps: [
			{ wait: [] },
			{ answer: [LOT_NAME, 'q1', 'accept'] },
			{ wait: [] },
			{ answer: [LOT_NAME, 'q1', 'accept', '--by', 'a-person'] },
			{ wait: [] },
		],
		observed: [
			'wait 3 input-required q1',
			'answer 2',
			'wait 3 input-required q1',
			'answer 0',
			'wait 0 ready',
		],
		summary: [
			...BEFORE_QUESTION,
			'4:working:station:implementer',
			'5:working:station:reviewer',
			'6:working:question:reviewer',
			'7:working:answer:hand-over',
			'8:ready:ready:hand-over',
		],
	},
	{
		scenario: 'two-questions',
		steps: [
			{ wait: [] },
			{ answer: [LOT_NAME, 'q2', 'accept', '--by', 'a-person'] },
			{ wait: [] },
			{ answer: [LOT_NAME, 'q1', 'keep'] },
			{ wait: [] },
		],
		observed: [
			'wait 3 input-required q1,q2',
			'answer 0',
			'wait 3 input-required q1',
			'answer 0',
			'wait 0 ready',
		],
		summary: [
			...BEFORE_QUESTION,
			'4:working:question:test-reviewer',
			'5:working:question:test-reviewer',
			'6:working:answer:implementer',
			'7:working:station:reviewer',
			'8:working:station:hand-over',
			'9:ready:ready:hand-over',
		],
	},
	{
		scenario: 'limit',
		steps: [{ wait: [] }, { wait: [] }, { wait: [] }],
		observed: ['wait 4 working', 'wait 0 ready', 'wait 0 ready'],
		summary: [
			...BEFORE_QUESTION,
			'4:working:station:implementer',
			'5:working:limit:implementer',
			'6:working:station:reviewer',
			'7:working:station:hand-over',
			'8:ready:ready:hand-over',
		],
	},
	{
		scenario: 'failure',
		steps: [{ wait: [] }, { wait: [] }],
		observed: ['wait 1 failed', 'wait 1 failed'],
		summary: [
			...BEFORE_QUESTION,
			'4:working:station:implementer',
			'5:working:station:reviewer',
			'6:failed:fail:full-gate',
		],
	},
]

/** A two-step scenario whose steps are none of the built-in ones. */
export const CUSTOM_STEPS: ScenarioStep[] = [
	{
		kind: 'station',
		station: 'test-writer',
		position: { step: 1, of: 1, station: 'test-writer', round: null },
		durationMs: 0,
	},
	{
		kind: 'ready',
		station: 'hand-over',
		position: { step: 1, of: 1, station: 'hand-over', round: null },
		durationMs: 0,
	},
]

export const CUSTOM_SUMMARY = [
	'1:working:start:null',
	'2:working:station:test-writer',
	'3:ready:ready:hand-over',
]

export const USAGE_ROWS: UsageRow[] = [
	{ title: 'no id', argv: ['--json'] },
	{ title: 'an unknown id', argv: ['9999', '--json'] },
	{ title: 'a timeout that is no number', argv: [LOT_NAME, '--timeout', 'abc', '--json'] },
	{ title: 'a negative timeout', argv: [LOT_NAME, '--timeout', '-1', '--json'] },
	{ title: 'a second id', argv: [LOT_NAME, '0002', '--json'] },
]
