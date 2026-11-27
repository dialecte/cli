import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import * as storeConstants from '../store/store.constants.ts'
import * as orchestratorConstants from './orchestrator.constants.ts'
import { parseOrchestratorState } from './parse-orchestrator-state.ts'

import { describe, expect, it } from 'vitest'

import type { OrchestratorState } from './orchestrator.types.ts'

type ParseStateRow = { text: string; expected: OrchestratorState }
type ParseStateOutcome = { state: OrchestratorState } | { error: unknown }
type FaultView = { code: unknown; field: unknown; message: string }
type FaultRow = { value: unknown; expected: FaultView }
type ThrownView = FaultView & { isError: boolean; name: string }

const STATE_SCHEMA = join(import.meta.dirname, 'orchestrator-state.schema.json')

function parseOutcome(params: { text: string }): ParseStateOutcome {
	try {
		return { state: parseOrchestratorState(params) }
	} catch (error) {
		return { error }
	}
}

/**
 * The fault the parser throws for `text`: whether it is an Error, its name, its code, its field and its message; the
 * parsed state when none.
 */
function faultOf(params: { text: string }): ThrownView | { state: OrchestratorState } {
	try {
		return { state: parseOrchestratorState(params) }
	} catch (error) {
		const fault = error as { code?: unknown; field?: unknown }
		return {
			isError: error instanceof Error,
			name: error instanceof Error ? error.name : typeof error,
			code: fault.code,
			field: fault.field,
			message: error instanceof Error ? error.message : String(error),
		}
	}
}

