/**
 * Plays a simulated lot (33S section 8): every step of the lot's own `scenario.json` that is due at `now`, one
 * `appendTransition` each, up to the next blocking point (an open question, a `limit` step played, the end).
 */
import { readLotStateInput, registryOfLotFolder } from './lot-records.ts'
import { lotState } from './lot-state.ts'
import { questionRecordOf } from './questions.ts'
import { scenarioDamageOf } from './record-checks.ts'
import { readScenario } from './scenario-file.ts'
import { STEP_STATES } from './scenarios.constants.ts'
import { QUESTION_REASON, SIMULATED_REASONS, SIMULATOR } from './store.constants.ts'
import { appendTransitionIfAny } from './transitions.ts'

import type { ScenarioStep } from './scenarios.types.ts'
import type { PlayParams, PlayResult, StepDecision } from './simulate.types.ts'
import type { LotStateInput, TransitionCause, TransitionDraft } from './store.types.ts'

/**
 * Plays the due steps of the simulated lot; a loser of a transition number reads again and decides again. Stops at
 * an open question (consecutive question steps are asked together first), after a `limit` step, at a step not due
 * yet (its time returned as `nextDue`), and on a lot that is `ready`, `failed`, `canceled` or `committed`. A
 * scenario a step of which does not hold plays nothing.
 */
export function playSimulatedLot(params: PlayParams): PlayResult {
	const { lotFolder, now } = params
	const scenario = readScenario({ lotFolder })
	const published: PlayResult['published'] = []
	// a scenario missing has nothing to play; one that does not hold is never played (the lot reads damaged)
	if (scenario.state !== 'read' || scenarioDamageOf(scenario) !== undefined)
		return { published, nextDue: undefined }
	const { steps } = scenario
	const registry = registryOfLotFolder(lotFolder)
	let seam = params.afterRead
	for (;;) {
		let nextDue: Date | undefined
		const transition = appendTransitionIfAny({
			lotFolder,
			afterRead: seam,
			next: function playedStep() {
				// read again on every try: another player may have published the step meanwhile
				const decision = decideStep({
					input: readLotStateInput({ lotFolder, registry }),
					steps,
					now,
				})
				nextDue = decision.due
				return decision.draft
			},
		})
		seam = undefined
		if (transition === undefined) return { published, nextDue }
		published.push(transition)
		// a limit is returned to the host once: the next play moves past it
		if (transition.cause.kind === 'limit') return { published, nextDue: undefined }
	}
}

/**
 * What the lot's records call for at `now`: the next step's transition when it is due and nothing blocks it, its
 * due time when it is not due yet, neither when the lot is blocked, closed or played to its end.
 */
function decideStep(params: {
	input: LotStateInput | undefined
	steps: readonly ScenarioStep[]
	now: Date
}): StepDecision {
	const { input, steps, now } = params
	if (input === undefined) return {}
	const { state } = lotState(input)
	const { transitions } = input
	const last = transitions.at(-1)
	// every transition after the start is one step played
	const index = transitions.length - 1
	const step = steps[index]
	if (last === undefined || step === undefined) return {}
	if (state !== 'working' && state !== 'input-required') return {}
	const askedTogether = step.kind === 'question' && steps[index - 1]?.kind === 'question'
	if (state === 'input-required' && !(askedTogether && last.question)) return {}
	const due = Date.parse(last.at) + step.durationMs
	if (now.getTime() < due) return { due: new Date(due) }
	const question =
		step.kind === 'question' && step.question
			? questionRecordOf({
					transitions,
					asked: { ...step.question, station: step.station },
				})
			: null
	const draft: TransitionDraft = {
		at: now.toISOString(),
		lot: input.identity.name,
		state: STEP_STATES[step.kind],
		position: step.position,
		cause: causeOf({ input, step, questionId: question?.id }),
		question,
		simulated: true,
	}
	return { draft }
}

/**
 * The cause of a played step: `answer` by the answerer for the step that follows an answered question, `question`
 * for a question step, else the step's own kind, by the simulator.
 */
function causeOf(params: {
	input: LotStateInput
	step: ScenarioStep
	questionId: string | undefined
}): TransitionCause {
	const { input, step } = params
	const asked = input.transitions.at(-1)?.question
	if (step.kind === 'question')
		return {
			kind: 'question',
			by: SIMULATOR,
			reason: QUESTION_REASON.replace('{id}', params.questionId ?? ''),
		}
	if (asked) {
		const answer = input.answers.find((each) => each.question === asked.id)
		return {
			kind: 'answer',
			by: answer?.by ?? SIMULATOR,
			reason: SIMULATED_REASONS.answer
				.replace('{question}', asked.id)
				.replace('{station}', step.station),
		}
	}
	return {
		kind: step.kind,
		by: SIMULATOR,
		reason: SIMULATED_REASONS[step.kind].replace('{station}', step.station),
	}
}
