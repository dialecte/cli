/** One of the three read functions of the facts ledger applied to the same ledger, so a table runs a case over each. */
import { currentFact, listFacts, readFact } from '../src/lib/knowledge/facts/read-facts.ts'

import type { CheckOutcome, Fact, FactView } from '../src/lib/knowledge/facts/facts.types.ts'
import type { READ_NAMES } from './read-via.constants.ts'

/** One read function applied to the ledger's first fact (F-0001) or the given key; its views as a list. */
export function readVia(params: {
	name: (typeof READ_NAMES)[number]
	folder: string
	key: string
	check?: (params: { fact: Fact }) => CheckOutcome
}): FactView[] {
	const { folder, key, check } = params
	if (params.name === 'listFacts') return listFacts({ folder, check })
	const view =
		params.name === 'currentFact'
			? currentFact({ folder, key, check })
			: readFact({ folder, id: 'F-0001', check })
	return view === undefined ? [] : [view]
}
