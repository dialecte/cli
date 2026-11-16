import { PERSON_VERDICT } from './ask.constants.ts'
import { valuesAgree } from './reports-agree.ts'

import type { ReaskComparison, ReaskComparisonOfParams } from './ask.types.ts'

/**
 * Compares the agreed answer of a re-ask with the unchecked fact it would replace (D43 1): the same verdict and value
 * agree; a person's fact (verdict `person`, a free text no reader verdict can equal) is always different, so it is
 * shown to the person, never read as readers disagreeing.
 */
export function reaskComparisonOf(params: ReaskComparisonOfParams): ReaskComparison {
	const { current, agreed, kind } = params
	if (current.verdict === PERSON_VERDICT) return 'shown'
	if (current.verdict !== agreed.verdict) return 'shown'
	return valuesAgree({ first: current.value, second: agreed.value, kind }) ? 'agrees' : 'shown'
}