const CASES: Record<string, ParseStateRow> = {
	'complete valid orchestrator state document -> parsed typed state': {
		text: `{
	"schema": 1,
	"workspace": {
		"root": "/workspace",
		"key": "workspace-123456789abc"
	},
	"updatedAt": "2026-11-26T09:00:00.000Z",
	"lanes": [
		{
			"name": "cli",
			"repos": ["cli"],
			"holds": ["lane-a"],
			"owns": ["release"],
			"mode": "running",
			"plan": "../plan.md",
			"queue": ["lane-a"],
			"pin": "runner-a"
		}
	],
	"lots": [
		{
			"id": "lane-a",
			"lane": "cli",
			"repo": "cli",
			"state": "working",
			"station": "implement",
			"attempt": 1,
			"pr": "108",
			"head": "84e4b502",
			"run": {
				"runner": "runner-a",
				"handle": "run-a"
			}
		}
	],
	"runs": [
		{
			"id": "run-a",
			"kind": "station",
			"subject": "lane-a",
			"runner": "runner-a",
			"attempt": 1,
			"status": "running",
			"started": "2026-11-26T08:59:00.000Z",
			"until": "2026-11-26T10:00:00.000Z"
		}
	],
	"runners": [
		{
			"id": "runner-a",
			"available": true,
			"until": "2026-11-26T10:00:00.000Z",
			"tokensSinceReset": 1200,
			"usage": "normal"
		}
	],
	"held": [
		{
			"item": "lane-b",
			"by": "overlap",
			"since": "2026-11-26T08:30:00.000Z",
			"until": "2026-11-26T11:00:00.000Z"
		}
	],
	"waitingOnYou": [
		{
			"id": "gate-a",
			"kind": "gate",
			"text": "Approve the implementation.",
			"line": "dialecte lot approve lane-a",
			"options": ["approve", "refuse"]
		}
	],
	"prs": [
		{
			"repo": "cli",
			"head": "84e4b502",
			"ci": "passing",
			"review": "review.json"
		}
	],
	"next": [
		{
			"lane": "cli",
			"lot": "lane-b"
		}
	],
	"seen": [
		{
			"source": "lane",
			"event": "event-a"
		}
	]
}`,
		expected: {
			schema: 1,
			workspace: {
				root: '/workspace',
				key: 'workspace-123456789abc',
			},
			updatedAt: '2026-11-26T09:00:00.000Z',
			lanes: [
				{
					name: 'cli',
					repos: ['cli'],
					holds: ['lane-a'],
					owns: ['release'],
					mode: 'running',
					plan: '../plan.md',
					queue: ['lane-a'],
					pin: 'runner-a',
				},
			],
			lots: [
				{
					id: 'lane-a',
					lane: 'cli',
					repo: 'cli',
					state: 'working',
					station: 'implement',
					attempt: 1,
					pr: '108',
					head: '84e4b502',
					run: {
						runner: 'runner-a',
						handle: 'run-a',
					},
				},
			],
			runs: [
				{
					id: 'run-a',
					kind: 'station',
					subject: 'lane-a',
					runner: 'runner-a',
					attempt: 1,
					status: 'running',
					started: '2026-11-26T08:59:00.000Z',
					until: '2026-11-26T10:00:00.000Z',
				},
			],
			runners: [
				{
					id: 'runner-a',
					available: true,
					until: '2026-11-26T10:00:00.000Z',
					tokensSinceReset: 1200,
					usage: 'normal',
				},
			],
			held: [
				{
					item: 'lane-b',
					by: 'overlap',
					since: '2026-11-26T08:30:00.000Z',
					until: '2026-11-26T11:00:00.000Z',
				},
			],
			waitingOnYou: [
				{
					id: 'gate-a',
					kind: 'gate',
					text: 'Approve the implementation.',
					line: 'dialecte lot approve lane-a',
					options: ['approve', 'refuse'],
				},
			],
			prs: [
				{
					repo: 'cli',
					head: '84e4b502',
					ci: 'passing',
					review: 'review.json',
				},
			],
			next: [
				{
					lane: 'cli',
					lot: 'lane-b',
				},
			],
			seen: [
				{
					source: 'lane',
					event: 'event-a',
				},
			],
		},
	},
	'valid orchestrator state document without optional fields -> parsed typed state': {
		text: `{
	"schema": 1,
	"workspace": {
		"root": "/workspace",
		"key": "workspace-123456789abc"
	},
	"updatedAt": "2026-11-26T09:00:00.000Z",
	"lanes": [
		{
			"name": "cli",
			"repos": ["cli"],
			"holds": ["lane-a"],
			"owns": ["release"],
			"mode": "running",
			"plan": "../plan.md",
			"queue": ["lane-a"]
		}
	],
	"lots": [
		{
			"id": "lane-a",
			"lane": "cli",
			"repo": "cli",
			"state": "working",
			"station": "implement",
			"attempt": 1,
			"pr": "108",
			"head": "84e4b502"
		}
	],
	"runs": [
		{
			"id": "run-a",
			"kind": "station",
			"subject": "lane-a",
			"runner": "runner-a",
			"attempt": 1,
			"status": "running",
			"started": "2026-11-26T08:59:00.000Z"
		}
	],
	"runners": [
		{
			"id": "runner-a",
			"available": true,
			"tokensSinceReset": 1200
		}
	],
	"held": [
		{
			"item": "lane-b",
			"by": "overlap",
			"since": "2026-11-26T08:30:00.000Z"
		}
	],
	"waitingOnYou": [
		{
			"id": "gate-a",
			"kind": "gate",
			"text": "Approve the implementation."
		}
	],
	"prs": [
		{
			"repo": "cli",
			"head": "84e4b502",
			"ci": "passing",
			"review": "review.json"
		}
	],
	"next": [
		{
			"lane": "cli",
			"lot": "lane-b"
		}
	],
	"seen": [
		{
			"source": "lane",
			"event": "event-a"
		}
	]
}`,
		expected: {
			schema: 1,
			workspace: {
				root: '/workspace',
				key: 'workspace-123456789abc',
			},
			updatedAt: '2026-11-26T09:00:00.000Z',
			lanes: [
				{
					name: 'cli',
					repos: ['cli'],
					holds: ['lane-a'],
					owns: ['release'],
					mode: 'running',
					plan: '../plan.md',
					queue: ['lane-a'],
				},
			],
			lots: [
				{
					id: 'lane-a',
					lane: 'cli',
					repo: 'cli',
					state: 'working',
					station: 'implement',
					attempt: 1,
					pr: '108',
					head: '84e4b502',
				},
			],
			runs: [
				{
					id: 'run-a',
					kind: 'station',
					subject: 'lane-a',
					runner: 'runner-a',
					attempt: 1,
					status: 'running',
					started: '2026-11-26T08:59:00.000Z',
				},
			],
			runners: [
				{
					id: 'runner-a',
					available: true,
					tokensSinceReset: 1200,
				},
			],
			held: [
				{
					item: 'lane-b',
					by: 'overlap',
					since: '2026-11-26T08:30:00.000Z',
				},
			],
			waitingOnYou: [
				{
					id: 'gate-a',
					kind: 'gate',
					text: 'Approve the implementation.',
				},
			],
			prs: [
				{
					repo: 'cli',
					head: '84e4b502',
					ci: 'passing',
					review: 'review.json',
				},
			],
			next: [
				{
					lane: 'cli',
					lot: 'lane-b',
				},
			],
			seen: [
				{
					source: 'lane',
					event: 'event-a',
				},
			],
		},
	},
}

