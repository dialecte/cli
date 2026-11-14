import { answerFromDefinition, attributeRefusalOf } from './answer-from-definition.ts'

import type { AnswerRungOneParams, ReadQuestion, RungAnswer } from './ask.types.ts'

/**
 * Rung 1 for a question read in its dialecte: the definition's answer when the context needs no decision and a
 * dialecte holds the question; the refusal of an attribute the element lacks; undefined when the rung does not
 * answer.
 */
export function answerRungOne(
	params: AnswerRungOneParams,
): RungAnswer | { refused: string } | undefined {
	const { read, setup } = params
	const { dialecte, context } = read
	if (dialecte === undefined || context.decision) return undefined
	return answerFromDefinition({
		dialecte,
		version: setup.versions[dialecte.packageName] ?? '',
		kind: read.kind,
		slots: read.slots,
		context,
	})
}

/**
 * The refusal rung 1 would make for a question read in its dialecte (an attribute the element lacks), read before
 * any rung runs; undefined when rung 1 would answer or not run.
 */
export function rungOneRefusalOf(params: { read: ReadQuestion }): string | undefined {
	const { dialecte, context, kind, slots } = params.read
	if (dialecte === undefined || context.decision) return undefined
	return attributeRefusalOf({ dialecte, kind, slots, context })
}
