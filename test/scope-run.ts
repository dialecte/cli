/** A scope run as the gate's own selection reader judges a selection against: base, tree and the count handed. */
import type { ScopeRun } from '../src/lib/gate/gate.types.ts'

export function scopeRunOf(params: {
	base: string
	tree: string
	changedCount: number
	folder: string
}): ScopeRun {
	return {
		base: params.base,
		tree: params.tree,
		folder: params.folder,
		changedFile: `${params.folder}/changed`,
		changedCount: params.changedCount,
		nextSelectionPath() {
			return `${params.folder}/selection-next.json`
		},
	}
}
