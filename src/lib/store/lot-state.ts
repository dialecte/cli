/**
 * The one pure function every state of a lot comes from (33S section 4): the records on disk in, the state out,
 * first match wins. No file read, no clock, no process.
 */
import { QUESTIONS_CLOSED_STATES } from './store.constants.ts'

import type { LotStateInput, LotStateName, LotStateReport, QuestionRecord } from './store.types.ts'

/** The state of a lot, derived from its records (33S section 4, first match wins). Pure. */
export function lotState(input: LotStateInput): LotStateReport {
	const last = input.transitions.at(-1)
	const asked = askedAndUnanswered(input)
	const { state, fromEntry } = stateOf({ input, hasOpenQuestion: asked.length > 0 })
	return {
		state,
		since: sinceOf({ input, fromEntry }),
		limit: last?.cause.kind === 'limit',
		openQuestions: QUESTIONS_CLOSED_STATES.includes(state) ? [] : asked,
	}
}

/** The state, and whether the registry entry is what decided it. */
function stateOf(params: { input: LotStateInput; hasOpenQuestion: boolean }): {
	state: LotStateName
	fromEntry: boolean
} {
	const { input } = params
	const last = input.transitions.at(-1)
	const entryState = input.registryEntry?.state
	// abandoned.json alone is taken back while a live run crosses it (the run is about to remove it)
	const abandonedByMarker = input.abandonedMarker !== undefined && input.runMarker === undefined
	if (entryState === 'committed') return { state: 'committed', fromEntry: true }
	if (entryState === 'abandoned') return { state: 'canceled', fromEntry: true }
	if (last?.state === 'canceled' || abandonedByMarker)
		return { state: 'canceled', fromEntry: false }
	if (last?.state === 'failed') return { state: 'failed', fromEntry: false }
	if (params.hasOpenQuestion) return { state: 'input-required', fromEntry: false }
	if (entryState === 'pending') return { state: 'ready', fromEntry: true }
	if (last?.state === 'ready') return { state: 'ready', fromEntry: false }
	return { state: 'working', fromEntry: false }
}

/** The last transition's `at` (the lot's creation without one); the entry's `written` when later and it decided. */
function sinceOf(params: { input: LotStateInput; fromEntry: boolean }): string {
	const { input } = params
	const at = input.transitions.at(-1)?.at ?? input.identity.created
	const written = input.registryEntry?.written
	if (!params.fromEntry || written === undefined) return at
	return Date.parse(written) > Date.parse(at) ? written : at
}

/** The questions asked by a transition whose answer is not recorded, in the order they were asked. */
function askedAndUnanswered(input: LotStateInput): QuestionRecord[] {
	const answered = new Set(input.answers.map((answer) => answer.question))
	return input.transitions.flatMap(function openQuestionOf(transition): QuestionRecord[] {
		const { question } = transition
		return question && !answered.has(question.id) ? [question] : []
	})
}
