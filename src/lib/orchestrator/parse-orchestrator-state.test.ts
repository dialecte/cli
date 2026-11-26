import { parseOrchestratorState } from './parse-orchestrator-state.ts'

import { describe, expect, it } from 'vitest'

import type { OrchestratorState } from './orchestrator.types.ts'

type ParseStateRow = { text: string; expected: OrchestratorState }
type ParseStateOutcome = { state: OrchestratorState } | { error: unknown }
type ParseErrorRow = { text: string; expected: string }

function parseOutcome(params: { text: string }): ParseStateOutcome {
	try {
		return { state: parseOrchestratorState(params) }
	} catch (error) {
		return { error }
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

const MISSING_REQUIRED_CASES: Record<
	string,
	{ initial: Record<string, unknown>; outcome: string }
> = {
	'whole document missing root schema -> schema is the first required-field error': {
		initial: Object.fromEntries(Object.entries(EMPTY_STATE).filter(([key]) => key !== 'schema')),
		outcome: 'schema: expected 1',
	},
	'whole document with malformed workspace and missing later updatedAt -> nested workspace field wins recursively':
		{
			initial: {
				...EMPTY_STATE,
				workspace: { key: EMPTY_STATE.workspace.key },
				updatedAt: undefined,
			},
			outcome: 'workspace.root: expected string',
		},
	'whole document missing workspace key -> the second nested required field is named': {
		initial: {
			...EMPTY_STATE,
			workspace: { root: EMPTY_STATE.workspace.root },
		},
		outcome: 'workspace.key: expected string',
	},
	'whole document missing updatedAt -> the next root required field is named': {
		initial: {
			...EMPTY_STATE,
			updatedAt: undefined,
		},
		outcome: 'updatedAt: expected string',
	},
}

const ERROR_CASES: Record<string, ParseErrorRow> = {
	'unknown schema -> exact schema error': {
		text: JSON.stringify({ ...EMPTY_STATE, schema: 2 }),
		expected: 'schema: unknown version 2',
	},
	'unknown root field -> exact lexical field error': {
		text: JSON.stringify({ ...EMPTY_STATE, zzz: true, aaa: false }),
		expected: 'state: unknown field "aaa"',
	},
	'unknown nested field before a later malformed field -> recursive field-order error': {
		text: JSON.stringify({
			...EMPTY_STATE,
			workspace: { ...EMPTY_STATE.workspace, aaa: true },
			updatedAt: 7,
		}),
		expected: 'workspace: unknown field "aaa"',
	},
}

describe('parseOrchestratorState', () => {
	it.each(Object.entries(CASES))('%s', (_title, testCase) => {
		expect(parseOutcome({ text: testCase.text })).toEqual({ state: testCase.expected })
	})

	it.each(Object.entries(ERROR_CASES))('%s', (_title, testCase) => {
		expect(() => parseOrchestratorState({ text: testCase.text })).toThrowError(testCase.expected)
	})

	it.each(Object.entries(MISSING_REQUIRED_CASES))('%s', (_title, testCase) => {
		expect(() => parseOrchestratorState({ text: JSON.stringify(testCase.initial) })).toThrowError(
			testCase.outcome,
		)
	})
})
