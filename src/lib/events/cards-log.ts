import { readFileSync } from 'node:fs'

import {
	CARD_KIND,
	CARD_REQUIRED_FIELDS,
	CARDS_LOG_CUT_LIMIT,
	CARDS_LOG_LINE_LIMIT,
	CARDS_LOG_SCHEMA,
	REMOVED_KIND,
	REMOVED_REQUIRED_FIELDS,
	REMOVING_KIND,
	REMOVING_REQUIRED_FIELDS,
	UNKNOWN_OUTCOME,
} from './cards-log.constants.ts'
import { NO_EVENTS_FILE_CODES } from './events.constants.ts'
import { writeEvent } from './write-event.ts'

import type {
	CardInput,
	CardLine,
	CardsLogRead,
	LotCardsLog,
	Removal,
	RemovedInput,
	RemovingInput,
} from './cards-log.types.ts'
import type { LotEvent } from './event.types.ts'

/**
 * Appends a `card` line in one write (the limit is 64 KiB): only the card's `tdd` list is cut, after 40 entries,
 * with `cut: true` (`lots` and `merges` stay whole); a line still over the limit throws and writes nothing.
 */
export function writeCard(params: { file: string; line: CardInput }): void {
	const tdd = params.line.card?.tdd
	const cut = Array.isArray(tdd) && tdd.length > CARDS_LOG_CUT_LIMIT
	const line = cut
		? {
				...params.line,
				card: { ...params.line.card, tdd: tdd.slice(0, CARDS_LOG_CUT_LIMIT) },
				cut: true,
			}
		: params.line
	appendLine({ file: params.file, kind: CARD_KIND, fields: line })
}

/** Appends a `removing` line (the intent, before the move). */
export function writeRemoving(params: { file: string; line: RemovingInput }): void {
	appendLine({ file: params.file, kind: REMOVING_KIND, fields: params.line })
}

/** Appends a `removed` line (the outcome, after the move), carrying no lot of its own. */
export function writeRemoved(params: { file: string; line: RemovedInput }): void {
	appendLine({ file: params.file, kind: REMOVED_KIND, fields: params.line })
}

/**
 * Reads the log: damaged lines (and a final line without its newline) skipped and counted, the first `card` per key
 * (name, lot, state, head) kept, each `removing` joined to its `removed` by id (`unknown` without one).
 */
export function readCardsLog(params: { file: string }): CardsLogRead {
	const read: CardsLogRead = { cards: [], removals: [], damaged: 0, unknownKinds: 0 }
	const content = contentOf({ file: params.file })
	if (content === undefined) return read
	const lines = content.split('\n')
	// the text after the last `\n` is a line without its `\n`: never trusted
	const torn = lines.pop()
	if (torn !== undefined && torn !== '') read.damaged += 1
	const keys = new Set<string>()
	const removing: Record<string, unknown>[] = []
	const outcomes = new Map<string, Record<string, unknown>>()
	for (const text of lines) {
		const line = parseLine({ text })
		if (line === undefined) {
			read.damaged += 1
			continue
		}
		const required = requiredFieldsOf({ kind: line.kind })
		if (required === undefined) {
			read.unknownKinds += 1
			continue
		}
		if (!required.every((field) => Object.hasOwn(line, field))) {
			read.damaged += 1
			continue
		}
		if (line.kind === CARD_KIND) {
			const key = JSON.stringify([line.name, line.lot, line.state, line.head])
			if (keys.has(key)) continue
			keys.add(key)
			read.cards.push(line as unknown as CardLine)
		} else if (line.kind === REMOVING_KIND) removing.push(line)
		else if (!outcomes.has(String(line.id))) outcomes.set(String(line.id), line)
	}
	read.removals = removing.map((line) =>
		removalOf({ line, outcome: outcomes.get(String(line.id)) }),
	)
	return read
}

