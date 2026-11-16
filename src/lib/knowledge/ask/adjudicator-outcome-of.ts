import { fillMessage } from '../standard/fill-message.ts'
import { agreedOf } from './agreed-of.ts'
import { ADJUDICATOR_READER, NOT_IN_TEXT_VERDICT, PERSON_REASONS } from './ask.constants.ts'

import type { AdjudicatorOutcomeOfParams, RoundOutcome } from './ask.types.ts'

/**
 * What the adjudicator's checked report came to: answered when it is accepted with a verified claim and no refused
 * cite; else the person.
 */
export function adjudicatorOutcomeOf(params: AdjudicatorOutcomeOfParams): RoundOutcome {
	const { checked } = params
	if (!checked.accepted)
		return {
			state: 'needs-person',
			reason: fillMessage({
				template: PERSON_REASONS.adjudicatorRefused,
				values: { refused: checked.refused },
			}),
		}
	if (
		checked.report.verdict === NOT_IN_TEXT_VERDICT ||
		!checked.claims.some((claim) => claim.verified)
	)
		return { state: 'needs-person', reason: PERSON_REASONS.adjudicatorNotInText }
	// a refused cite is never kept, nor a refused claim: the adjudicator's report holds whole or the person reads it
	if (checked.claims.some((claim) => !claim.verified || claim.cites.some((cite) => !cite.verified)))
		return { state: 'needs-person', reason: PERSON_REASONS.adjudicatorRefusedCite }
	if (checked.claims.some((claim) => claim.polarityConflict))
		return { state: 'needs-person', reason: PERSON_REASONS.adjudicatorPolarityConflict }
	return {
		state: 'answered',
		agreed: agreedOf({ reports: [{ ...checked, letter: ADJUDICATOR_READER }] }),
	}
}
