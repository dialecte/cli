import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
	EVENT_ASK,
	LONG_STRING_LENGTH,
	OVERSIZED_FIELD_COUNT,
	OVERSIZED_FIELD_LENGTH,
} from '../../../../test/ask-events-fixtures.constants.ts'
import { askEnvelope } from '../../../../test/ask-events-fixtures.ts'
import { temporaryFolder } from '../../../../test/scratch-repository.ts'
import { EVENT_LINE_LIMIT } from '../../events/events.constants.ts'
import { cutEvent } from '../../events/write-event.ts'
import { writeAskEvent } from './write-ask-event.ts'

import { describe, expect, it } from 'vitest'

import type { LotEvent } from '../../events/event.types.ts'

/** The lines of an events file, parsed. */
function linesOf(file: string): LotEvent[] {
	return readFileSync(file, 'utf8')
		.split('\n')
		.filter((line) => line !== '')
		.map((line) => JSON.parse(line) as LotEvent)
}

/** What the line a failed write answers is: text, naming the file, on one line. */
function lineSummaryOf(params: { printed: string | undefined; file: string }) {
	return {
		isText: typeof params.printed === 'string',
		namesFile: params.printed?.includes(params.file),
		oneLine: params.printed?.includes('\n') === false,
	}
}

function newEventsFile(): string {
	return join(temporaryFolder('dialecte-ask-events-'), 'events.jsonl')
}

describe('writeAskEvent: one line per event, cut, never a failure of the ask (D17, case 13d)', () => {
	it('a small event -> one line holding it, nothing returned', () => {
		const file = newEventsFile()
		const event = {
			...askEnvelope({ kind: 'ask.state', lot: null }),
			ask: EVENT_ASK,
			state: 'answered',
		}

		expect({ printed: writeAskEvent({ file, event }), lines: linesOf(file) }).toEqual({
			printed: undefined,
			lines: [event],
		})
	})

	it('a second event -> a second line after the first', () => {
		const file = newEventsFile()
		const first = { ...askEnvelope({ kind: 'ask.parsed', lot: null }), ask: EVENT_ASK }
		const second = { ...askEnvelope({ kind: 'ask.state', lot: null }), ask: EVENT_ASK }

		expect({
			printed: [writeAskEvent({ file, event: first }), writeAskEvent({ file, event: second })],
			lines: linesOf(file),
		}).toEqual({ printed: [undefined, undefined], lines: [first, second] })
	})

	it('a field with a string over the cut limit -> the line holds the event as cutEvent cuts it, cut: true', () => {
		const file = newEventsFile()
		const event = {
			...askEnvelope({ kind: 'ask.fact', lot: null }),
			ask: EVENT_ASK,
			note: 'x'.repeat(LONG_STRING_LENGTH),
		}

		expect({ printed: writeAskEvent({ file, event }), lines: linesOf(file) }).toEqual({
			printed: undefined,
			lines: [cutEvent({ event })],
		})
		expect(cutEvent({ event })).toMatchObject({ cut: true })
	})

	it('13d an event over 4,096 bytes after cutEvent -> the minimal event: its envelope, kind, ask and cut: true', () => {
		const file = newEventsFile()
		const envelope = askEnvelope({ kind: 'ask.fact', lot: null })
		const event = {
			...envelope,
			ask: EVENT_ASK,
			extra: Object.fromEntries(
				Array.from({ length: OVERSIZED_FIELD_COUNT }, (_, position) => [
					`field${position}`,
					'x'.repeat(OVERSIZED_FIELD_LENGTH),
				]),
			),
		}

		expect({ printed: writeAskEvent({ file, event }), lines: linesOf(file) }).toEqual({
			printed: undefined,
			lines: [{ ...envelope, ask: EVENT_ASK, cut: true }],
		})
		expect(readFileSync(file).length).toBeLessThanOrEqual(EVENT_LINE_LIMIT)
	})

	it('13d a write that fails (the events file is a folder) -> one line naming the file, nothing thrown', () => {
		const file = newEventsFile()
		mkdirSync(file)
		const event = { ...askEnvelope({ kind: 'ask.state', lot: null }), ask: EVENT_ASK }

		expect(lineSummaryOf({ printed: writeAskEvent({ file, event }), file })).toEqual({
			isText: true,
			namesFile: true,
			oneLine: true,
		})
	})
})
