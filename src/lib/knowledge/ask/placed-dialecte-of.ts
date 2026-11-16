import { AskRefusal } from './ask-refusal.ts'
import { readLadderQuestion } from './run-ladder.ts'

import type { LoadedDialecte } from '../../schema/schema.types.ts'
import type { AskStandard, PlacedDialecte, PlacedDialecteOfParams } from './ask.types.ts'

/**
 * The question read against the installed dialectes before any document is chosen, and the dialecte whose
 * standard the ask reads: the one the question's tags decide, else `--package`, else the only one, else the
 * folder's own; the refusal of a question the ladder cannot read. `ask` and `ask pack` (rebuilding what the ask
 * read) decide it the same way.
 */
export function placedDialecteOf(params: PlacedDialecteOfParams): PlacedDialecte {
	const { request, base } = params
	const noDocuments: AskStandard = { kind: 'none', name: null, key: null }
	let decided: LoadedDialecte | undefined
	try {
		decided = readLadderQuestion({
			request: { ...request, noStandard: false },
			setup: { ...base, standard: noDocuments },
		}).read.dialecte
	} catch (error) {
		if (error instanceof AskRefusal) return { refused: error.message }
		throw error
	}
	const { dialectes } = base
	const [only, ...others] = dialectes
	return {
		dialecte:
			decided ??
			dialectes.find((dialecte) => dialecte.packageName === request.packageName) ??
			(others.length === 0 ? only : undefined) ??
			dialectes.find((dialecte) => dialecte.packageName === base.ownPackage),
	}
}
