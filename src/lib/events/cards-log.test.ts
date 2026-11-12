/**
 * `cards.log` (33L0 section 8; cases 1 (64 KiB half), 34, 35): written like events, read skipping what it cannot
 * trust. Readers are tried on files built by hand; writers on the file they leave.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { CARDS_LOG_LINE_LIMIT } from './cards-log.constants.ts'
import {
	finalCardOf,
	linesOfLot,
	readCardsLog,
	writeCard,
	writeRemoved,
	writeRemoving,
} from './cards-log.ts'

import { describe, expect, it } from 'vitest'

import type { CardInput, FrozenRecords, RemovingInput } from './cards-log.types.ts'

const CARDS_LOG_MODULE = join(import.meta.dirname, 'cards-log.ts')
const START_BARRIER_MS = 4_000
const TWO_PROCESS_CASE_TIMEOUT = 120_000
const BIG_NOTE_LENGTH = 65_000
const LOT = '0171-scl-subscribe'

// Orders the log promises: cards in file order (the first per key), removals in the order of their `removing` lines.

/** A new log file path in a temporary folder (nothing written). */
function logFile(): string {
	return join(temporaryFolder('cards-log-'), 'cards.log')
}

/** A log file holding these lines, each ended by a newline. */
function fileWith(lines: string[]): string {
	const file = logFile()
	writeFileSync(file, lines.map((line) => `${line}\n`).join(''))
	return file
}

/** A card of a committed lot; overrides win. Every field of the line is set. */
function cardOf(overrides: Partial<CardInput> = {}): CardInput {
	return {
		at: '2026-11-09T10:00:00.000Z',
		lot: LOT,
		name: 'hand-over-a',
		state: 'committed',
		feature: 'feature-a',
		repository: '/work/repository',
		branch: 'branch-a',
		head: 'a'.repeat(40),
		base: 'b'.repeat(40),
		card: { verdict: 'green', tdd: [] },
		usage: { stations: 3 },
		records: null,
		by: 'handover-run',
		recomputed: false,
		...overrides,
	}
}

/** A removing line; overrides win. Every field of the line is set. */
function removingOf(overrides: Partial<RemovingInput> = {}): RemovingInput {
	return {
		id: 'rm-1',
		at: '2026-11-09T11:00:00.000Z',
		lot: LOT,
		item: 'worktree',
		path: '/work/0171-scl-subscribe',
		branch: 'branch-a',
		tip: 'c'.repeat(40),
		records: null,
		by: 'lot-close',
		...overrides,
	}
}

/** The line a card is stored as. */
function cardLine(overrides: Partial<CardInput> = {}): string {
	return JSON.stringify({ schema: 1, kind: 'card', ...cardOf(overrides) })
}

/** The line a removing record is stored as. */
function removingLine(overrides: Partial<RemovingInput> = {}): string {
	return JSON.stringify({ schema: 1, kind: 'removing', ...removingOf(overrides) })
}

/** The line a removed record is stored as. */
function removedLine(fields: Record<string, unknown>): string {
	return JSON.stringify({ schema: 1, kind: 'removed', at: '2026-11-09T11:00:05.000Z', ...fields })
}

/** The lines of a file as parsed objects. */
function parsedLines(file: string): Record<string, unknown>[] {
	return readFileSync(file, 'utf8')
		.trim()
		.split('\n')
		.map((line) => JSON.parse(line) as Record<string, unknown>)
}

const RECORDS: FrozenRecords = {
	'gate-fast': '2026-11-09T10:01:00.000Z',
	'gate-full': null,
	'gate-release': null,
	contrib: '2026-11-09T10:02:00.000Z',
	'gate-hook': '2026-11-09T10:03:00.000Z',
	tdd: [
		{ at: '2026-11-09T09:00:00.000Z', step: 'tdd-red' },
		{ at: '2026-11-09T09:30:00.000Z', step: 'tdd-green' },
		{ at: '2026-11-09T09:40:00.000Z', step: null },
	],
	cut: true,
}

