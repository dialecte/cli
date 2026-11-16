import { existsSync } from 'node:fs'

import { realPathOf } from '../file-system.ts'
import { listLotFolderNames, locateStore } from '../store/store-folder.ts'
import { readStoreList } from '../store/store-list.ts'
import { NOT_A_FOLDER_CODE, SKIPPED_STORE_REASONS } from './walk-stores.constants.ts'

import type { WalkedStore } from './walk-stores.types.ts'

/**
 * The stores the read verbs walk: the current folder's, then those of the store list, each once by real path, a gone
 * one left out. Each is listed once: its lot folder names, or the reason it cannot be listed (never a throw).
 */
export function walkStores(params: { cwd: string; listPath?: string }): WalkedStore[] {
	const own = locateStore({ from: params.cwd })?.store
	const stores = [
		...(own === undefined ? [] : [own]),
		...readStoreList({ listPath: params.listPath }),
	]
	const unique = [...new Set(stores.filter((store) => existsSync(store)).map(realPathOf))]
	return unique.map(listStore)
}

/** The lot folder names of `store`, or why it cannot be listed. */
function listStore(store: string): WalkedStore {
	try {
		return { store, lotNames: listLotFolderNames({ store }) }
	} catch (error) {
		const code = (error as NodeJS.ErrnoException).code
		const reason =
			code === NOT_A_FOLDER_CODE
				? SKIPPED_STORE_REASONS.notFolder
				: SKIPPED_STORE_REASONS.unreadable.replace(
						'{detail}',
						() => code ?? (error as Error).message,
					)
		return { store, reason }
	}
}
