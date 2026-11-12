import { spawn, type ChildProcess } from 'node:child_process'
import {
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
	writeSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { CUT_LIST_LIMIT, CUT_STRING_LIMIT, EVENT_LINE_LIMIT } from './events.constants.ts'
import { readEvents } from './read-events.ts'
import { cutEvent, makeEnvelope, writeEvent } from './write-event.ts'

import { afterEach, describe, expect, it } from 'vitest'

import type { LotEvent, MakeEnvelopeParams, WriteBuffer } from './event.types.ts'

const WRITE_EVENT_MODULE = join(import.meta.dirname, 'write-event.ts')
const APPENDS_PER_PROCESS = 1_000

/**
 * How long both children wait before their first write: far above the start of a node process on a loaded machine
 * (a second or two), so they start appending at the same instant.
 */
const START_BARRIER_MS = 4_000

/**
 * The bound of the two-process case: the barrier, two node starts and 2,000 appends (open, one write, close each,
 * well under a second on a quiet machine); a guard against a hang, never a measure of speed. Two minutes is far
 * above a loaded machine.
 */
const TWO_PROCESS_CASE_TIMEOUT = 120_000

const folders: string[] = []

afterEach(() => {
	for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true })
})

function makeFolder(): string {
	const folder = mkdtempSync(join(tmpdir(), 'write-event-'))
	folders.push(folder)
	return folder
}

/** A cli event with a literal envelope (the code under test makes none here), the fields of its kind in `fields`. */
function makeEvent(fields: Record<string, unknown> = {}): LotEvent {
	return {
		schema: 1,
		id: 'ev-20261108T101500123Z-48213-1',
		at: '2026-11-08T10:15:00.123Z',
		lot: '0171-scl-subscribe',
		kind: 'step.start',
		by: 'cli',
		pid: 48213,
		cli: '0.4.0',
		simulated: false,
		hostEvent: null,
		run: 'run-1',
		...fields,
	}
}

function FIXED_CLOCK() {
	return new Date(Date.UTC(2026, 10, 8, 10, 15, 0, 123))
}

/** Envelope parameters with the injected clock and pid; `overrides` change any of them. */
function envelopeParams(overrides: Partial<MakeEnvelopeParams> = {}): MakeEnvelopeParams {
	return {
		lot: 'lot-a',
		kind: 'step.start',
		by: 'cli',
		cli: '1.2.0',
		simulated: false,
		hostEvent: null,
		now: FIXED_CLOCK,
		pid: 48213,
		...overrides,
	}
}

function countByPid(events: LotEvent[]): Map<number, number> {
	const counts = new Map<number, number>()
	for (const event of events) counts.set(event.pid, (counts.get(event.pid) ?? 0) + 1)
	return counts
}

function isJsonObject(text: string): boolean {
	try {
		return typeof JSON.parse(text) === 'object'
	} catch {
		return false
	}
}