const EMPTY_STATE: OrchestratorState = {
	schema: 1,
	workspace: {
		root: '/workspace',
		key: 'workspace-123456789abc',
	},
	updatedAt: '2026-11-26T09:00:00.000Z',
	lanes: [],
	lots: [],
	runs: [],
	runners: [],
	held: [],
	waitingOnYou: [],
	prs: [],
	next: [],
	seen: [],
}

const LANE = {
	name: 'cli',
	repos: ['cli'],
	holds: [],
	owns: [],
	mode: 'running',
	plan: './plan.md',
	queue: [],
}

const LOT = {
	id: 'lot-a',
	lane: 'cli',
	repo: 'cli',
	state: 'working',
	station: 'test',
	attempt: 1,
	pr: '',
	head: 'head-a',
}

const HELD = { item: 'cli', by: 'user', since: '2026-11-26T08:00:00.000Z' }

const WAITING = { id: 'gate-a', kind: 'gate', text: 'Approve the lot.' }

const FAULT_CASES: Record<string, FaultRow> = {
	'not JSON -> not-json fault, no field, exact message': {
		value: '{"schema":1,',
		expected: { code: 'not-json', field: undefined, message: 'invalid JSON' },
	},
	'unknown schema -> unknown-schema fault on schema, exact message': {
		value: { ...EMPTY_STATE, schema: 2 },
		expected: { code: 'unknown-schema', field: 'schema', message: 'schema: unknown version 2' },
	},
	'unknown root field -> unknown-field fault on the first unknown key in lexical order, exact message':
		{
			value: { ...EMPTY_STATE, zzz: true, aaa: false },
			expected: { code: 'unknown-field', field: 'aaa', message: 'state: unknown field "aaa"' },
		},
	'unknown nested field before a later malformed field -> unknown-field fault on the nested key, recursive field order':
		{
			value: {
				...EMPTY_STATE,
				workspace: { ...EMPTY_STATE.workspace, aaa: true },
				updatedAt: 7,
			},
			expected: {
				code: 'unknown-field',
				field: 'workspace.aaa',
				message: 'workspace: unknown field "aaa"',
			},
		},
	'whole document missing root schema -> missing-field fault on schema, the first required field': {
		value: Object.fromEntries(Object.entries(EMPTY_STATE).filter(([key]) => key !== 'schema')),
		expected: { code: 'missing-field', field: 'schema', message: 'schema: expected 1' },
	},
	'whole document with malformed workspace and missing later updatedAt -> missing-field fault on workspace.root, nested field wins':
		{
			value: {
				...EMPTY_STATE,
				workspace: { key: EMPTY_STATE.workspace.key },
				updatedAt: undefined,
			},
			expected: {
				code: 'missing-field',
				field: 'workspace.root',
				message: 'workspace.root: expected string',
			},
		},
	'whole document missing workspace key -> missing-field fault on workspace.key': {
		value: { ...EMPTY_STATE, workspace: { root: EMPTY_STATE.workspace.root } },
		expected: {
			code: 'missing-field',
			field: 'workspace.key',
			message: 'workspace.key: expected string',
		},
	},
	'whole document missing updatedAt -> missing-field fault on updatedAt, the next root required field':
		{
			value: { ...EMPTY_STATE, updatedAt: undefined },
			expected: {
				code: 'missing-field',
				field: 'updatedAt',
				message: 'updatedAt: expected string',
			},
		},
	'updatedAt of the wrong type -> invalid-value fault on updatedAt': {
		value: { ...EMPTY_STATE, updatedAt: 7 },
		expected: { code: 'invalid-value', field: 'updatedAt', message: 'updatedAt: expected string' },
	},
	'lane mode outside running, hold, paused -> invalid-value fault on the lane mode': {
		value: { ...EMPTY_STATE, lanes: [{ ...LANE, mode: 'stopped' }] },
		expected: {
			code: 'invalid-value',
			field: 'lanes[0].mode',
			message: 'lanes[0].mode: expected running, hold, or paused',
		},
	},
	'lot state outside the lot states (damaged) -> invalid-value fault on the lot state': {
		value: { ...EMPTY_STATE, lots: [{ ...LOT, state: 'damaged' }] },
		expected: {
			code: 'invalid-value',
			field: 'lots[0].state',
			message: 'lots[0].state: expected known lot state',
		},
	},
	'held by outside user, runner, overlap -> invalid-value fault on held by': {
		value: { ...EMPTY_STATE, held: [{ ...HELD, by: 'robot' }] },
		expected: {
			code: 'invalid-value',
			field: 'held[0].by',
			message: 'held[0].by: expected user, runner, or overlap',
		},
	},
	'waiting kind outside gate, question -> invalid-value fault on the waiting kind': {
		value: { ...EMPTY_STATE, waitingOnYou: [{ ...WAITING, kind: 'poll' }] },
		expected: {
			code: 'invalid-value',
			field: 'waitingOnYou[0].kind',
			message: 'waitingOnYou[0].kind: expected gate or question',
		},
	},
}