/** The final record of a lot: its latest card (by `at`, then position); undefined when it has none. */
export function finalCardOf(params: {
	cards: readonly CardLine[]
	lot: string
}): CardLine | undefined {
	let final: CardLine | undefined
	for (const card of params.cards) {
		if (card.lot !== params.lot) continue
		if (final === undefined || Date.parse(card.at) >= Date.parse(final.at)) final = card
	}
	return final
}

/** The lines of one lot: its cards, and the removals whose `removing` line names it. */
export function linesOfLot(params: { read: CardsLogRead; lot: string }): LotCardsLog {
	return {
		cards: params.read.cards.filter((card) => card.lot === params.lot),
		removals: params.read.removals.filter((removal) => removal.lot === params.lot),
	}
}

/**
 * The lines of one lot as the log holds them, byte for byte, in file order: its `card` and `removing` lines, and the
 * `removed` lines joined to its removals by id (they carry no lot). Damaged lines and a torn last line are left out;
 * none without a log.
 */
export function rawLinesOfLot(params: { file: string; lot: string }): string[] {
	const content = contentOf({ file: params.file })
	if (content === undefined) return []
	const lines = content.split('\n')
	lines.pop()
	const ids = new Set<string>()
	const kept: string[] = []
	for (const text of lines) {
		const line = parseLine({ text })
		if (line === undefined) continue
		if (line.kind === REMOVED_KIND) {
			if (ids.has(String(line.id))) kept.push(text)
			continue
		}
		if (line.lot !== params.lot) continue
		if (line.kind === REMOVING_KIND) ids.add(String(line.id))
		if (line.kind === CARD_KIND || line.kind === REMOVING_KIND) kept.push(text)
	}
	return kept
}

/** Appends one line of the kind, the schema and the kind first, through the events' one-write appender. */
function appendLine(params: { file: string; kind: string; fields: object }): void {
	const event = { schema: CARDS_LOG_SCHEMA, kind: params.kind, ...params.fields } as LotEvent
	writeEvent({ file: params.file, event, limit: CARDS_LOG_LINE_LIMIT })
}

/** The log's text, or undefined when there is none. */
function contentOf(params: { file: string }): string | undefined {
	try {
		return readFileSync(params.file, 'utf8')
	} catch (error) {
		if (NO_EVENTS_FILE_CODES.includes((error as NodeJS.ErrnoException).code ?? '')) return undefined
		throw error
	}
}

/** The object a line holds with a string `kind`; undefined for anything else. */
function parseLine(params: {
	text: string
}): (Record<string, unknown> & { kind: string }) | undefined {
	let value: unknown
	try {
		value = JSON.parse(params.text)
	} catch {
		return undefined
	}
	if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
	const line = value as Record<string, unknown>
	return typeof line.kind === 'string'
		? (line as Record<string, unknown> & { kind: string })
		: undefined
}

/** The fields a line of that kind must hold; undefined for a kind the log does not know. */
function requiredFieldsOf(params: { kind: string }): readonly string[] | undefined {
	if (params.kind === CARD_KIND) return CARD_REQUIRED_FIELDS
	if (params.kind === REMOVING_KIND) return REMOVING_REQUIRED_FIELDS
	return params.kind === REMOVED_KIND ? REMOVED_REQUIRED_FIELDS : undefined
}

/** A removal: its intent line without the schema and kind, joined to its first outcome line (`unknown` without one). */
function removalOf(params: {
	line: Record<string, unknown>
	outcome: Record<string, unknown> | undefined
}): Removal {
	const { schema: _schema, kind: _kind, ...intent } = params.line
	const { outcome } = params
	return {
		...(intent as RemovingInput),
		outcome: (outcome?.outcome as Removal['outcome'] | undefined) ?? UNKNOWN_OUTCOME,
		trashed: typeof outcome?.trashed === 'string' ? outcome.trashed : null,
		reason: typeof outcome?.reason === 'string' ? outcome.reason : null,
	}
}