describe('writeEvent', () => {
	it(
		'an event → exactly one line of JSON ending with a newline, in a file made when missing',
		{ timeout: STORE_CASE_TIMEOUT },
		() => {
			const file = join(makeFolder(), 'events.jsonl')
			const event = makeEvent({ step: 'gate-fast' })

			expect(() => writeEvent({ file, event, limit: EVENT_LINE_LIMIT })).not.toThrow()
			expect(readFileSync(file, 'utf8')).toBe(`${JSON.stringify(event)}\n`)
		},
	)

	it('a file made by the writer → mode 0644', { timeout: STORE_CASE_TIMEOUT }, () => {
		const file = join(makeFolder(), 'events.jsonl')
		// a umask of 0 leaves the mode the writer asks for as it is: 0644 comes from the writer, not from the umask
		const previousMask = process.umask(0)

		try {
			expect(() => writeEvent({ file, event: makeEvent(), limit: EVENT_LINE_LIMIT })).not.toThrow()
			expect(statSync(file).mode & 0o777).toBe(0o644)
		} finally {
			process.umask(previousMask)
		}
	})

	it(
		'a second event → appended after the first, the first untouched',
		{ timeout: STORE_CASE_TIMEOUT },
		() => {
			const file = join(makeFolder(), 'events.jsonl')
			const first = makeEvent({ step: 'one' })
			const second = makeEvent({ step: 'two' })

			expect(() => {
				writeEvent({ file, event: first, limit: EVENT_LINE_LIMIT })
				writeEvent({ file, event: second, limit: EVENT_LINE_LIMIT })
			}).not.toThrow()
			expect(readFileSync(file, 'utf8')).toBe(
				`${JSON.stringify(first)}\n${JSON.stringify(second)}\n`,
			)
		},
	)

	it('a non-ASCII text → written as UTF-8', { timeout: STORE_CASE_TIMEOUT }, () => {
		const file = join(makeFolder(), 'events.jsonl')
		const event = makeEvent({ note: 'verifié ✓' })

		expect(() => writeEvent({ file, event, limit: EVENT_LINE_LIMIT })).not.toThrow()
		expect(readFileSync(file)).toEqual(Buffer.from(`${JSON.stringify(event)}\n`, 'utf8'))
	})

	it(
		'a file ending in a torn line → the line starts with a newline, in the same write',
		{ timeout: STORE_CASE_TIMEOUT },
		() => {
			const file = join(makeFolder(), 'events.jsonl')
			writeFileSync(file, '{"schema":1,"id":"ev-')
			const event = makeEvent()
			const writes: string[] = []
			function writeBuffer({ descriptor, buffer }: Parameters<WriteBuffer>[0]) {
				writes.push(buffer.toString('utf8'))
				return writeSync(descriptor, buffer)
			}

			expect(() => writeEvent({ file, event, limit: EVENT_LINE_LIMIT, writeBuffer })).not.toThrow()
			expect(writes).toEqual([`\n${JSON.stringify(event)}\n`])
			expect(readFileSync(file, 'utf8')).toBe(`{"schema":1,"id":"ev-\n${JSON.stringify(event)}\n`)
		},
	)

	it('an existing empty file → no leading newline', { timeout: STORE_CASE_TIMEOUT }, () => {
		const file = join(makeFolder(), 'events.jsonl')
		writeFileSync(file, '')
		const event = makeEvent()

		expect(() => writeEvent({ file, event, limit: EVENT_LINE_LIMIT })).not.toThrow()
		expect(readFileSync(file, 'utf8')).toBe(`${JSON.stringify(event)}\n`)
	})

	it('a line of exactly the limit in bytes → accepted', { timeout: STORE_CASE_TIMEOUT }, () => {
		const file = join(makeFolder(), 'events.jsonl')
		const base = makeEvent({ note: '' })
		const room = EVENT_LINE_LIMIT - Buffer.byteLength(`${JSON.stringify(base)}\n`, 'utf8')
		const event = makeEvent({ note: 'x'.repeat(room) })

		expect(() => writeEvent({ file, event, limit: EVENT_LINE_LIMIT })).not.toThrow()
		expect(Buffer.byteLength(readFileSync(file, 'utf8'), 'utf8')).toBe(EVENT_LINE_LIMIT)
	})

	it(
		'a line one byte over the limit → refused, no byte written',
		{ timeout: STORE_CASE_TIMEOUT },
		() => {
			const file = join(makeFolder(), 'events.jsonl')
			const base = makeEvent({ note: '' })
			const room = EVENT_LINE_LIMIT - Buffer.byteLength(`${JSON.stringify(base)}\n`, 'utf8')
			const event = makeEvent({ note: 'x'.repeat(room + 1) })

			expect(() => writeEvent({ file, event, limit: EVENT_LINE_LIMIT })).toThrow(/limit/)
			expect(existsSync(file)).toBe(false)
		},
	)

	it(
		'a non-ASCII line under the limit in characters, over it in bytes → refused',
		{ timeout: STORE_CASE_TIMEOUT },
		() => {
			const file = join(makeFolder(), 'events.jsonl')
			const event = makeEvent({ note: 'é'.repeat(EVENT_LINE_LIMIT - 400) })
			const line = `${JSON.stringify(event)}\n`

			expect({
				characters: line.length < EVENT_LINE_LIMIT,
				bytes: Buffer.byteLength(line, 'utf8') > EVENT_LINE_LIMIT,
			}).toEqual({ characters: true, bytes: true })
			expect(() => writeEvent({ file, event, limit: EVENT_LINE_LIMIT })).toThrow(/limit/)
			expect(existsSync(file)).toBe(false)
		},
	)

	it('a file ending in a newline → no leading newline', { timeout: STORE_CASE_TIMEOUT }, () => {
		const file = join(makeFolder(), 'events.jsonl')
		writeFileSync(file, 'first\n')
		const event = makeEvent()

		expect(() => writeEvent({ file, event, limit: EVENT_LINE_LIMIT })).not.toThrow()
		expect(readFileSync(file, 'utf8')).toBe(`first\n${JSON.stringify(event)}\n`)
	})

	it(
		'a torn line then two events → the reader finds the torn line damaged and both events whole',
		{ timeout: STORE_CASE_TIMEOUT },
		() => {
			const file = join(makeFolder(), 'events.jsonl')
			writeFileSync(file, '{"schema":1,"id":"ev-')
			const first = makeEvent({ step: 'one' })
			const second = makeEvent({ step: 'two' })

			expect(() => {
				writeEvent({ file, event: first, limit: EVENT_LINE_LIMIT })
				writeEvent({ file, event: second, limit: EVENT_LINE_LIMIT })
			}).not.toThrow()
			expect(
				((read) => ({ steps: read.events.map((event) => event.step), damaged: read.damaged }))(
					readEvents({ file }),
				),
			).toEqual({ steps: ['one', 'two'], damaged: 1 })
		},
	)

	it(
		'a line over the limit → refused, no byte written, no file made',
		{ timeout: STORE_CASE_TIMEOUT },
		() => {
			const file = join(makeFolder(), 'events.jsonl')
			const event = makeEvent({ note: 'x'.repeat(EVENT_LINE_LIMIT + 10) })

			expect(() => writeEvent({ file, event, limit: EVENT_LINE_LIMIT })).toThrow(/limit/)
			expect(existsSync(file)).toBe(false)
		},
	)

	it(
		'a line over the limit in an existing file → refused, the file unchanged',
		{ timeout: STORE_CASE_TIMEOUT },
		() => {
			const file = join(makeFolder(), 'events.jsonl')
			writeFileSync(file, 'first\n')
			const event = makeEvent({ note: 'x'.repeat(EVENT_LINE_LIMIT + 10) })

			expect(() => writeEvent({ file, event, limit: EVENT_LINE_LIMIT })).toThrow(/limit/)
			expect(readFileSync(file, 'utf8')).toBe('first\n')
		},
	)

	it(
		'a line over a smaller limit → refused: the limit is the one given',
		{ timeout: STORE_CASE_TIMEOUT },
		() => {
			const file = join(makeFolder(), 'events.jsonl')

			expect(() => writeEvent({ file, event: makeEvent(), limit: 100 })).toThrow(/limit/)
			expect(existsSync(file)).toBe(false)
		},
	)

	it(
		'a short write → a failure naming it, the write never retried',
		{ timeout: STORE_CASE_TIMEOUT },
		() => {
			const file = join(makeFolder(), 'events.jsonl')
			let calls = 0
			function writeBuffer({ buffer }: Parameters<WriteBuffer>[0]) {
				calls += 1
				return buffer.length - 1
			}

			expect(() =>
				writeEvent({ file, event: makeEvent(), limit: EVENT_LINE_LIMIT, writeBuffer }),
			).toThrow(/short write/)
			expect(calls).toBe(1)
		},
	)

	it(
		'a write that throws → the error reaches the caller, the write never retried',
		{ timeout: STORE_CASE_TIMEOUT },
		() => {
			const file = join(makeFolder(), 'events.jsonl')
			let calls = 0
			function writeBuffer(): number {
				calls += 1
				throw new Error('ENOSPC: no space left on device')
			}

			expect(() =>
				writeEvent({ file, event: makeEvent(), limit: EVENT_LINE_LIMIT, writeBuffer }),
			).toThrow(/ENOSPC/)
			expect(calls).toBe(1)
		},
	)
})

