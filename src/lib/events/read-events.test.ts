import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { readEvents } from './read-events.ts'

import { afterEach, describe, expect, it } from 'vitest'

const folders: string[] = []

afterEach(() => {
	for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true })
})

/** One event line (no newline) with a full envelope. */
function line(params: { id: string } & Record<string, unknown>): string {
	return JSON.stringify({
		schema: 1,
		at: '2026-11-08T10:15:00.000Z',
		lot: '0171-scl-subscribe',
		kind: 'station.end',
		by: 'host',
		pid: 100,
		cli: '0.4.0',
		simulated: false,
		hostEvent: null,
		run: 'run-1',
		station: 'implement',
		...params,
	})
}

/** Writes `content` to an events file in a temporary folder; the file's path. */
function fileWith(content: string): string {
	const folder = mkdtempSync(join(tmpdir(), 'read-events-'))
	folders.push(folder)
	const file = join(folder, 'events.jsonl')
	writeFileSync(file, content)
	return file
}

type Row = {
	name: string
	content: string
	expected: { ids: string[]; damaged: number; unknownKinds: number; unknownFields: number }
}

const ROWS: Row[] = [
	{
		name: 'two whole lines → both read, nothing counted',
		content: `${line({ id: 'ev-a' })}\n${line({ id: 'ev-b' })}\n`,
		expected: { ids: ['ev-a', 'ev-b'], damaged: 0, unknownKinds: 0, unknownFields: 0 },
	},
	{
		name: 'a final line without a newline → skipped and counted damaged, even when it parses',
		content: `${line({ id: 'ev-a' })}\n${line({ id: 'ev-b' })}`,
		expected: { ids: ['ev-a'], damaged: 1, unknownKinds: 0, unknownFields: 0 },
	},
	{
		name: 'a torn final line → skipped and counted damaged',
		content: `${line({ id: 'ev-a' })}\n{"schema":1,"id":"ev-`,
		expected: { ids: ['ev-a'], damaged: 1, unknownKinds: 0, unknownFields: 0 },
	},
	{
		name: 'an empty line → skipped and counted damaged',
		content: `${line({ id: 'ev-a' })}\n\n${line({ id: 'ev-b' })}\n`,
		expected: { ids: ['ev-a', 'ev-b'], damaged: 1, unknownKinds: 0, unknownFields: 0 },
	},
	{
		name: 'an unparsable line in the middle → skipped and counted damaged',
		content: `${line({ id: 'ev-a' })}\nnot json at all\n${line({ id: 'ev-b' })}\n`,
		expected: { ids: ['ev-a', 'ev-b'], damaged: 1, unknownKinds: 0, unknownFields: 0 },
	},
	{
		name: 'two torn-line guards in a row → a torn line and an empty line, both skipped and counted',
		content: `{"schema":1,"id":"ev-\n\n${line({ id: 'ev-b' })}\n`,
		expected: { ids: ['ev-b'], damaged: 2, unknownKinds: 0, unknownFields: 0 },
	},
	{
		name: 'a line that parses to a value that is no object → skipped and counted damaged',
		content: `[1,2]\n${line({ id: 'ev-a' })}\n`,
		expected: { ids: ['ev-a'], damaged: 1, unknownKinds: 0, unknownFields: 0 },
	},
	{
		name: 'a line that is the JSON null → skipped and counted damaged',
		content: `null\n${line({ id: 'ev-a' })}\n`,
		expected: { ids: ['ev-a'], damaged: 1, unknownKinds: 0, unknownFields: 0 },
	},
	{
		name: 'a line that is a JSON number → skipped and counted damaged',
		content: `42\n${line({ id: 'ev-a' })}\n`,
		expected: { ids: ['ev-a'], damaged: 1, unknownKinds: 0, unknownFields: 0 },
	},
	{
		name: 'an object without an at → skipped and counted damaged',
		content: `{"schema":1,"id":"ev-x","kind":"station.end"}\n${line({ id: 'ev-a' })}\n`,
		expected: { ids: ['ev-a'], damaged: 1, unknownKinds: 0, unknownFields: 0 },
	},
	{
		name: 'an object whose at is not a string → skipped and counted damaged',
		content: `${line({ id: 'ev-x', at: 5 })}\n${line({ id: 'ev-a' })}\n`,
		expected: { ids: ['ev-a'], damaged: 1, unknownKinds: 0, unknownFields: 0 },
	},
	{
		name: 'an object without a kind → skipped and counted damaged, not an unknown kind',
		content: `{"schema":1,"id":"ev-x","at":"2026-11-08T10:15:00.000Z"}\n${line({ id: 'ev-a' })}\n`,
		expected: { ids: ['ev-a'], damaged: 1, unknownKinds: 0, unknownFields: 0 },
	},
	{
		name: 'an object whose kind is not a string → skipped and counted damaged',
		content: `${line({ id: 'ev-x', kind: 7 })}\n${line({ id: 'ev-a' })}\n`,
		expected: { ids: ['ev-a'], damaged: 1, unknownKinds: 0, unknownFields: 0 },
	},
	{
		name: 'an unknown kind → skipped and counted, not damaged',
		content: `${line({ id: 'ev-a', kind: 'station.zzz' })}\n${line({ id: 'ev-b' })}\n`,
		expected: { ids: ['ev-b'], damaged: 0, unknownKinds: 1, unknownFields: 0 },
	},
	{
		name: 'a folder event → a known kind, read',
		content: `${line({ id: 'ev-a', kind: 'folder', action: 'trash', path: 'p', durationMs: 1 })}\n`,
		expected: { ids: ['ev-a'], damaged: 0, unknownKinds: 0, unknownFields: 0 },
	},
	{
		name: 'a step.wait event with waitedMs and step → a known kind, read, no field unknown',
		content: `${line({ id: 'ev-a', kind: 'step.wait', waitedMs: 1200, step: 'gate-full' })}\n`,
		expected: { ids: ['ev-a'], damaged: 0, unknownKinds: 0, unknownFields: 0 },
	},
	{
		name: 'a step.foreign event → a known kind, read',
		content: `${line({ id: 'ev-a', kind: 'step.foreign', step: 'gate-fast', worktree: '/w' })}\n`,
		expected: { ids: ['ev-a'], damaged: 0, unknownKinds: 0, unknownFields: 0 },
	},
	{
		name: 'an ask.* kind with a payload field → known, read, its payload fields not checked',
		content: `${line({ id: 'ev-a', kind: 'ask.read', zzzPayload: 3 })}\n`,
		expected: { ids: ['ev-a'], damaged: 0, unknownKinds: 0, unknownFields: 0 },
	},
	{
		name: 'an unknown field → the event is read, the field ignored and counted',
		content: `${line({ id: 'ev-a', zzzUnknown: 7 })}\n`,
		expected: { ids: ['ev-a'], damaged: 0, unknownKinds: 0, unknownFields: 1 },
	},
	{
		name: 'two unknown fields in one event → counted per field, 2',
		content: `${line({ id: 'ev-a', zzzUnknown: 7, zzzOther: 8 })}\n`,
		expected: { ids: ['ev-a'], damaged: 0, unknownKinds: 0, unknownFields: 2 },
	},
	{
		name: 'events out of order → sorted by at',
		content: [
			line({ id: 'ev-late', at: '2026-11-08T10:15:03.000Z' }),
			line({ id: 'ev-early', at: '2026-11-08T10:15:01.000Z' }),
			line({ id: 'ev-middle', at: '2026-11-08T10:15:02.000Z' }),
			'',
		].join('\n'),
		expected: {
			ids: ['ev-early', 'ev-middle', 'ev-late'],
			damaged: 0,
			unknownKinds: 0,
			unknownFields: 0,
		},
	},
	{
		name: 'events with the same at → kept in file position',
		content: [
			line({ id: 'ev-z', at: '2026-11-08T10:15:02.000Z' }),
			line({ id: 'ev-b', at: '2026-11-08T10:15:01.000Z' }),
			line({ id: 'ev-y', at: '2026-11-08T10:15:02.000Z' }),
			line({ id: 'ev-a', at: '2026-11-08T10:15:01.000Z' }),
			'',
		].join('\n'),
		expected: {
			ids: ['ev-b', 'ev-a', 'ev-z', 'ev-y'],
			damaged: 0,
			unknownKinds: 0,
			unknownFields: 0,
		},
	},
	{
		name: 'an empty file → no events, nothing counted',
		content: '',
		expected: { ids: [], damaged: 0, unknownKinds: 0, unknownFields: 0 },
	},
]

