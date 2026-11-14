import { kindOf } from './kind-of.ts'
import { resolveContext } from './resolve-context.ts'

import type { ReadQuestion, ReadQuestionParams } from './ask.types.ts'

/**
 * A question read in its dialecte: the kind and slots its subject fills (or the kind forced), then the context of
 * its subject tags; the refusal of either step when one refuses.
 */
export function readQuestion(params: ReadQuestionParams): ReadQuestion | { refused: string } {
	const { question, subject, setup } = params
	const kinded = kindOf({ question, subject, kind: params.kind })
	if ('refused' in kinded) return kinded
	const placed = resolveContext({
		subject,
		slots: kinded.slots,
		dialectes: setup.dialectes,
		packageName: params.packageName,
		ownPackage: setup.ownPackage,
		decision: params.decision,
	})
	if ('refused' in placed) return placed
	return {
		kind: kinded.kind,
		slots: kinded.slots,
		context: placed.context,
		dialecte: placed.dialecte,
	}
}
