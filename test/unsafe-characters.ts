/** What a command's printed text shows of the characters a terminal acts on (or that reorder it). */
import { DISPLAY_ESCAPED_RANGES } from '../src/lib/print/print.constants.ts'
import {
	ESCAPED_ESCAPE,
	ESCAPED_LINE_FEED,
	ESCAPED_OVERRIDE,
	RAW_HOSTILE_CHARACTERS,
} from './unsafe-characters.constants.ts'

import type { CommandResult } from '../src/lib/command-result.types.ts'

/**
 * The characters of `text` a terminal would act on: none when it is safe to print. The command's own line breaks
 * are the `lines - 1` line feeds between its `lines` lines; each line feed beyond them (one an agent's text brought
 * in, a forged line) is reported as `\n`.
 */
export function unsafeCharactersIn(params: { text: string; lines: number }): string[] {
	const { text, lines } = params
	const printedLines = text.split('\n')
	const forged = Array.from({ length: Math.max(0, printedLines.length - lines) }, () => '\n')
	const unsafe = Array.from(printedLines.join('')).filter(function isUnsafe(character) {
		const code = character.codePointAt(0) ?? 0
		return DISPLAY_ESCAPED_RANGES.some(([first, last]) => code >= first && code <= last)
	})
	return [...forged, ...unsafe]
}

/** The raw right-to-left override and escape character `text` holds (each once, in that order); none when it holds neither. */
export function rawHostileCharactersIn(text: string): string[] {
	return RAW_HOSTILE_CHARACTERS.filter((character) => text.includes(character))
}

/**
 * Whether the result's text holds no unsafe character and no line beyond the `lines` the command prints, and
 * whether it shows the escape and the override (and a line feed of the agent's text) as escapes.
 */
export function escapeReportOf(params: { result: CommandResult; lines: number }): {
	unsafe: string[]
	showsEscapes: boolean
	showsLineFeed: boolean
} {
	const { output } = params.result
	return {
		unsafe: unsafeCharactersIn({ text: output, lines: params.lines }),
		showsEscapes: output.includes(ESCAPED_ESCAPE) && output.includes(ESCAPED_OVERRIDE),
		showsLineFeed: output.includes(ESCAPED_LINE_FEED),
	}
}
