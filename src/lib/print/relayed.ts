/** The second print boundary: lines relayed from the cli's own child processes, keeping their SGR colours. */
import { LINE_FEED } from './print.constants.ts'
import { escapeControlCharacters, printOut } from './print.ts'
import {
	CHILD_LINE_END_PATTERN,
	CONCEAL_PARAMETER,
	ESCAPE_CHARACTER,
	EXTENDED_COLOUR_PARAMETERS,
	EXTENDED_COLOUR_VALUE_COUNTS,
	SGR_END,
	SGR_OPEN,
	SGR_PARAMETER_PATTERN,
	SGR_SEPARATOR,
} from './relayed.constants.ts'

import type { PrintedText, PrintStream } from './print.types.ts'

/**
 * `lines` joined with a line feed, each SGR sequence (`ESC [`, digits and `;`, `m`) kept as it is and every other
 * control escaped as `textOf` does.
 */
export function relayedTextOf(lines: readonly string[]): PrintedText {
	return lines.map(relayedLineOf).join(LINE_FEED) as PrintedText
}

/** The lines a child process printed, split at its line ends whatever they are (`\n` or CRLF; a lone CR stays). */
export function childLinesOf(output: string): string[] {
	return output.split(CHILD_LINE_END_PATTERN)
}

/** Writes the relayed `lines` and a line feed to the stream. */
export function printRelayed(params: { stream: PrintStream; lines: readonly string[] }): void {
	printOut({ stream: params.stream, text: relayedTextOf(params.lines) })
}

/** One line: its colour sequences kept (conceal dropped), everything else escaped. */
function relayedLineOf(line: string): string {
	let printed = ''
	let plainStart = 0
	let index = 0
	while (index < line.length) {
		const sequenceEnd = line[index] === ESCAPE_CHARACTER ? sgrEndOf({ line, start: index }) : -1
		if (sequenceEnd < 0) {
			index++
			continue
		}
		printed += escapeControlCharacters({ text: line.slice(plainStart, index) })
		printed += withoutConceal(line.slice(index + 2, sequenceEnd))
		index = sequenceEnd + 1
		plainStart = index
	}
	return printed + escapeControlCharacters({ text: line.slice(plainStart) })
}

/** The index of the `m` that ends the colour sequence opened at `start`, or -1 when none is opened there. */
function sgrEndOf(params: { line: string; start: number }): number {
	const { line, start } = params
	if (line[start + 1] !== SGR_OPEN) return -1
	let index = start + 2
	while (index < line.length && SGR_PARAMETER_PATTERN.test(line[index])) index++
	return line[index] === SGR_END ? index : -1
}

/**
 * The colour sequence of `parameters` with the conceal parameter dropped (an extended colour's values kept); none
 * when conceal was its only parameter, or when an extended colour has a mode other than 2 or 5 (the text stays).
 */
function withoutConceal(parameters: string): string {
	if (parameters === '') return `${ESCAPE_CHARACTER}${SGR_OPEN}${SGR_END}`
	const words = parameters.split(SGR_SEPARATOR)
	const kept: string[] = []
	let index = 0
	while (index < words.length) {
		const word = words[index]
		if (EXTENDED_COLOUR_PARAMETERS.includes(Number(word))) {
			const values = EXTENDED_COLOUR_VALUE_COUNTS.get(Number(words[index + 1]))
			// no colour a terminal reads as one: what follows may be a conceal, the sequence goes
			if (values === undefined) return ''
			const count = 2 + values
			kept.push(...words.slice(index, index + count))
			index += count
			continue
		}
		if (Number(word) !== CONCEAL_PARAMETER) kept.push(word)
		index++
	}
	if (kept.length === 0) return ''
	return `${ESCAPE_CHARACTER}${SGR_OPEN}${kept.join(SGR_SEPARATOR)}${SGR_END}`
}