describe('the writers: one line per write', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a card written → one line holding the schema, the kind and every field given, nothing else', () => {
		const file = logFile()
		const line = cardOf({ records: RECORDS, recomputed: true, by: 'lot-close' })

		expect(() => writeCard({ file, line })).not.toThrow()
		expect(parsedLines(file)).toEqual([{ schema: 1, kind: 'card', ...line }])
	})

	it('a removing line written → one line holding the schema, the kind and every field given, nothing else', () => {
		const file = logFile()
		const line = removingOf({ records: RECORDS })

		expect(() => writeRemoving({ file, line })).not.toThrow()
		expect(parsedLines(file)).toEqual([{ schema: 1, kind: 'removing', ...line }])
	})

	it('a removed line written → one line, the schema and the kind added, carrying no lot', () => {
		const file = logFile()

		expect(() =>
			writeRemoved({
				file,
				line: { id: 'rm-1', at: '2026-11-09T11:00:05.000Z', outcome: 'trashed', trashed: '/t' },
			}),
		).not.toThrow()
		expect(parsedLines(file)).toEqual([
			{
				schema: 1,
				kind: 'removed',
				id: 'rm-1',
				at: '2026-11-09T11:00:05.000Z',
				outcome: 'trashed',
				trashed: '/t',
			},
		])
	})

	it('a file ending without a newline (a torn line), then a card written → the card is read, the torn line counted damaged', () => {
		const file = logFile()
		writeFileSync(file, '{"schema":1,"kind":"card","at":"')

		expect(() => writeCard({ file, line: cardOf({ head: '2'.repeat(40) }) })).not.toThrow()
		expect(readCardsLog({ file })).toMatchObject({
			cards: [{ head: '2'.repeat(40) }],
			damaged: 1,
		})
	})
})

describe('writeCard: cuts and the limit (case 35)', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a card of 200 tdd lines of 400 characters → cut to 40 (the first 40), cut true, the line under 64 KiB', () => {
		const file = logFile()
		const tdd = Array.from({ length: 200 }, (_, index) => `line ${index} ${'t'.repeat(400)}`)

		expect(() =>
			writeCard({ file, line: cardOf({ card: { verdict: 'green', tdd } }) }),
		).not.toThrow()
		expect(parsedLines(file)).toEqual([
			expect.objectContaining({ cut: true, card: { verdict: 'green', tdd: tdd.slice(0, 40) } }),
		])
		expect(Buffer.byteLength(readFileSync(file, 'utf8'))).toBeLessThan(CARDS_LOG_LINE_LIMIT)
	})

	it('a card of 200 tdd lines → the cut line parses back through the reader, nothing damaged', () => {
		const file = logFile()
		const tdd = Array.from({ length: 200 }, (_, index) => `line ${index} ${'t'.repeat(400)}`)

		expect(() => writeCard({ file, line: cardOf({ card: { tdd } }) })).not.toThrow()
		expect(readCardsLog({ file })).toMatchObject({ cards: [{ cut: true }], damaged: 0 })
	})

	it('a card whose tdd list holds 40 lines → not cut, no cut flag', () => {
		const file = logFile()

		expect(() =>
			writeCard({ file, line: cardOf({ card: { tdd: Array.from({ length: 40 }, () => 'x') } }) }),
		).not.toThrow()
		expect(parsedLines(file)[0]).not.toHaveProperty('cut')
	})

	it('a card of 50 lots and 50 merges (only tdd is cut) → kept whole, no cut flag', () => {
		const file = logFile()
		const lots = Array.from({ length: 50 }, (_, index) => ({ lot: `lot-${index}`, subject: 's' }))
		const merges = Array.from({ length: 50 }, (_, index) => ({ merge: `m-${index}`, subject: 's' }))
		const card = { verdict: 'green', tdd: [], lots, merges }

		expect(() => writeCard({ file, line: cardOf({ card }) })).not.toThrow()
		expect(parsedLines(file)).toEqual([expect.objectContaining({ card })])
		expect(parsedLines(file)[0]).not.toHaveProperty('cut')
	})

	it('a card whose line passes 64 KiB after the cuts → the write throws naming the limit, nothing written', () => {
		const file = logFile()

		expect(() =>
			writeCard({ file, line: cardOf({ card: { note: 'n'.repeat(CARDS_LOG_LINE_LIMIT) } }) }),
		).toThrow(/65,?536/)
		expect(existsSync(file)).toBe(false)
	})

	it('a refused card after a card was written → the written card untouched, no second line', () => {
		const file = fileWith([cardLine()])
		const before = readFileSync(file, 'utf8')

		expect(() =>
			writeCard({
				file,
				line: cardOf({ head: 'd'.repeat(40), card: { note: 'n'.repeat(CARDS_LOG_LINE_LIMIT) } }),
			}),
		).toThrow(/limit/)
		expect(readFileSync(file, 'utf8')).toBe(before)
	})
})

