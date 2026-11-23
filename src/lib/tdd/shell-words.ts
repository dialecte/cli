/**
 * One shell tokenizer: quotes group (single quotes verbatim, double quotes unescaping `\"`, `\\`, `\$`, `` \` ``,
 * a newline), a backslash escapes the next character. `shellWords` reads one line as POSIX `shlex.split` does;
 * `shellCommands` reads a script's text as commands: split on its operators, `#` comments dropped, `$(...)` and
 * `${{ ... }}` kept whole, a line continuation joining its lines.
 */
import { DOUBLE_QUOTE_ESCAPES, SHELL_COMMAND_OPERATORS } from './tdd.constants.ts'

/** The words of a line as POSIX `shlex.split` makes them: quotes group, a backslash escapes, no comment. */
export function shellWords(line: string): string[] {
	return tokenize({ text: line, commands: false })[0] ?? []
}

/**
 * The commands of a shell text, each as its words: split on newlines, `&&`, `||`, `;`, `|` and `&` outside quotes,
 * `$(...)` and `${{ ... }}`; quotes removed from the words, `$(...)` and `${{ ... }}` kept whole, a `#` comment
 * dropped, a backslash escaping the next character (a line continuation joins the lines).
 */
export function shellCommands(text: string): string[][] {
	return tokenize({ text, commands: true })
}

/** The text's commands as their words; without `commands`, one command: no operator, comment nor group is read. */
function tokenize(params: { text: string; commands: boolean }): string[][] {
	const { text, commands: readsCommands } = params
	const commands: string[][] = []
	let words: string[] = []
	let word = ''
	let inWord = false
	function endWord(): void {
		if (inWord) words.push(word)
		word = ''
		inWord = false
	}
	function endCommand(): void {
		endWord()
		if (words.length) commands.push(words)
		words = []
	}
	let index = 0
	while (index < text.length) {
		const character = text[index] as string
		if (character === '\\') {
			const next = text[index + 1]
			// a line continuation joins the lines of a command
			if (next !== undefined && !(readsCommands && next === '\n')) {
				word += next
				inWord = true
			}
			index += 2
		} else if (character === "'") {
			const close = text.indexOf("'", index + 1)
			const stop = close < 0 ? text.length : close
			word += text.slice(index + 1, stop)
			inWord = true
			index = stop + 1
		} else if (character === '"') {
			const quoted = doubleQuotedAt({ text, index, groups: readsCommands })
			word += quoted.value
			inWord = true
			index = quoted.end
		} else if (readsCommands && (text.startsWith('$(', index) || text.startsWith('${{', index))) {
			const end = groupEndAt({ text, index })
			word += text.slice(index, end)
			inWord = true
			index = end
		} else if (readsCommands && character === '#' && !inWord) {
			const newline = text.indexOf('\n', index)
			index = newline < 0 ? text.length : newline
		} else {
			const operator = readsCommands ? operatorAt({ text, index }) : undefined
			if (operator !== undefined) {
				endCommand()
				index += operator.length
			} else if (/\s/.test(character)) {
				endWord()
				index++
			} else {
				word += character
				inWord = true
				index++
			}
		}
	}
	endCommand()
	return commands
}

/**
 * The end of the double-quoted text opening at `index`, and its value (`\"`, `\\`, `\$`, `` \` ``, a newline
 * unescaped); with `groups`, a `$(...)` inside kept whole.
 */
function doubleQuotedAt(params: { text: string; index: number; groups: boolean }): {
	value: string
	end: number
} {
	const { text } = params
	let value = ''
	let index = params.index + 1
	while (index < text.length && text[index] !== '"') {
		const next = text[index + 1]
		if (text[index] === '\\' && next !== undefined && DOUBLE_QUOTE_ESCAPES.includes(next)) {
			value += next
			index += 2
		} else if (params.groups && text.startsWith('$(', index)) {
			const end = groupEndAt({ text, index })
			value += text.slice(index, end)
			index = end
		} else {
			value += text[index]
			index++
		}
	}
	return { value, end: index + 1 }
}

/** The end (exclusive) of the `$(...)` or `${{ ... }}` opening at `index`: nested parentheses and quotes skipped. */
function groupEndAt(params: { text: string; index: number }): number {
	const { text, index } = params
	if (text.startsWith('${{', index)) {
		const close = text.indexOf('}}', index + 3)
		return close < 0 ? text.length : close + 2
	}
	let depth = 0
	for (let at = index + 1; at < text.length; at++) {
		const character = text[at]
		if (character === "'" || character === '"') {
			const close = text.indexOf(character, at + 1)
			if (close < 0) return text.length
			at = close
		} else if (character === '(') depth++
		else if (character === ')') {
			depth--
			if (depth === 0) return at + 1
		}
	}
	return text.length
}

/** The command operator at `index`, if any: a `&` of a redirection (`2>&1`, `&>`) is none. */
function operatorAt(params: { text: string; index: number }): string | undefined {
	const { text, index } = params
	const operator = SHELL_COMMAND_OPERATORS.find((candidate) => text.startsWith(candidate, index))
	if (operator !== '&') return operator
	const before = text[index - 1]
	const after = text[index + 1]
	return before === '>' || before === '<' || after === '>' ? undefined : operator
}
