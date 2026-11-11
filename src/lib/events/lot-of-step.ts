import { existsSync } from 'node:fs'
import { basename, join } from 'node:path'

import { realPathOf } from '../file-system.ts'
import { readIdentity } from '../store/identity.ts'
import { lotFolderOf } from '../store/lot-folder.ts'
import { lotOfWorktree } from '../store/resolve-lot.ts'
import { locateStore, namesItself, workTreeHolding } from '../store/store-folder.ts'
import { LOT_LINK_SEGMENTS } from '../store/store.constants.ts'
import { THROWAWAY_LOT_NAME_PATTERN } from './events.constants.ts'

import type { LotOfStep } from './lot-of-step.types.ts'

/**
 * The lot a step run in `cwd` belongs to; undefined when `cwd` is in no lot's worktree or throwaway. The identity
 * decides first: the linked lot, or with no link the store lot of the worktree's own name, whose identity names this
 * worktree is its own, whatever the name ends with. Only then is a worktree named `<lot name>-round-<n>` that lot's
 * throwaway (its link, when it holds one, must name that lot); any other worktree is the lot whose identity names
 * it; a link naming a lot whose identity holds another worktree (or, in a throwaway, another lot) is foreign.
 */
export function lotOfStep(params: { cwd: string }): LotOfStep | undefined {
	const workTree = workTreeHolding({ from: params.cwd })
	if (workTree === undefined) return undefined
	const worktree = realPathOf(workTree)
	const throwawayOf = THROWAWAY_LOT_NAME_PATTERN.exec(basename(worktree))?.[1]
	const linked = lotFolderOf({ folder: join(workTree, ...LOT_LINK_SEGMENTS) })
	if (linked !== undefined) {
		const lot = basename(linked)
		// the identity decides before the name: a lot named `...-round-<n>` is still its own worktree's
		if (namesWorktree({ lotFolder: linked, worktree })) return { lot, worktree, throwaway: false }
		return throwawayOf === lot ? { lot, worktree, throwaway: true } : { foreign: lot, worktree }
	}
	const store = locateStore({ from: workTree })?.store
	const ownName = basename(worktree)
	if (store !== undefined && isOwnNamedLot({ store, name: ownName, worktree }))
		return { lot: ownName, worktree, throwaway: false }
	if (throwawayOf !== undefined) {
		return store !== undefined && namesItself({ store, name: throwawayOf })
			? { lot: throwawayOf, worktree, throwaway: true }
			: undefined
	}
	const lotFolder = lotOfWorktree({ cwd: params.cwd })
	return lotFolder === undefined
		? undefined
		: { lot: basename(lotFolder), worktree, throwaway: false }
}

/** True when the lot's identity names this worktree (real paths). */
function namesWorktree(params: { lotFolder: string; worktree: string }): boolean {
	return identityNamesWorktree({
		named: readIdentity({ lotFolder: params.lotFolder })?.worktree,
		worktree: params.worktree,
	})
}

/**
 * True when the store holds a lot of exactly this name whose identity holds that name and names this worktree; no
 * identity is read when no folder of that name stands in the store.
 */
function isOwnNamedLot(params: { store: string; name: string; worktree: string }): boolean {
	const lotFolder = join(params.store, params.name)
	if (!existsSync(lotFolder)) return false
	const identity = readIdentity({ lotFolder })
	return (
		identity?.name === params.name &&
		identityNamesWorktree({ named: identity.worktree, worktree: params.worktree })
	)
}

/** True when an identity's worktree is this one (real paths). */
function identityNamesWorktree(params: {
	named: string | null | undefined
	worktree: string
}): boolean {
	return (
		params.named !== null &&
		params.named !== undefined &&
		realPathOf(params.named) === params.worktree
	)
}
