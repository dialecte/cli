import {
	appendHistory,
	fittedHistoryLine,
	historyPathOf,
	readHistory,
} from '../facts/fact-history.ts'
import { listFacts } from '../facts/read-facts.ts'
import { historyLineOf } from '../facts/record-fact.ts'
import { REASK_EVENT, REASK_REASON } from './ask.constants.ts'

import type { Fact, HistoryLine } from '../facts/facts.types.ts'
import type { ReaskUncheckedParams } from './ask.types.ts'

/**
 * Re-asks the current `unchecked` facts of the listed packages once documents exist (D15): one new ask per fact
 * not yet re-asked, the fact's question only, kept with the fact's id, and one `rechecked` history line naming the
 * ask and the lot with the reason `documents`. Returns the ids of the facts re-asked; the fact files are never
 * changed. The history is read, then appended: two asks at once may re-ask a fact twice (one extra ask).
 */
export function reaskUnchecked(params: ReaskUncheckedParams): string[] {
	const { factsFolder: folder, packages, claim } = params
	if (packages.length === 0) return []
	const at = (params.now ?? currentTime)().toISOString()
	const lot = params.lot ?? null
	const reasked: string[] = []
	for (const view of listFacts({ folder })) {
		const { fact } = view
		if (fact === undefined || !view.current || !isUnchecked({ fact })) continue
		if (fact.subject.package === null || !packages.includes(fact.subject.package)) continue
		if (readHistory({ folder, id: fact.id }).some(isDocumentsRecheck)) continue
		const file = historyPathOf({ folder, id: fact.id })
		const ask = claim({ question: fact.question })
		params.keep?.({ ask, question: fact.question, fact: fact.id })
		appendHistory({
			file,
			line: fittedHistoryLine({
				file,
				line: {
					...historyLineOf({ context: { at, lot, ask }, event: REASK_EVENT, fact: fact.id }),
					reason: REASK_REASON,
				},
			}),
		})
		reasked.push(fact.id)
	}
	return reasked
}

/** An answer no document confirmed: stored `unchecked`, or a valid person's fact flagged `unchecked`. */
function isUnchecked(params: { fact: Fact }): boolean {
	const { fact } = params
	return fact.state === 'unchecked' || (fact.state === 'valid' && fact.unchecked === true)
}

/** A `rechecked` line a re-ask for documents wrote. */
function isDocumentsRecheck(line: HistoryLine): boolean {
	return line.event === REASK_EVENT && line.reason === REASK_REASON
}

/** The clock of a real re-ask. */
function currentTime(): Date {
	return new Date()
}
