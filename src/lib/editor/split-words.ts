/**
 * A command line split into words the way a shell splits a simple one, nothing run: whitespace separates words; a
 * single-quoted run is taken as written; a double-quoted run keeps its spaces, a backslash in it escaping `"`, `\`,
 * `$` and a backquote; outside quotes a backslash takes the next character as written. Quoted and plain runs side by
 * side make one word (`--title="two words"`). An unclosed quote runs to the end of the text.
 */
import { DOUBLE_QUOTED_ESCAPABLE } from './editor.constants.ts'

/** The words of `text`, split as the comment at the top of this file says; none for a blank text. */
export function splitWords(text: string): string[] {
	const words: string[] = []
	let word = ''
	let started = false
	let quote: '"' | "'" | undefined
	for (let index = 0; index < text.length; index += 1) {
		const character = text[index]
		if (quote === "'") {
			if (character === "'") quote = undefined
			else word += character
			continue
		}
		if (quote === '"') {
			if (character === '"') quote = undefined
			else if (character === '\\' && DOUBLE_QUOTED_ESCAPABLE.includes(text[index + 1] ?? '')) {
				word += text[index + 1]
				index += 1
			} else word += character
			continue
		}
		if (/\s/.test(character)) {
			if (started) words.push(word)
			word = ''
			started = false
			continue
		}
		started = true
		if (character === "'" || character === '"') quote = character
		else if (character === '\\' && index + 1 < text.length) {
			word += text[index + 1]
			index += 1
		} else word += character
	}
	if (started) words.push(word)
	return words
}
