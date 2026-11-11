/**
 * The rules a question and an answer share (33S section 4): a text of one line within a length, options compared
 * trimmed and case-folded, and a lot that still takes them (not `committed`, `canceled` nor `failed`).
 */
import { basename } from 'node:path'

import { LINE_BREAK_PATTERN } from './brief.constants.ts'
import { readCheckedLotState, registryOfLotFolder } from './lot-records.ts'
import { lotState } from './lot-state.ts'
import { storeRefusal } from './publish.ts'
import {
	BY_OPTION,
	DAMAGED_LOT_REFUSAL,
	NEXT_COMMANDS,
	NUMBER_LOCALE,
	QUESTIONS_CLOSED_STATES,
} from './store.constants.ts'

import type { LotStateInput, LotStateReport } from './store.types.ts'

/**
 * Throws a store refusal when `text` is empty (or spaces only), holds a line break (a lone carriage return too)
 * or is longer than `limit` characters (any length without one); `what` names the text in the message.
 */
export function refuseUnlessOneLine(params: { text: string; what: string; limit?: number }): void {
	const { text, what, limit } = params
	if (text.trim() === '') throw storeRefusal(`${what} is empty`)
	if (LINE_BREAK_PATTERN.test(text)) throw storeRefusal(`${what} is more than one line`)
	if (limit !== undefined) refuseUnlessWithin({ text, what, limit })
}

/**
 * Throws a store refusal naming `--by` when who answers or stops is given and is empty (or spaces only) or holds a
 * line break; left out, it is the caller's to decide. `lot answer` and `lot stop` share it.
 */
export function refuseWrongBy(by: string | undefined): void {
	if (by !== undefined) refuseUnlessOneLine({ text: by, what: BY_OPTION })
}

/** Throws a store refusal when `text` is longer than `limit` characters; `what` names the text in the message. */
export function refuseUnlessWithin(params: { text: string; what: string; limit: number }): void {
	const { text, limit } = params
	if (text.length > limit)
		throw storeRefusal(
			`${params.what} is ${text.length.toLocaleString(NUMBER_LOCALE)} characters, over the ${limit.toLocaleString(NUMBER_LOCALE)} allowed`,
		)
}

/** How two options or an option and an answer are compared: trimmed, case-folded. */
export function foldedOf(text: string): string {
	return text.trim().toLowerCase()
}

/**
 * The records and the state of the lot folder, refused (a store refusal naming the state) when the lot is
 * `committed`, `canceled` or `failed`, damaged (named by its folder, with the reason and the stop to run), or gone;
 * `takes` names what it would have taken.
 */
export function readLotTaking(params: { lotFolder: string; takes: string }): {
	input: LotStateInput
	report: LotStateReport
} {
	const { lotFolder } = params
	const checked = readCheckedLotState({ lotFolder, registry: registryOfLotFolder(lotFolder) })
	if (checked === undefined) throw storeRefusal(`no lot in ${lotFolder}`)
	if ('damage' in checked) {
		const name = basename(lotFolder)
		throw storeRefusal(
			DAMAGED_LOT_REFUSAL.replace('{name}', name)
				.replace('{reason}', checked.damage)
				.replace('{takes}', params.takes)
				.replace('{stop}', NEXT_COMMANDS.stop.replace('{name}', name)),
		)
	}
	const { input } = checked
	const report = lotState(input)
	if (QUESTIONS_CLOSED_STATES.includes(report.state))
		throw closedLotRefusal({ name: input.identity.name, state: report.state, takes: params.takes })
	return { input, report }
}

/** The refusal of a lot closed in `state` (`committed`, `canceled` or `failed`) to take what `takes` names. */
export function closedLotRefusal(params: { name: string; state: string; takes: string }): Error {
	return storeRefusal(`the lot ${params.name} is ${params.state}: it takes no ${params.takes}`)
}