describe('writeCard: two writers of one key (case 34)', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a handover run and a lot close writing the same key → two lines in the file', () => {
		const file = logFile()

		expect(() => writeCard({ file, line: cardOf({ by: 'handover-run' }) })).not.toThrow()
		expect(() =>
			writeCard({
				file,
				line: cardOf({ by: 'lot-close', at: '2026-11-09T10:00:00.001Z', recomputed: true }),
			}),
		).not.toThrow()
		expect(parsedLines(file).map((line) => line.by)).toEqual(['handover-run', 'lot-close'])
	})

	it('the same two lines → the reader keeps one card, the first (written by the handover run)', () => {
		const file = fileWith([
			cardLine({ by: 'handover-run' }),
			cardLine({ by: 'lot-close', at: '2026-11-09T10:00:00.001Z', recomputed: true }),
		])

		expect(readCardsLog({ file }).cards.map((card) => card.by)).toEqual(['handover-run'])
	})

	it('one name, lot and head, one line committed and one canceled → both kept (the state is in the key)', () => {
		const file = fileWith([cardLine({ state: 'committed' }), cardLine({ state: 'canceled' })])

		expect(readCardsLog({ file }).cards.map((card) => card.state)).toEqual([
			'committed',
			'canceled',
		])
	})

	it('one lot, state and head under two names → both kept (the name is in the key)', () => {
		const file = fileWith([cardLine({ name: 'hand-over-a' }), cardLine({ name: 'hand-over-b' })])

		expect(readCardsLog({ file }).cards.map((card) => card.name)).toEqual([
			'hand-over-a',
			'hand-over-b',
		])
	})
})

describe('readCardsLog: the cards and the final record', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a log that does not exist → nothing read, nothing counted', () => {
		expect(readCardsLog({ file: logFile() })).toEqual({
			cards: [],
			removals: [],
			damaged: 0,
			unknownKinds: 0,
		})
	})

	it('a full card line (every field, a frozen records map, recomputed) → read back equal, schema and kind included', () => {
		const line = cardOf({ records: RECORDS, recomputed: true, by: 'lot-close' })
		const file = fileWith([JSON.stringify({ schema: 1, kind: 'card', ...line })])

		expect(readCardsLog({ file }).cards).toEqual([{ schema: 1, kind: 'card', ...line }])
	})

	it('two cards of one lot at two heads → both kept, the latest is the final record', () => {
		const file = fileWith([
			cardLine({ head: '1'.repeat(40), at: '2026-11-09T10:00:00.000Z' }),
			cardLine({ head: '2'.repeat(40), at: '2026-11-09T12:00:00.000Z' }),
		])

		expect(readCardsLog({ file }).cards).toHaveLength(2)
		expect(finalCardOf({ cards: readCardsLog({ file }).cards, lot: LOT })?.head).toBe(
			'2'.repeat(40),
		)
	})

	it('cards of one lot written out of time order → the final record is the latest by at', () => {
		const file = fileWith([
			cardLine({ head: '2'.repeat(40), at: '2026-11-09T12:00:00.000Z' }),
			cardLine({ head: '1'.repeat(40), at: '2026-11-09T10:00:00.000Z' }),
		])

		expect(finalCardOf({ cards: readCardsLog({ file }).cards, lot: LOT })?.head).toBe(
			'2'.repeat(40),
		)
	})

	it('two cards of one lot with the same at → the later line is the final record', () => {
		const file = fileWith([
			cardLine({ head: '1'.repeat(40), at: '2026-11-09T10:00:00.000Z' }),
			cardLine({ head: '2'.repeat(40), at: '2026-11-09T10:00:00.000Z' }),
		])

		expect(finalCardOf({ cards: readCardsLog({ file }).cards, lot: LOT })?.head).toBe(
			'2'.repeat(40),
		)
	})

	it('two canceled lots with no hand-over at one base commit → different lots, both kept', () => {
		const base = { state: 'canceled' as const, name: null, card: null, head: 'e'.repeat(40) }
		const file = fileWith([
			cardLine({ ...base, lot: '0001-lot-a' }),
			cardLine({ ...base, lot: '0002-lot-b' }),
		])

		expect(readCardsLog({ file }).cards.map((card) => card.lot)).toEqual([
			'0001-lot-a',
			'0002-lot-b',
		])
	})

	it('a lot with no card → no final record', () => {
		const file = fileWith([cardLine({ lot: '0001-lot-a' })])

		expect(finalCardOf({ cards: readCardsLog({ file }).cards, lot: '0002-lot-b' })).toBeUndefined()
	})

	it('a card with lot null (a hand-over outside the store) → read, valid, never the final record of a named lot', () => {
		const file = fileWith([cardLine({ lot: null })])

		expect(readCardsLog({ file })).toMatchObject({ cards: [{ lot: null }], damaged: 0 })
		expect(finalCardOf({ cards: readCardsLog({ file }).cards, lot: LOT })).toBeUndefined()
	})
})

