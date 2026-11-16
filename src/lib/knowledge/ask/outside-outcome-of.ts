import { agreedOf } from './agreed-of.ts'
import { PERSON_REASONS, READERS_AT_EFFORT } from './ask.constants.ts'
import { hasPolarityConflict, valuesAgree } from './reports-agree.ts'

import type { FactAnswer } from '../facts/facts.types.ts'
import type { Agreed, OutsideOutcomeOfParams, RoundOutcome } from './ask.types.ts'

/**
 * What the one round of outside readers came to (section 18): answered when every accepted reader agrees and none
 * is not-known and the answer does not contradict the definition; else the person.
 */
export function outsideOutcomeOf(params: OutsideOutcomeOfParams): RoundOutcome {
	const { accepted, definitionAnswer } = params
	const kind = params.kind ?? 'semantic'
	if (accepted.some((report) => report.notKnown))
		return { state: 'needs-person', reason: PERSON_REASONS.outsideNotKnown }
	// a polarity conflict never counts toward agreement; no adjudicator reads outside answers (R1-2)
	if (accepted.some((report) => hasPolarityConflict({ report })))
		return { state: 'needs-person', reason: PERSON_REASONS.outsidePolarityConflict }
	const [first] = accepted
	if (first === undefined || accepted.length < READERS_AT_EFFORT[params.effort].length)
		return { state: 'needs-person', reason: PERSON_REASONS.outsideMissing }
	const same = accepted.every(
		(report) =>
			report.report.verdict === first.report.verdict &&
			valuesAgree({ first: report.report.value, second: first.report.value, kind }),
	)
	if (!same) return { state: 'needs-person', reason: PERSON_REASONS.outsideDisagree }
	const agreed = agreedOf({ reports: accepted })
	if (definitionAnswer !== null && contradicts({ agreed, definition: definitionAnswer }))
		return { state: 'needs-person', reason: PERSON_REASONS.contradictsDefinition }
	return { state: 'answered', agreed }
}

/** Whether an agreed outside answer says other than the definition (D10): another verdict, or other names. */
function contradicts(params: { agreed: Agreed; definition: FactAnswer }): boolean {
	const { agreed, definition } = params
	if (agreed.verdict !== definition.verdict) return true
	return !valuesAgree({ first: agreed.value, second: definition.value, kind: 'values' })
}
