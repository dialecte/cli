/**
 * The store lots a command reaches beyond one id: the stores to read (the one of `cwd`, then the store list's), the
 * lots of a feature in all of them, every lot of all of them. One lookup for `lot report --feature` and `lot prune`.
 */
import { join } from 'node:path'

import { realPathOf } from '../file-system.ts'
import { listLotFolderNames, listLotIdentities, locateStore } from './store-folder.ts'
import { readStoreList } from './store-list.ts'

/**
 * The stores to read: the one of `cwd`, then the store list's, each once (by real path).
 *
 * @intent read every store a person works with, the current one first
 * @internal
 */
export function storesOf(params: { cwd: string }): string[] {
	const located = locateStore({ from: params.cwd })?.store
	const stores = [...(located === undefined ? [] : [located]), ...readStoreList({})]
	return [...new Set(stores.map((store) => realPathOf(store)))]
}

/**
 * The folders of the store lots whose identity names `feature`, in every store `storesOf` reads.
 *
 * @intent find every lot of a feature, whichever repository holds it
 * @internal
 */
export function lotsOfFeature(params: { feature: string; cwd: string }): string[] {
	return storesOf({ cwd: params.cwd }).flatMap((store) =>
		listLotIdentities({ store })
			.filter((entry) => entry.identity.feature === params.feature)
			.map((entry) => join(store, entry.name)),
	)
}

/**
 * The folders of every lot of every store `storesOf` reads.
 *
 * @intent reach every lot a person works with
 * @internal
 */
export function allStoreLots(params: { cwd: string }): string[] {
	return storesOf({ cwd: params.cwd }).flatMap((store) =>
		listLotFolderNames({ store }).map((name) => join(store, name)),
	)
}