describe('readCardsLog: removals', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a full removing line and its removed line → one removal, every field read back, joined by id', () => {
		const removing = removingOf({ records: RECORDS })
		const file = fileWith([
			JSON.stringify({ schema: 1, kind: 'removing', ...removing }),
			removedLine({ id: 'rm-1', outcome: 'trashed', trashed: '/trash/a' }),
		])

		expect(readCardsLog({ file }).removals).toEqual([
			{ ...removing, outcome: 'trashed', trashed: '/trash/a', reason: null },
		])
	})

	it('a removed line that keeps the item → outcome kept with its reason, trashed null', () => {
		const file = fileWith([
			removingLine(),
			removedLine({ id: 'rm-1', outcome: 'kept', reason: 'a file is not committed' }),
		])

		expect(readCardsLog({ file }).removals).toMatchObject([
			{ outcome: 'kept', reason: 'a file is not committed', trashed: null },
		])
	})

	it('a removing line without its removed line (a crash) → outcome unknown, trashed and reason null', () => {
		const file = fileWith([removingLine()])

		expect(readCardsLog({ file }).removals).toMatchObject([
			{ id: 'rm-1', outcome: 'unknown', trashed: null, reason: null },
		])
	})

	it('two removing lines and one removed line for the second only → the first unknown, the second its outcome', () => {
		const file = fileWith([
			removingLine({ id: 'rm-a' }),
			removingLine({ id: 'rm-b' }),
			removedLine({ id: 'rm-b', outcome: 'deleted' }),
		])

		expect(readCardsLog({ file }).removals).toMatchObject([
			{ id: 'rm-a', outcome: 'unknown' },
			{ id: 'rm-b', outcome: 'deleted' },
		])
	})

	it('two removing lines, their removed lines in reverse order → each joined by its id, in the order of the removing lines', () => {
		const file = fileWith([
			removingLine({ id: 'rm-a' }),
			removingLine({ id: 'rm-b' }),
			removedLine({ id: 'rm-b', outcome: 'deleted' }),
			removedLine({ id: 'rm-a', outcome: 'kept', reason: 'r' }),
		])

		expect(readCardsLog({ file }).removals).toMatchObject([
			{ id: 'rm-a', outcome: 'kept', reason: 'r' },
			{ id: 'rm-b', outcome: 'deleted' },
		])
	})

	it('a removed line whose id names no removing line → ignored, not a removal', () => {
		const file = fileWith([removedLine({ id: 'rm-9', outcome: 'deleted' })])

		expect(readCardsLog({ file }).removals).toEqual([])
	})

	it('two removed lines of one id → the first outcome kept', () => {
		const file = fileWith([
			removingLine(),
			removedLine({ id: 'rm-1', outcome: 'kept', reason: 'first' }),
			removedLine({ id: 'rm-1', outcome: 'trashed', trashed: '/t' }),
		])

		expect(readCardsLog({ file }).removals).toMatchObject([{ outcome: 'kept', reason: 'first' }])
	})

	it('the lines of one lot → its cards and the removals naming it, not those of another lot', () => {
		const file = fileWith([
			cardLine({ lot: '0001-lot-a' }),
			cardLine({ lot: '0002-lot-b' }),
			removingLine({ id: 'rm-a', lot: '0001-lot-a' }),
			removingLine({ id: 'rm-b', lot: '0002-lot-b' }),
			removedLine({ id: 'rm-a', outcome: 'deleted' }),
		])

		expect(linesOfLot({ read: readCardsLog({ file }), lot: '0001-lot-a' })).toMatchObject({
			cards: [{ lot: '0001-lot-a' }],
			removals: [{ id: 'rm-a', outcome: 'deleted' }],
		})
	})
})

