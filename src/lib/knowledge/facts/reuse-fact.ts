/** Reusing a fact (D11): the key's current fact answers or is a candidate. */
import { EFFORT_RANK } from './facts.constants.ts'
import { currentFact } from './read-facts.ts'

import type { CurrentFactView, FactEffort, ReuseAnswer, ReuseFactParams } from './facts.types.ts'

/**
 * The view of the fact that answers the key at the asked effort, and the views of the candidates that do not, each
 * with its state and reason: the current fact answers when it is valid (after the check) and of at least the asked
 * effort, or a valid person fact; a current fact that does not answer and is not forgotten (lower effort, stale,
 * unverifiable, unchecked) is a candidate.
 */
export function reuseFact(params: ReuseFactParams): ReuseAnswer {
	const view = currentFact({ folder: params.folder, key: params.key, check: params.check })
	if (view === undefined || view.state === 'forgotten') return { answer: undefined, candidates: [] }
	return answers({ view, effort: params.effort })
		? { answer: view, candidates: [] }
		: { answer: undefined, candidates: [view] }
}

function answers(params: { view: CurrentFactView; effort: FactEffort }): boolean {
	const { view } = params
	if (view.state !== 'valid') return false
	if (view.fact.source === 'person') return true
	return EFFORT_RANK[view.fact.effort] >= EFFORT_RANK[params.effort]
}
