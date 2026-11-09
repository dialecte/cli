/**
 * The keep rule the lot store adds to `worktree prune` and `lot close` (33S section 11): a worktree an open lot names
 * stays. Reads the repository's store once, files only: no git process, nor one per lot.
 */
import { join } from 'node:path'

import { realPathOf } from '../file-system.ts'
import { readStoreEntries } from '../handover/handover-store-read.ts'
import { readLotStateInput } from './lot-records.ts'
import { lotState } from './lot-state.ts'
import { listLotNames, locateStore } from './store-folder.ts'
import { LOT_KEEP_REASON, LOTS_KEEPING_NOTHING } from './store.constants.ts'

/**
 * The worktrees the open lots of the store of `repository` name (not `committed` nor `canceled`), by real path, each
 * with its reason `lot <full name> <state>`. A lot without a worktree is left out; a closed lot never overrides an
 * open one; a repository without a store keeps nothing.
 */
export function lotsKeepingWorktrees(params: { repository: string }): ReadonlyMap<string, string> {
	const kept = new Map<string, string>()
	const location = locateStore({ from: params.repository })
	if (location === undefined) return kept
	const { store, registry } = location
	// the registry read once for every lot of the store
	const entries = readStoreEntries(registry)
	for (const name of listLotNames({ store })) {
		const lotFolder = join(store, name)
		const input = readLotStateInput({ lotFolder, registry, entries })
		const worktree = input?.identity.worktree
		if (input === undefined || worktree === null || worktree === undefined) continue
		const { state } = lotState(input)
		const real = realPathOf(worktree)
		if (LOTS_KEEPING_NOTHING.includes(state) || kept.has(real)) continue
		kept.set(real, LOT_KEEP_REASON.replace('{name}', input.identity.name).replace('{state}', state))
	}
	return kept
}
