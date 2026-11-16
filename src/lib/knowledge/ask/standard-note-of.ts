import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { askStateOf } from './ask-state-of.ts'
import {
	ANSWERED_STATE,
	ASK_ID_PATTERN,
	NOTE_PART_SEPARATOR,
	NOTE_SEPARATOR,
	NOTE_START,
} from './ask.constants.ts'

import type { LotAskState, StandardNoteOfParams } from './ask.types.ts'

/** The lot's standard note (D18) from every `A-*` ask of its `asks` folder: `asks A-0001 needs-readers · ...`. */
export function standardNoteOf(params: StandardNoteOfParams): string {
	return noteTextOf({ asks: lotAskStatesOf(params) })
}

/** The note of the asks' states, in their order: each ask's id and state, an answer's fact after it. */
export function noteTextOf(params: { asks: LotAskState[] }): string {
	const parts = params.asks.map(({ ask, read }) =>
		[
			ask,
			read.state,
			...(read.state === ANSWERED_STATE && read.fact !== null ? [read.fact] : []),
		].join(NOTE_PART_SEPARATOR),
	)
	return `${NOTE_START}${parts.join(NOTE_SEPARATOR)}`
}

/**
 * The state now of every `A-*` ask of a lot's `asks` folder, in number order (`askStateOf`); a claimed folder whose
 * record is not written yet, or does not read, holds no state to name and is left out.
 */
export function lotAskStatesOf(params: StandardNoteOfParams): LotAskState[] {
	const { asksFolder } = params
	return (existsSync(asksFolder) ? readdirSync(asksFolder) : [])
		.flatMap(function numberedAsk(name): { name: string; number: number }[] {
			const match = ASK_ID_PATTERN.exec(name)
			return match === null ? [] : [{ name, number: Number(match[1]) }]
		})
		.sort((first, second) => first.number - second.number)
		.flatMap(function stateOf({ name }): LotAskState[] {
			try {
				return [{ ask: name, read: askStateOf({ askFolder: join(asksFolder, name) }) }]
			} catch {
				// a claimed folder whose record is not written yet, or not readable: no state to name
				return []
			}
		})
}
