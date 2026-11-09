import { numberedSteps } from './scenario-steps.ts'

import type {
	ScenarioQuestion,
	ScenarioStepDraft,
	ScenarioStepKind,
	ScenarioTable,
} from './scenarios.types.ts'
import type { EngineState } from './store.types.ts'

/** The schema of `scenario.json`. */
export const SCENARIO_SCHEMA = 1

/** The state a played step's transition is in, by the step's kind. */
export const STEP_STATES: Readonly<Record<ScenarioStepKind, EngineState>> = {
	station: 'working',
	question: 'working',
	limit: 'working',
	fail: 'failed',
	ready: 'ready',
}

/** How long each step of `slow` is due after the transition before it; every other scenario's steps are due at once. */
export const SLOW_STEP_MS = 2000

/** The caller question of `question` and `two-questions`, after the test-reviewer (33S section 8). */
const CALLER_QUESTION: ScenarioQuestion = {
	audience: 'caller',
	text: 'keep an existing entry as it is?',
	options: ['keep', 'replace'],
}

/** The person question of `person` (after round 1) and `two-questions`. */
const PERSON_QUESTION: ScenarioQuestion = {
	audience: 'person',
	text: 'R1-2 kept by the adjudicator: accept or fix?',
	options: ['accept', 'fix'],
}

/** The steps every scenario is built from. */
const TEST_WRITER: ScenarioStepDraft = { kind: 'station', station: 'test-writer' }
const TEST_REVIEWER: ScenarioStepDraft = { kind: 'station', station: 'test-reviewer' }
const IMPLEMENTER: ScenarioStepDraft = { kind: 'station', station: 'implementer' }
const REVIEWER: ScenarioStepDraft = { kind: 'station', station: 'reviewer' }
const HAND_OVER: ScenarioStepDraft = { kind: 'station', station: 'hand-over' }
const READY: ScenarioStepDraft = { kind: 'ready', station: 'hand-over' }
const CALLER_ASKS: ScenarioStepDraft = {
	kind: 'question',
	station: 'test-reviewer',
	question: CALLER_QUESTION,
}
const PERSON_ASKS_AFTER_ROUND_ONE: ScenarioStepDraft = {
	kind: 'question',
	station: 'reviewer',
	question: PERSON_QUESTION,
}
const PERSON_ASKS_TOO: ScenarioStepDraft = {
	kind: 'question',
	station: 'test-reviewer',
	question: PERSON_QUESTION,
}
const LIMIT: ScenarioStepDraft = { kind: 'limit', station: 'implementer' }
const FULL_GATE_FAILS: ScenarioStepDraft = { kind: 'fail', station: 'full-gate' }

/** The lot of `ready`: every station, then `ready` at the hand-over. */
const READY_STEPS: readonly ScenarioStepDraft[] = [
	TEST_WRITER,
	TEST_REVIEWER,
	IMPLEMENTER,
	REVIEWER,
	HAND_OVER,
	READY,
]

/**
 * The built-in scenarios of `lot start --simulate` (33S section 8), by name: `ready`, `question`, `person`,
 * `two-questions`, `limit`, `failure`, `slow`.
 */
export const SCENARIOS: ScenarioTable = {
	ready: numberedSteps({ steps: READY_STEPS, durationMs: 0 }),
	question: numberedSteps({
		steps: [TEST_WRITER, TEST_REVIEWER, CALLER_ASKS, IMPLEMENTER, REVIEWER, HAND_OVER, READY],
		durationMs: 0,
	}),
	person: numberedSteps({
		steps: [
			TEST_WRITER,
			TEST_REVIEWER,
			IMPLEMENTER,
			REVIEWER,
			PERSON_ASKS_AFTER_ROUND_ONE,
			HAND_OVER,
			READY,
		],
		durationMs: 0,
	}),
	'two-questions': numberedSteps({
		steps: [
			TEST_WRITER,
			TEST_REVIEWER,
			CALLER_ASKS,
			PERSON_ASKS_TOO,
			IMPLEMENTER,
			REVIEWER,
			HAND_OVER,
			READY,
		],
		durationMs: 0,
	}),
	limit: numberedSteps({
		steps: [TEST_WRITER, TEST_REVIEWER, IMPLEMENTER, LIMIT, REVIEWER, HAND_OVER, READY],
		durationMs: 0,
	}),
	failure: numberedSteps({
		steps: [TEST_WRITER, TEST_REVIEWER, IMPLEMENTER, REVIEWER, FULL_GATE_FAILS],
		durationMs: 0,
	}),
	slow: numberedSteps({ steps: READY_STEPS, durationMs: SLOW_STEP_MS }),
}
