/**
 * The checks a lot's records pass when they are read (R4-2, R5): a record a hand or an agent forged makes the lot
 * read damaged. A second line behind the one escape of every printed value: one rule per record kind, applied once by
 * the lot reader.
 */
import { HANDOVER_ENTRY_STATES } from '../handover/handover.constants.ts'
import { STEP_STATES } from './scenarios.constants.ts'
import {
	LOT_INDEX_PATTERN,
	QUESTION_AUDIENCES,
	QUESTION_ID_PATTERN,
	RECORD_DAMAGE_REASONS,
	STORE_TIME_PATTERN,
} from './store.constants.ts'

import type { StoreEntry } from '../handover/handover.types.ts'
import type { ScenarioRead } from './scenarios.types.ts'
import type { AnswerFile, LotIdentity, Transition, TransitionPosition } from './store.types.ts'

/** Why an identity does not hold: its index is not digits or its `created` no time of the store. */
export function identityDamageOf(identity: LotIdentity): string | undefined {
	if (typeof identity.index !== 'string' || !LOT_INDEX_PATTERN.test(identity.index))
		return RECORD_DAMAGE_REASONS.index
	if (!isStoreTime(identity.created)) return RECORD_DAMAGE_REASONS.created
	return undefined
}

/**
 * Why a transition does not hold: its question's id is no `q<k>` (k 1 or more) or its audience neither `caller` nor
 * `person`; its position no counts; its `at` no time of the store. Undefined when it holds.
 */
export function transitionDamageOf(transition: Transition): string | undefined {
	const { question } = transition
	if (question !== null && question !== undefined) {
		if (!isQuestionId(question.id)) return RECORD_DAMAGE_REASONS.questionId
		if (!(QUESTION_AUDIENCES as readonly unknown[]).includes(question.audience))
			return RECORD_DAMAGE_REASONS.audience
	}
	if (!isPosition(transition.position)) return RECORD_DAMAGE_REASONS.position
	if (!isStoreTime(transition.at)) return RECORD_DAMAGE_REASONS.at
	return undefined
}

/** Why an answer file does not hold: its name is no `q<k>.json`, or its record names another question. */
export function answerDamageOf(file: AnswerFile): string | undefined {
	if (!isQuestionId(file.question)) return RECORD_DAMAGE_REASONS.answerName
	return file.record.question === file.question ? undefined : RECORD_DAMAGE_REASONS.answerQuestion
}

/** Why the registry entry naming the lot does not hold: an unknown state, or a written time the store does not write. */
export function entryDamageOf(entry: StoreEntry): string | undefined {
	if (!(HANDOVER_ENTRY_STATES as readonly unknown[]).includes(entry.state))
		return RECORD_DAMAGE_REASONS.entryState
	// a reader leaves an entry without `written` empty: only a time present is checked
	if (entry.written !== '' && !isStoreTime(entry.written)) return RECORD_DAMAGE_REASONS.entryWritten
	return undefined
}

/** Why a hand-over marker's time does not hold; a marker the reader found without one (empty) holds. */
export function markerDamageOf(time: string | undefined): string | undefined {
	return time === undefined || time === '' || isStoreTime(time)
		? undefined
		: RECORD_DAMAGE_REASONS.marker
}

/**
 * Why a simulated lot's scenario does not hold: a file that does not parse, holds no steps array or an empty one, a
 * step of a kind the simulator does not play, or no counts. A missing file holds: there is nothing to play.
 */
export function scenarioDamageOf(scenario: ScenarioRead): string | undefined {
	if (scenario.state === 'missing') return undefined
	if (scenario.state === 'unreadable' || scenario.steps.length === 0)
		return RECORD_DAMAGE_REASONS.scenario
	const playable = scenario.steps.every(
		(step) =>
			typeof step === 'object' &&
			step !== null &&
			Object.hasOwn(STEP_STATES, step.kind) &&
			typeof step.station === 'string' &&
			isPosition(step.position) &&
			isCount(step.durationMs),
	)
	return playable ? undefined : RECORD_DAMAGE_REASONS.scenario
}

/** Whether `value` is a question id: `q<k>`, k 1 or more. */
function isQuestionId(value: unknown): boolean {
	return typeof value === 'string' && QUESTION_ID_PATTERN.test(value)
}

/** Whether `value` is a time as the store writes it. */
function isStoreTime(value: unknown): boolean {
	return typeof value === 'string' && STORE_TIME_PATTERN.test(value)
}

/** Whether `value` is a position: step and of counts, round null or a count. */
function isPosition(value: unknown): boolean {
	if (typeof value !== 'object' || value === null) return false
	const position = value as Partial<TransitionPosition>
	return (
		isCount(position.step) &&
		isCount(position.of) &&
		(position.round === null || isCount(position.round))
	)
}

/** Whether `value` is a non-negative integer. */
function isCount(value: unknown): boolean {
	return Number.isInteger(value) && (value as number) >= 0
}