describe('readCardsLog: lines it cannot trust', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a damaged line, a line of another kind and a torn final line between and after two cards → both cards read, damaged 2, one unknown kind', () => {
		const file = logFile()
		writeFileSync(
			file,
			`${cardLine({ head: '1'.repeat(40) })}\nnot json\n{"schema":1,"kind":"zzz"}\n${cardLine({ head: '2'.repeat(40) })}\n{"schema":1,"kind":"card","lot":`,
		)

		expect(readCardsLog({ file })).toMatchObject({
			cards: [{ head: '1'.repeat(40) }, { head: '2'.repeat(40) }],
			damaged: 2,
			unknownKinds: 1,
		})
	})

	it('an empty line between two cards → both cards read, not damaged (it holds no record)', () => {
		const file = logFile()
		writeFileSync(
			file,
			`${cardLine({ head: '1'.repeat(40) })}\n\n${cardLine({ head: '2'.repeat(40) })}\n`,
		)

		expect(readCardsLog({ file })).toMatchObject({
			cards: [{ head: '1'.repeat(40) }, { head: '2'.repeat(40) }],
			damaged: 0,
		})
	})

	it('a full card line without its lot field → skipped and counted damaged (lot null is a different, valid card)', () => {
		const withoutLot = Object.fromEntries(Object.entries(cardOf()).filter(([key]) => key !== 'lot'))
		const file = fileWith([JSON.stringify({ schema: 1, kind: 'card', ...withoutLot })])

		expect(readCardsLog({ file })).toMatchObject({ cards: [], damaged: 1 })
	})
})

describe('cards.log from two processes (case 1, the 64 KiB half)', () => {
	it(
		'two processes each appending two cards of about 64 KiB at once → four records, every one parses, none interleaved',
		{ timeout: TWO_PROCESS_CASE_TIMEOUT },
		async () => {
			const file = logFile()
			const startAt = Date.now() + START_BARRIER_MS
			const script = `
			const { writeCard } = await import(process.argv[1])
			while (Date.now() < Number(process.argv[3])) {}
			for (let index = 0; index < 2; index += 1) {
				writeCard({ file: process.argv[2], line: {
					at: new Date().toISOString(), lot: 'lot-' + process.pid + '-' + index, name: null, state: 'committed',
					feature: null, repository: '/r', branch: 'b', head: String(process.pid).padEnd(40, '0') + index,
					base: null, card: { note: 'n'.repeat(${BIG_NOTE_LENGTH}) }, usage: null, records: null, by: 'handover-run',
				} })
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
										pathToFileURL(CARDS_LOG_MODULE).href,
										file,
										String(startAt),
									],
									{ stdio: ['ignore', 'ignore', 'pipe'], timeout: TWO_PROCESS_CASE_TIMEOUT },
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
			expect({
				exits: outcomes,
				records: lines.filter((text) => text !== '').length,
				lastLineEmpty: lines.at(-1) === '',
			}).toEqual({
				exits: [
					{ exit: 0, stderr: '' },
					{ exit: 0, stderr: '' },
				],
				records: 4,
				lastLineEmpty: true,
			})
			expect(readCardsLog({ file })).toMatchObject({ damaged: 0 })
			expect(readCardsLog({ file }).cards).toHaveLength(4)
		},
	)
})
