import type { QuestionAudience, TransitionPosition } from './store.types.ts'

/** What a scenario step publishes: a station's transition, a question, a `limit`, a `failed`, the final `ready`. */
export type ScenarioStepKind = 'station' | 'question' | 'limit' | 'fail' | 'ready'

/** The question a `question` step asks (its station is the step's). */
export type ScenarioQuestion = {
	audience: QuestionAudience
	text: string
	options?: string[]
}

/** One step of a scenario, played by `lot wait`; due `durationMs` after the previous transition. */
export type ScenarioStep = {
	kind: ScenarioStepKind
	station: string
	position: TransitionPosition
	durationMs: number
	question?: ScenarioQuestion
}

/** A step as the table lists it, before its position is numbered: its kind, station and question. */
export type ScenarioStepDraft = Pick<ScenarioStep, 'kind' | 'station' | 'question'>

/** The scenarios by name: each a list of steps. */
export type ScenarioTable = Readonly<Record<string, readonly ScenarioStep[]>>

/**
 * A simulated lot's `scenario.json` as read: missing (nothing to play), unreadable (it does not parse or holds no
 * steps array), or its steps.
 */
export type ScenarioRead =
	| { state: 'missing' }
	| { state: 'unreadable' }
	| { state: 'read'; steps: readonly ScenarioStep[] }

/** `scenario.json`: the steps of a scenario as copied into a simulated lot at its start. */
export type ScenarioFile = { schema: number; name: string; steps: readonly ScenarioStep[] }