describe('writeEvent from two processes', () => {
	it(
		'1,000 events each at once to one file → every record parses, 2,000 records, none interleaved',
		{ timeout: TWO_PROCESS_CASE_TIMEOUT },
		async () => {
			const file = join(makeFolder(), 'events.jsonl')
			// both children wait for the same instant before their first write, so their appends overlap
			const startAt = Date.now() + START_BARRIER_MS
			const script = `
			const { makeEnvelope, writeEvent } = await import(process.argv[1])
			while (Date.now() < Number(process.argv[3])) {}
			for (let index = 0; index < ${APPENDS_PER_PROCESS}; index += 1) {
				const event = {
					...makeEnvelope({ lot: 'lot-a', kind: 'step.start', by: 'cli', cli: '0.4.0', simulated: false, hostEvent: null }),
					run: 'run-' + process.pid + '-' + index,
					padding: 'p'.repeat(200),
				}
				writeEvent({ file: process.argv[2], event, limit: ${EVENT_LINE_LIMIT} })
			}
		`
			const children: ChildProcess[] = []
			let outcomes: { exit: number | null; stderr: string }[] = []
			try {
				outcomes = await Promise.all(
					[1, 2].map(
						() =>
							new Promise<{ exit: number | null; stderr: string }>((resolve) => {
								const child = spawn(
									process.execPath,
									[
										'--input-type=module',
										'-e',
										script,
										pathToFileURL(WRITE_EVENT_MODULE).href,
										file,
										String(startAt),
									],
									{ stdio: ['ignore', 'ignore', 'pipe'] },
								)
								children.push(child)
								let stderr = ''
								child.stderr?.on('data', (chunk) => (stderr += String(chunk)))
								child.on('exit', (code) => resolve({ exit: code, stderr: stderr.slice(0, 500) }))
								child.on('error', (error) => resolve({ exit: null, stderr: String(error) }))
							}),
					),
				)
			} finally {
				for (const child of children) child.kill('SIGKILL')
			}

			// a writer's torn-line check may see the other's append mid-write and add an empty line: no record
			const lines = existsSync(file) ? readFileSync(file, 'utf8').split('\n') : []
			const records = lines.filter((text) => text !== '')
			expect({
				exits: outcomes,
				records: records.length,
				lastLineEmpty: lines.at(-1) === '',
				parsable: records.length > 0 && records.every(isJsonObject),
				...((read) => ({
					read: read.events.length,
					damaged: read.damaged,
					countsPerProcess: [...countByPid(read.events).values()],
				}))(readEvents({ file })),
			}).toEqual({
				exits: [
					{ exit: 0, stderr: '' },
					{ exit: 0, stderr: '' },
				],
				records: 2 * APPENDS_PER_PROCESS,
				lastLineEmpty: true,
				parsable: true,
				read: 2 * APPENDS_PER_PROCESS,
				damaged: 0,
				countsPerProcess: [APPENDS_PER_PROCESS, APPENDS_PER_PROCESS],
			})
		},
	)
})

