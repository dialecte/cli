import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
	ANSWERED_STATE,
	ASK_ID_PATTERN,
	ASK_RECORD_FILE,
	NOTE_PART_SEPARATOR,
	NOTE_SEPARATOR,
	NOTE_START,
} from './ask.constants.ts'

import type { StandardNoteOfParams } from './ask.types.ts'

/** The lot's standard note (D18) from every `A-*` ask of its `asks` folder: `asks A-0001 needs-readers · ...`. */
export function standardNoteOf(params: StandardNoteOfParams): string {
	const { asksFolder } = params
	const asks = (existsSync(asksFolder) ? readdirSync(asksFolder) : [])
		.flatMap(function numberedAsk(name): { name: string; number: number }[] {
			const match = ASK_ID_PATTERN.exec(name)
			return match === null ? [] : [{ name, number: Number(match[1]) }]
		})
		.sort((first, second) => first.number - second.number)
	const parts = asks.flatMap(({ name }) => {
		const part = notePartOf({ file: join(asksFolder, name, ASK_RECORD_FILE), ask: name })
		return part === undefined ? [] : [part]
	})
	return `${NOTE_START}${parts.join(NOTE_SEPARATOR)}`
}

/** How the note names one ask: its id and state, an answer's fact after it; undefined while it holds no record. */
function notePartOf(params: { file: string; ask: string }): string | undefined {
	let record: { state?: unknown; fact?: unknown }
	try {
		record = JSON.parse(readFileSync(params.file, 'utf8')) as typeof record
	} catch {
		// a claimed folder whose record is not written yet, or not readable: no state to name
		return undefined
	}
	if (typeof record.state !== 'string') return undefined
	const fact =
		record.state === ANSWERED_STATE && typeof record.fact === 'string' ? [record.fact] : []
	return [params.ask, record.state, ...fact].join(NOTE_PART_SEPARATOR)
}
