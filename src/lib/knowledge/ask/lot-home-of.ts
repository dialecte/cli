import { dirname } from 'node:path'

import type { AskFolder } from './ask.types.ts'

/**
 * The folder of the lot an ask belongs to (where its `standard.json` lives): a store lot's folder, a hand-over
 * folder given with `--lot`; undefined for an ask of the state folder.
 */
export function lotHomeOf(params: { place: AskFolder; lotGiven: boolean }): string | undefined {
	const { place } = params
	if (place.lotFolder !== null) return place.lotFolder
	return params.lotGiven ? dirname(place.folder) : undefined
}