describe('makeEnvelope', () => {
	it('a host event → every envelope field, the id from the clock, the pid and a counter', () => {
		expect(
			((envelope) => ({ ...envelope, id: envelope.id.replace(/-\d+$/, '-<n>') }))(
				makeEnvelope(
					envelopeParams({
						lot: '0171-scl-subscribe',
						kind: 'station.end',
						by: 'host',
						hostEvent: 'h-7',
					}),
				),
			),
		).toEqual({
			schema: 1,
			id: 'ev-20261108T101500123Z-48213-<n>',
			at: '2026-11-08T10:15:00.123Z',
			lot: '0171-scl-subscribe',
			kind: 'station.end',
			by: 'host',
			pid: 48213,
			cli: '1.2.0',
			simulated: false,
			hostEvent: 'h-7',
		})
	})

	it('a local time that differs from UTC → the id and at are in UTC', () => {
		const previousZone = process.env.TZ
		process.env.TZ = 'Pacific/Auckland'

		try {
			expect(
				((envelope) => ({ id: envelope.id.replace(/-\d+$/, '-<n>'), at: envelope.at }))(
					makeEnvelope(
						envelopeParams({ now: () => new Date(Date.UTC(2026, 10, 8, 23, 30, 0, 123)) }),
					),
				),
			).toEqual({ id: 'ev-20261108T233000123Z-48213-<n>', at: '2026-11-08T23:30:00.123Z' })
		} finally {
			if (previousZone === undefined) delete process.env.TZ
			else process.env.TZ = previousZone
		}
	})

	it('no worktreeCli given → the field is omitted, not null', () => {
		expect(makeEnvelope(envelopeParams())).not.toHaveProperty('worktreeCli')
	})

	it('a worktreeCli given → carried as given', () => {
		expect(
			makeEnvelope(
				envelopeParams({ simulated: true, worktreeCli: { version: '0.3.1', stepEvents: false } }),
			),
		).toMatchObject({ worktreeCli: { version: '0.3.1', stepEvents: false }, simulated: true })
	})

	it('a worktreeCli null (the worktree holds no cli) → carried as null', () => {
		expect(makeEnvelope(envelopeParams({ worktreeCli: null }))).toHaveProperty('worktreeCli', null)
	})

	it('a lot null (an ask outside a lot) → the lot is null', () => {
		expect(makeEnvelope(envelopeParams({ lot: null, kind: 'ask.read' }))).toHaveProperty(
			'lot',
			null,
		)
	})

	it('two calls in one process → n counts 1 more each time, ids differ', () => {
		function counterOf(id: string) {
			return Number(/^ev-\d{8}T\d{9}Z-48213-(\d+)$/.exec(id)?.[1])
		}

		expect(
			((ids) => ({ step: counterOf(ids[1]) - counterOf(ids[0]), distinct: new Set(ids).size }))([
				makeEnvelope(envelopeParams()).id,
				makeEnvelope(envelopeParams()).id,
			]),
		).toEqual({ step: 1, distinct: 2 })
	})

	it('no clock and no pid given → the real ones: an ISO at, the process pid, an id of the pattern', () => {
		expect(
			((envelope) => ({
				idMatches: new RegExp(`^ev-\\d{8}T\\d{9}Z-${process.pid}-\\d+$`).test(envelope.id),
				pid: envelope.pid,
				atIsIso: new Date(envelope.at).toISOString() === envelope.at,
			}))(makeEnvelope(envelopeParams({ now: undefined, pid: undefined }))),
		).toEqual({ idMatches: true, pid: process.pid, atIsIso: true })
	})
})

