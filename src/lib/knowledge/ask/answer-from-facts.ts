import { appendHistory, fittedHistoryLine, historyPathOf } from '../facts/fact-history.ts'
import { SCHEMA_SOURCE_KIND } from '../facts/facts.constants.ts'
import { historyLineOf, updateFact } from '../facts/record-fact.ts'
import { reuseFact } from '../facts/reuse-fact.ts'
import { fillMessage } from '../standard/fill-message.ts'
import { CANDIDATE_REASONS } from './ask.constants.ts'

import type {
	CheckOutcome,
	Fact,
	FactCheck,
	FactEffort,
	FactSource,
	FactView,
	HistoryLineContext,
} from '../facts/facts.types.ts'
import type { AnswerFromFactsParams, AskCandidate, ReusedFact } from './ask.types.ts'

/**
 * Rung 0 (D8): the key's current fact through the ledger's reuse, under the ladder's check. A fact the check finds
 * holding with other sources gets them with a `rechecked` line naming the ask; the fact that answers gets a `reused`
 * line naming the ask and the lot; any other fact of the key is a candidate `{ fact, why }`, never the answer. On a
 * `decision` ask a schema fact never answers (D29): it is a candidate whose why names the definition as the boundary.
 */
export function answerFromFacts(params: AnswerFromFactsParams): ReusedFact {
	const { folder, key, effort, context } = params
	const rechecks = new Map<string, FactSource[]>()
	function deferredCheck({ fact }: { fact: Fact }): CheckOutcome {
		const outcome = params.check({ fact })
		if (outcome.state !== 'valid' || outcome.sources === undefined) return outcome
		// the ledger's read would write the new sources without the ask: they are written below, naming it
		rechecks.set(fact.id, outcome.sources)
		return { state: outcome.state }
	}
	const reused = reuseFact({ folder, key, effort, check: deferredCheck satisfies FactCheck })
	const views = [...(reused.answer === undefined ? [] : [reused.answer]), ...reused.candidates]
	const facts = new Map<string, Fact>()
	for (const view of views) {
		if (view.fact === undefined) continue
		const sources = rechecks.get(view.id)
		facts.set(
			view.id,
			sources === undefined
				? view.fact
				: recheckedFact({ folder, fact: view.fact, sources, context }),
		)
	}
	const answer = reused.answer === undefined ? undefined : facts.get(reused.answer.id)
	const candidates = reused.candidates.map((view) => candidateOf({ view, effort }))
	// D29: on a --decision ask the definition is the boundary, a schema fact of the key a candidate only
	if (answer !== undefined && params.decision && answer.source === SCHEMA_SOURCE_KIND)
		return {
			answer: undefined,
			candidates: [
				{
					fact: answer.id,
					why: fillMessage({
						template: CANDIDATE_REASONS.definitionBoundary,
						values: { fact: answer.id },
					}),
				},
				...candidates,
			],
		}
	if (answer !== undefined) {
		const file = historyPathOf({ folder, id: answer.id })
		appendHistory({
			file,
			line: fittedHistoryLine({
				file,
				line: historyLineOf({ context, event: 'reused', fact: answer.id }),
			}),
		})
	}
	return { answer, candidates }
}

/** The fact with the sources it holds by now, written with a `rechecked { from, to }` line naming the ask. */
function recheckedFact(params: {
	folder: string
	fact: Fact
	sources: FactSource[]
	context: HistoryLineContext
}): Fact {
	const { folder, fact, sources, context } = params
	return updateFact({
		folder,
		fact,
		changes: { sources },
		line: {
			...historyLineOf({ context, event: 'rechecked', fact: fact.id }),
			from: fact.sources,
			to: sources,
		},
	})
}

/**
 * A fact of the key that does not answer, and why: the read's reason (a stale fact's starts with `<id> is stale`,
 * so its events count it), else its state or its lower effort.
 */
function candidateOf(params: { view: FactView; effort: FactEffort }): AskCandidate {
	const { view, effort } = params
	if (view.reason !== undefined && view.state === 'stale')
		return {
			fact: view.id,
			why: fillMessage({
				template: CANDIDATE_REASONS.staleBecause,
				values: { fact: view.id, reason: view.reason },
			}),
		}
	if (view.reason !== undefined) return { fact: view.id, why: view.reason }
	const values = { fact: view.id, effort: view.fact?.effort ?? '', asked: effort }
	const template =
		view.state === 'valid'
			? CANDIDATE_REASONS.lowerEffort
			: Object.hasOwn(CANDIDATE_REASONS, view.state)
				? CANDIDATE_REASONS[view.state as keyof typeof CANDIDATE_REASONS]
				: CANDIDATE_REASONS.stale
	return { fact: view.id, why: fillMessage({ template, values }) }
}
