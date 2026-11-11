/** The print boundary: the one place that escapes a text for a terminal and the one writer of standard output and error. */
import { writeSync } from 'node:fs'

import {
	CARRIAGE_RETURN,
	DISPLAY_ESCAPED_RANGES,
	ESCAPE_RADIX,
	LINE_FEED,
	STREAM_DESCRIPTORS,
} from './print.constants.ts'

import type { PrintEnding, PrintedText, PrintStream } from './print.types.ts'

/**
 * `text` with every character of `DISPLAY_ESCAPED_RANGES` written as `\u{<hex>}` (lowercase hex, no padding); every
 * other character kept, the backslash included, so escaping twice changes nothing.
 */
export function escapeControlCharacters(params: { text: string }): string {
	return Array.from(params.text, function escapeOf(character) {
		const code = character.codePointAt(0) ?? 0
		const escaped = DISPLAY_ESCAPED_RANGES.some(([first, last]) => code >= first && code <= last)
		return escaped ? `\\u{${code.toString(ESCAPE_RADIX)}}` : character
	}).join('')
}

/** `lines` (one entry per printed line), each escaped once and joined with a line feed. */
export function textOf(lines: readonly string[]): PrintedText {
	return lines.map((line) => escapeControlCharacters({ text: line })).join(LINE_FEED) as PrintedText
}

/** The lines of a printed text, one entry per line, still escaped. */
export function linesOf(text: PrintedText): string[] {
	return text.split(LINE_FEED)
}

/** `value` as JSON text, never escaped. */
export function jsonOf(value: unknown, indent?: string | number): PrintedText {
	return JSON.stringify(value, null, indent) as PrintedText
}

/** Printed texts one after the other, a line feed between them (a form's own lines, then relayed ones). */
export function joinedOf(texts: readonly PrintedText[]): PrintedText {
	return texts.join(LINE_FEED) as PrintedText
}

/** `text` with its last line ended by a line feed (an answer printed `as-is`). */
export function endedOf(text: PrintedText): PrintedText {
	return `${text}${LINE_FEED}` as PrintedText
}

/** `text` put back at the start of its line: a carriage return before it, for a line refreshed in place. */
export function refreshedOf(text: PrintedText): PrintedText {
	return `${CARRIAGE_RETURN}${text}` as PrintedText
}

/**
 * Writes `text` to the stream: with a line feed after it (`ending: 'line'`, the default), or `as-is` (an answer
 * that ends its own last line, a line refreshed in place); an empty text `as-is` writes nothing. `synchronous`:
 * `writeSync` on the stream's descriptor until every byte is written (a short write loses nothing), so a closed pipe throws here (for the caller to catch) instead of raising
 * an asynchronous EPIPE that ends the process.
 */
export function printOut(params: {
	stream: PrintStream
	text: PrintedText
	ending?: PrintEnding
	synchronous?: boolean
}): void {
	const { text } = params
	const asIs = params.ending === 'as-is'
	if (asIs && text === '') return
	const written = asIs ? text : `${text}${LINE_FEED}`
	if (params.synchronous) {
		writeAllSync({ descriptor: STREAM_DESCRIPTORS[params.stream], text: written })
		return
	}
	const stream = params.stream === 'stdout' ? process.stdout : process.stderr
	stream.write(written)
}

/**
 * Writes every byte of `text` (UTF-8) to `descriptor`: the text itself first (one write in the common case), then the
 * bytes a short write left, calling `writeSync` again until none is left.
 */
function writeAllSync(params: { descriptor: number; text: string }): void {
	const bytes = Buffer.from(params.text, 'utf8')
	let offset = writeSync(params.descriptor, params.text)
	while (offset < bytes.length) {
		offset += writeSync(params.descriptor, bytes.subarray(offset))
	}
}

/** Writes the escaped `lines`, joined, and a line feed to the stream. */
export function printLines(params: { stream: PrintStream; lines: readonly string[] }): void {
	printOut({ stream: params.stream, text: textOf(params.lines) })
}