describe('cutEvent', () => {
	it('a list of 300 parts → cut to the first 40, cut true', () => {
		const parts = Array.from({ length: 300 }, (_, index) => ({
			name: `p${index}`,
			status: 'passed',
		}))

		expect(cutEvent({ event: makeEvent({ parts }) })).toMatchObject({
			parts: parts.slice(0, CUT_LIST_LIMIT),
			cut: true,
		})
	})

	it('a list of exactly 40 → untouched, no cut field', () => {
		const parts = Array.from({ length: CUT_LIST_LIMIT }, (_, index) => `p${index}`)
		const event = makeEvent({ parts })

		expect(cutEvent({ event })).toEqual(event)
	})

	it('a string of 500 characters → cut to 200 characters, cut true', () => {
		const failing = Array.from({ length: 500 }, (_, index) =>
			String.fromCharCode(97 + (index % 26)),
		).join('')

		expect(cutEvent({ event: makeEvent({ failing }) })).toMatchObject({
			failing: failing.slice(0, CUT_STRING_LIMIT),
			cut: true,
		})
	})

	it('a cut → the event given is left unchanged', () => {
		const parts = Array.from({ length: 300 }, (_, index) => ({ name: `p${index}` }))
		const event = makeEvent({ parts, failing: 'f'.repeat(500) })
		const before = structuredClone(event)

		expect([cutEvent({ event }).cut, event]).toEqual([true, before])
	})

	it('a string of exactly 200 characters → untouched, no cut field', () => {
		const event = makeEvent({ failing: 'f'.repeat(CUT_STRING_LIMIT) })

		expect(cutEvent({ event })).toEqual(event)
	})

	it('a string and a list inside a part → cut too', () => {
		const long = Array.from({ length: 300 }, (_, index) =>
			String.fromCharCode(97 + (index % 26)),
		).join('')
		const failing = [long, ...Array.from({ length: 60 }, (_, index) => `y${index}`)]

		expect(cutEvent({ event: makeEvent({ parts: [{ name: 'p', failing }] }) })).toMatchObject({
			parts: [
				{
					name: 'p',
					failing: [long.slice(0, CUT_STRING_LIMIT), ...failing.slice(1, CUT_LIST_LIMIT)],
				},
			],
			cut: true,
		})
	})

	it('an event already small → returned equal, no cut field', () => {
		const event = makeEvent({
			step: 'gate-fast',
			parts: [{ name: 'type-check', status: 'passed' }],
		})

		expect(cutEvent({ event })).toEqual(event)
	})

	it(
		'an event of 300 parts → after the cut, under 4,096 bytes, accepted by the writer, parsable with cut true',
		{ timeout: STORE_CASE_TIMEOUT },
		() => {
			const parts = Array.from({ length: 300 }, (_, index) => ({
				name: `part-${index}`,
				status: 'passed',
				durationMs: index,
			}))
			const file = join(makeFolder(), 'events.jsonl')

			expect(
				((cut) => {
					writeEvent({ file, event: cut, limit: EVENT_LINE_LIMIT })
					const written = JSON.parse(readFileSync(file, 'utf8')) as {
						parts: unknown[]
						cut: boolean
					}
					return {
						underLimit: Buffer.byteLength(JSON.stringify(cut), 'utf8') < EVENT_LINE_LIMIT,
						parts: written.parts.length,
						cut: written.cut,
					}
				})(cutEvent({ event: makeEvent({ step: 'gate-full', parts }) })),
			).toEqual({ underLimit: true, parts: CUT_LIST_LIMIT, cut: true })
		},
	)
})
