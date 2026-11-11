/**
 * The keep rule the lot store adds to `worktree prune` and `lot close` (33S section 11): a worktree an open lot names
 * stays. Reads the repository's store once, files only: no git process, nor one per lot.
 */
import { join } from 'node:path'

import { realPathOf } from '../file-system.ts'
import { readStoreEntries } from '../handover/handover-store-read.ts'
import { readCheckedLotState } from './lot-records.ts'
import { lotState } from './lot-state.ts'
import { listLotFolderNames, locateStore } from './store-folder.ts'
import { DAMAGED_STATE, LOT_KEEP_REASON, LOTS_KEEPING_NOTHING } from './store.constants.ts'

/**
 * The worktrees the open lots of the store of `repository` name (not `committed` nor `canceled`), by real path, each
 * with its reason `lot <full name> <state>`; a damaged lot whose identity reads is open until a person moves it aside.
 * A lot without a worktree is left out; a closed lot never overrides an open one; a repository without a store keeps
 * nothing.
 */
export function lotsKeepingWorktrees(params: { repository: string }): ReadonlyMap<string, string> {
	const kept = new Map<string, string>()
	const location = locateStore({ from: params.repository })
	if (location === undefined) return kept
	const { store, registry } = location
	// the registry read once for every lot of the store
	const entries = readStoreEntries(registry)
	for (const name of listLotFolderNames({ store })) {
		const checked = readCheckedLotState({ lotFolder: join(store, name), registry, entries })
		if (checked === undefined) continue
		const identity = 'damage' in checked ? checked.identity : checked.input.identity
		const worktree = identity?.worktree
		if (typeof worktree !== 'string') continue
		const state = 'damage' in checked ? DAMAGED_STATE : lotState(checked.input).state
		const real = realPathOf(worktree)
		if (LOTS_KEEPING_NOTHING.some((closed) => closed === state) || kept.has(real)) continue
		kept.set(real, LOT_KEEP_REASON.replace('{name}', name).replace('{state}', state))
	}
	return kept
}
