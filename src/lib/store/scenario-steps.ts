/** How the scenario table numbers its steps: the positions a played step publishes, from the order of the list. */
import { ROUND_STATION } from './store.constants.ts'

import type { ScenarioStep, ScenarioStepDraft } from './scenarios.types.ts'

/**
 * The steps of a scenario: step `i` of `n` (from 1) at its own station, round 1 at the reviewer and no round
 * elsewhere, each due `durationMs` after the transition before it; a question only on a question step.
 */
export function numberedSteps(params: {
	steps: readonly ScenarioStepDraft[]
	durationMs: number
}): ScenarioStep[] {
	const of = params.steps.length
	return params.steps.map(function numbered(draft, index): ScenarioStep {
		const step: ScenarioStep = {
			kind: draft.kind,
			station: draft.station,
			position: {
				step: index + 1,
				of,
				station: draft.station,
				round: draft.station === ROUND_STATION ? 1 : null,
			},
			durationMs: params.durationMs,
		}
		return draft.question === undefined ? step : { ...step, question: draft.question }
	})
}