describe('parseOrchestratorState', function parseorchestratorstate() {
	it.each(Object.entries(CASES))('%s', function checksCase(_title, testCase) {
		expect(parseOutcome({ text: testCase.text })).toEqual({ state: testCase.expected })
	})

	it.each(Object.entries(FAULT_CASES))('%s', function checksCase(_title, testCase) {
		const text =
			typeof testCase.value === 'string' ? testCase.value : JSON.stringify(testCase.value)

		expect(faultOf({ text })).toEqual({
			isError: true,
			name: 'OrchestratorFault',
			...testCase.expected,
		})
	})
})

describe('the state schema and the lot states', function theStateSchemaAndThe() {
	it('the lot-state enum of the state schema -> exactly LOT_STATE_NAMES, in order', function theLotStateEnumOf() {
		const schema = JSON.parse(readFileSync(STATE_SCHEMA, 'utf8')) as {
			$defs: { lot: { properties: { state: { enum: unknown } } } }
		}
		const constants: Record<string, unknown> = storeConstants

		expect({
			listed: Array.isArray(constants.LOT_STATE_NAMES),
			enum: schema.$defs.lot.properties.state.enum,
		}).toEqual({ listed: true, enum: constants.LOT_STATE_NAMES })
	})
})

describe('parseOrchestratorState, every lot state of the list is accepted', function lotStateRows() {
	const LOT_STATE_CASES: Record<string, { state: string }> = {
		'a ready lot -> parsed with its state': { state: 'ready' },
		'an input-required lot -> parsed with its state': { state: 'input-required' },
	}

	it.each(Object.entries(LOT_STATE_CASES))('%s', function parsesLotState(_title, testCase) {
		const document = { ...EMPTY_STATE, lots: [{ ...LOT, state: testCase.state }] }

		expect(parseOutcome({ text: JSON.stringify(document) })).toEqual({ state: document })
	})
})

describe('the state schema and the orchestrator lists', function schemaListRows() {
	const LIST_CASES: Record<string, { pointer: readonly string[]; constant: string }> = {
		'the lane mode enum -> exactly ORCHESTRATOR_LANE_MODES, in order': {
			pointer: ['lane', 'mode'],
			constant: 'ORCHESTRATOR_LANE_MODES',
		},
		'the held by enum -> exactly ORCHESTRATOR_HELD_BY, in order': {
			pointer: ['held', 'by'],
			constant: 'ORCHESTRATOR_HELD_BY',
		},
		'the waiting kind enum -> exactly ORCHESTRATOR_WAITING_KINDS, in order': {
			pointer: ['waiting', 'kind'],
			constant: 'ORCHESTRATOR_WAITING_KINDS',
		},
	}

	it.each(Object.entries(LIST_CASES))('%s', function enumEqualsList(_title, testCase) {
		const schema = JSON.parse(readFileSync(STATE_SCHEMA, 'utf8')) as {
			$defs: Record<string, { properties: Record<string, { enum?: unknown }> }>
		}
		const [definition, property] = testCase.pointer
		const constants: Record<string, unknown> = orchestratorConstants

		expect({
			listed: Array.isArray(constants[testCase.constant]),
			enum: schema.$defs[definition]?.properties[property]?.enum,
		}).toEqual({ listed: true, enum: constants[testCase.constant] })
	})
})
