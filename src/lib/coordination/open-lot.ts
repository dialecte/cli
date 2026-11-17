/** An open lot as the forecast and its readers see it, read from its records only (no git). */
import { basename } from 'node:path'

import { isOpenRealLot, readCheckedLotState, settledLotStateInput } from '../store/lot-records.ts'

import type { StoreEntry } from '../handover/handover.types.ts'
import type { OpenLot } from './forecast.types.ts'

/**
 * The lot of a folder as the forecast reads it: an open real lot with its identity, a damaged one (open until a person
 * moves it aside) with why, unless its identity reads simulated; undefined for no lot, a simulated or a closed one.
 */
export function openLotOf(params: {
	lotFolder: string
	registry: string
	entries: readonly StoreEntry[]
}): OpenLot | undefined {
	const { lotFolder, registry } = params
	const name = basename(lotFolder)
	const checked = readCheckedLotState({ lotFolder, registry, entries: params.entries })
	if (checked === undefined) return undefined
	if ('damage' in checked)
		return checked.identity?.simulated === true ? undefined : { name, damage: checked.damage }
	const input = checked.input.identity.simulated
		? checked.input
		: settledLotStateInput({ input: checked.input, lotFolder, registry })
	if (!input || !isOpenRealLot(input)) return undefined
	return { name, identity: input.identity }
}
