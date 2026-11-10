import { readFileSync } from 'node:fs'

import {
	ASK_KIND_PREFIX,
	EVENT_FIELDS_BY_KIND,
	KNOWN_EVENT_FIELDS,
	NO_EVENTS_FILE_CODES,
} from './events.constants.ts'

import type { LotEvent, ReadEventsResult } from './event.types.ts'

/** Reads the events of a file, skipping and counting what it cannot trust; sorted by `at`, then position. */
export function readEvents(params: { file: string }): ReadEventsResult {
	const result: ReadEventsResult = { events: [], damaged: 0, unknownKinds: 0, unknownFields: 0 }
	const content = readContent({ file: params.file })
	if (content === undefined) return result
	const lines = content.split('\n')
	// the text after the last `\n` is a line without its `\n`: never trusted, even when it parses
	const torn = lines.pop()
	if (torn !== undefined && torn !== '') result.damaged += 1
	for (const line of lines) {
		const parsed = parseEvent({ line })
		if (parsed === undefined) {
			result.damaged += 1
			continue
		}
		if (parsed.kind.startsWith(ASK_KIND_PREFIX)) {
			result.events.push(parsed)
			continue
		}
		if (!Object.hasOwn(EVENT_FIELDS_BY_KIND, parsed.kind)) {
			result.unknownKinds += 1
			continue
		}
		const { event, unknownFields } = withoutUnknownFields({ event: parsed })
		result.unknownFields += unknownFields
		result.events.push(event)
	}
	result.events.sort(byAt)
	return result
}

/** The file's text, or undefined when there is no file (nothing, or a folder standing at its path). */
function readContent(params: { file: string }): string | undefined {
	try {
		return readFileSync(params.file, 'utf8')
	} catch (error) {
		if (NO_EVENTS_FILE_CODES.includes((error as NodeJS.ErrnoException).code ?? '')) return undefined
		throw error
	}
}

/** The event a line holds: an object with a string `at` and a string `kind`; undefined for anything else. */
function parseEvent(params: { line: string }): LotEvent | undefined {
	let value: unknown
	try {
		value = JSON.parse(params.line)
	} catch {
		return undefined
	}
	if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
	const record = value as Record<string, unknown>
	if (typeof record.at !== 'string' || typeof record.kind !== 'string') return undefined
	return record as LotEvent
}

/** The event without the fields no known kind holds (nor the envelope), and how many were dropped. */
function withoutUnknownFields(params: { event: LotEvent }): {
	event: LotEvent
	unknownFields: number
} {
	const kept: Record<string, unknown> = {}
	let unknownFields = 0
	for (const [key, value] of Object.entries(params.event)) {
		if (KNOWN_EVENT_FIELDS.has(key)) kept[key] = value
		else unknownFields += 1
	}
	return { event: kept as LotEvent, unknownFields }
}

/** Orders two events by `at`; equal ones keep their file position (the sort is stable). */
function byAt(first: LotEvent, second: LotEvent): number {
	if (first.at < second.at) return -1
	return first.at > second.at ? 1 : 0
}
