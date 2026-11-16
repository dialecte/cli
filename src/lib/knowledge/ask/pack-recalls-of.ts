import { evaluateGold } from '../standard/evaluate-gold.ts'
import { packSlicesOf } from './pack-slices-of.ts'

import type { StandardGoldItem, StandardSlice } from '../standard/standard-search.types.ts'
import type { PackRecall, PackRecalls, PackRecallsOfParams, PackSlices } from './ask.types.ts'

/**
 * The recall at 5 and 10 of the slices the round-1 readers are given over a gold set (D25): reader A's in A's order,
 * and the A and B slices together. Each item goes through the ask ladder once; nothing is read or written besides.
 */
export function packRecallsOf(params: PackRecallsOfParams): PackRecalls {
	const { setup, effort, files } = params
	const packs = new Map<StandardGoldItem, PackSlices>()
	function packsOf(item: StandardGoldItem): PackSlices {
		const known = packs.get(item)
		if (known !== undefined) return known
		const slices = packSlicesOf({ setup, question: item.question, about: item.about, effort })
		packs.set(item, slices)
		return slices
	}
	function recallOf(pick: (slices: PackSlices) => StandardSlice[]): PackRecall {
		function find({ item }: { item: StandardGoldItem }): StandardSlice[] {
			return pick(packsOf(item))
		}
		const { recallAt5, recallAt10 } = evaluateGold({
			items: params.items,
			find,
			findWide: find,
			files,
		})
		return { recallAt5, recallAt10 }
	}
	return {
		readerA: recallOf((slices) => slices.readerA),
		union: recallOf((slices) => slices.union),
	}
}
