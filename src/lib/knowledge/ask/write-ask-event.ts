import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

import { ENVELOPE_FIELDS, EVENT_LINE_LIMIT } from '../../events/events.constants.ts'
import { cutEvent, eventLineOf, writeEvent } from '../../events/write-event.ts'
import { fillMessage } from '../standard/fill-message.ts'
import {
	EVENT_WRITE_FAILURE,
	LINE_BREAK_REPLACEMENT,
	LINE_BREAKS_PATTERN,
} from './ask.constants.ts'

import type { LotEvent } from '../../events/event.types.ts'
import type { WriteAskEventParams } from './ask.types.ts'

/**
 * Appends an `ask.*` event cut by `cutEvent`, or its minimal form when it is still over the line limit; the line
 * to print on standard error when the write fails (the exit code never changes), undefined when written.
 */
export function writeAskEvent(params: WriteAskEventParams): string | undefined {
	const { file } = params
	const cut = cutEvent({ event: params.event })
	const event =
		eventLineOf({ event: cut }).length > EVENT_LINE_LIMIT ? minimalEventOf({ event: cut }) : cut
	try {
		// the state folder's asks may not exist yet (a hand-over folder's ask writes its events there)
		mkdirSync(dirname(file), { recursive: true })
		writeEvent({ file, event, limit: EVENT_LINE_LIMIT })
		return undefined
	} catch (error) {
		const reason = (error instanceof Error ? error.message : String(error)).replace(
			LINE_BREAKS_PATTERN,
			LINE_BREAK_REPLACEMENT,
		)
		return fillMessage({ template: EVENT_WRITE_FAILURE, values: { file, reason } })
	}
}

/** An event no cut brings under the limit (13d): its envelope, its ask and `cut: true`, nothing else. */
function minimalEventOf(params: { event: LotEvent }): LotEvent {
	const { event } = params
	const envelope = Object.fromEntries(
		Object.entries(event).filter(([key]) => ENVELOPE_FIELDS.includes(key)),
	) as LotEvent
	return { ...envelope, ask: event.ask, cut: true }
}