describe('readEvents', () => {
	for (const row of ROWS) {
		it(row.name, { timeout: STORE_CASE_TIMEOUT }, () => {
			expect(
				((result) => ({
					ids: result.events.map((event) => event.id),
					damaged: result.damaged,
					unknownKinds: result.unknownKinds,
					unknownFields: result.unknownFields,
				}))(readEvents({ file: fileWith(row.content) })),
			).toEqual(row.expected)
		})
	}

	it(
		'a step.wait event → its waitedMs comes back as written',
		{ timeout: STORE_CASE_TIMEOUT },
		() => {
			const file = fileWith(
				`${line({ id: 'ev-a', kind: 'step.wait', waitedMs: 1200, step: 'gate-full' })}\n`,
			)

			expect(readEvents({ file }).events[0]).toMatchObject({
				kind: 'step.wait',
				waitedMs: 1200,
				step: 'gate-full',
			})
		},
	)

	it('an unknown field → absent from the event read', { timeout: STORE_CASE_TIMEOUT }, () => {
		const file = fileWith(`${line({ id: 'ev-a', zzzUnknown: 7 })}\n`)

		expect(readEvents({ file }).events[0]).not.toHaveProperty('zzzUnknown')
	})

	it(
		'a known event → its envelope and kind fields come back as written',
		{ timeout: STORE_CASE_TIMEOUT },
		() => {
			const file = fileWith(`${line({ id: 'ev-a', exit: 0 })}\n`)

			expect(readEvents({ file }).events[0]).toMatchObject({
				schema: 1,
				id: 'ev-a',
				kind: 'station.end',
				by: 'host',
				run: 'run-1',
				station: 'implement',
				exit: 0,
			})
		},
	)

	it(
		'a file that does not exist → no events, nothing counted',
		{ timeout: STORE_CASE_TIMEOUT },
		() => {
			const folder = mkdtempSync(join(tmpdir(), 'read-events-'))
			folders.push(folder)

			expect(readEvents({ file: join(folder, 'events.jsonl') })).toEqual({
				events: [],
				damaged: 0,
				unknownKinds: 0,
				unknownFields: 0,
			})
		},
	)
})
