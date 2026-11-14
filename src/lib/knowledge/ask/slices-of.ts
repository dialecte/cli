import { findInStandard } from '../standard/find-in-standard.ts'
import { ANGLE_QUERY_SEPARATOR } from './ask.constants.ts'
import { mergeSlices } from './merge-slices.ts'

import type { AngleSlices, AskSlice, SlicesOfParams } from './ask.types.ts'

/**
 * The slices of the documents for a question (D27): find's own list for the whole question (the query `standard find`
 * runs), one find per angle, then the merge.
 */
export function slicesOf(params: SlicesOfParams): AskSlice[] {
	const { indexes, about, questionAbout, limit } = params
	const whole = findInStandard({ indexes, query: params.question, about: questionAbout, limit })
	const perAngle = params.angles.map(function findForAngle(angle): AngleSlices {
		return {
			angle,
			slices: findInStandard({
				indexes,
				query: angle.terms.join(ANGLE_QUERY_SEPARATOR),
				about,
				limit,
			}),
		}
	})
	return mergeSlices({ whole, perAngle, limit })
}
