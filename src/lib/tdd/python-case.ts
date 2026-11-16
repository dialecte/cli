/**
 * The identity of a pytest case, read from the source the cli's pytest plugin reports for it (the test function's
 * text and its parameter row): its hash, whether it is new or changed since the base, and whether the base provably
 * holds it. The TypeScript readers never parse Python: these read the plugin's texts and the base text only.
 */
import { hashText } from './tdd-files.ts'
import { CASE_NAME_SEPARATOR, PYTHON_ROW_SEPARATOR } from './tdd.constants.ts'

import type { PythonCaseSource } from './tdd.types.ts'

/** sha256 of a pytest case's name and its source (the function's text and its row), whitespace normalised. */
export function pythonCaseHash(params: { name: string; source: PythonCaseSource }): string {
	const { name, source } = params
	return hashText(`${name}\0${normalized(source.call)}\0${normalized(source.row ?? '')}`)
}

/**
 * Whether a pytest case is new or changed since the base: its file is new (`baseText` undefined), or the base text
 * holds neither the function's text nor the row of the case.
 */
export function isPythonCaseOfChange(params: {
	source: PythonCaseSource
	baseText: string | undefined
}): boolean {
	const { source, baseText } = params
	if (baseText === undefined) return true
	if (!normalized(baseText).includes(normalized(source.call))) return true
	return source.row !== undefined && !holdsRow({ text: baseText, source })
}

/**
 * Whether the base provably holds the case, whatever its body: its function's `def` line as many times or more
 * than the file holds it now, every class of its name, and its row.
 */
export function isPythonCaseOfBase(params: {
	name: string
	source: PythonCaseSource
	/** The test file now. */
	text: string
	baseText: string | undefined
}): boolean {
	const { source, text, baseText } = params
	if (baseText === undefined) return false
	const functionName = functionNameOf(source.call)
	if (functionName === undefined) return false
	const atBase = defLineIndexes({ text: baseText, functionName }).length
	if (atBase === 0 || defLineIndexes({ text, functionName }).length > atBase) return false
	const classes = params.name.split(CASE_NAME_SEPARATOR).slice(0, -1)
	if (!classes.every((className) => holdsClass({ text: baseText, className }))) return false
	return source.row === undefined || holdsRow({ text: baseText, source })
}

/** The text with every run of whitespace one space, trimmed: a re-indent or a reflow keeps it. */
function normalized(text: string): string {
	return text.replace(/\s+/g, ' ').trim()
}

/** The name the function's text defines (`def <name>(`), or undefined when it defines none. */
function functionNameOf(call: string): string | undefined {
	return /^\s*(?:async\s+)?def\s+(\w+)\s*\(/.exec(call)?.[1]
}

/** The indexes of the lines of the text that define the function (`def <name>(`, at any indentation). */
function defLineIndexes(params: { text: string; functionName: string }): number[] {
	const pattern = new RegExp(`^\\s*(?:async\\s+)?def\\s+${params.functionName}\\s*\\(`)
	return params.text.split('\n').flatMap((line, index) => (pattern.test(line) ? [index] : []))
}

/** The text defines the class (`class <name>:` or `class <name>(`). */
function holdsClass(params: { text: string; className: string }): boolean {
	const escaped = params.className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
	return new RegExp(`^\\s*class\\s+${escaped}\\s*[(:]`, 'm').test(params.text)
}

/**
 * The text holds the case's row (each row of stacked decorators) as a whole element of a list or tuple written in
 * the decorators directly above a `def` of the case's function: bounded by `[`, `(` or `,` before and `,`, `]` or
 * `)` after, whitespace allowed. A row written anywhere else (another function's table, the body) is no proof.
 */
function holdsRow(params: { text: string; source: PythonCaseSource }): boolean {
	const { text, source } = params
	const functionName = functionNameOf(source.call)
	if (functionName === undefined || source.row === undefined) return false
	const lines = text.split('\n')
	const depths = bracketDepthsAtLineStarts(text)
	const blocks = defLineIndexes({ text, functionName }).map((defLine) =>
		decoratorBlock({ lines, depths, defLine }),
	)
	return source.row
		.split(PYTHON_ROW_SEPARATOR)
		.every((row) => blocks.some((block) => isElementOf({ block, row })))
}

/**
 * The decorator lines directly above the `def` line, as one text: going up, a line that starts with `@` or that
 * continues an open bracket belongs to it; the first other line ends it.
 */
function decoratorBlock(params: {
	lines: readonly string[]
	depths: readonly number[]
	defLine: number
}): string {
	const { lines, depths } = params
	let start = params.defLine
	while (start > 0 && (depths[start - 1] > 0 || lines[start - 1].trim().startsWith('@'))) start -= 1
	return lines.slice(start, params.defLine).join('\n')
}

/** The row is a whole element of a list or tuple of the block. */
function isElementOf(params: { block: string; row: string }): boolean {
	const row = params.row
		.trim()
		.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
		.replace(/\s+/g, '\\s*')
	if (row === '') return false
	return new RegExp(`[[(,]\\s*${row}\\s*[,\\])]`).test(params.block)
}

/**
 * The depth of open brackets (`(`, `[`, `{`) at the start of each line of a Python text, strings and comments
 * skipped: a line starting inside a bracket continues the statement above it.
 */
function bracketDepthsAtLineStarts(text: string): number[] {
	const depths = [0]
	let depth = 0
	let quote = ''
	let index = 0
	while (index < text.length) {
		const character = text[index]
		if (quote) {
			if (character === '\\') {
				index += 1
				if (text[index] === '\n') depths.push(depth)
			} else if (text.startsWith(quote, index)) {
				index += quote.length - 1
				quote = ''
			} else if (character === '\n') {
				// a one-quote string cannot cross a line: an unclosed one ends here
				if (quote.length === 1) quote = ''
				depths.push(depth)
			}
		} else if (character === '#') {
			const end = text.indexOf('\n', index)
			index = end < 0 ? text.length : end - 1
		} else if (character === '"' || character === "'") {
			quote = text.startsWith(character.repeat(3), index) ? character.repeat(3) : character
			index += quote.length - 1
		} else if ('([{'.includes(character)) depth += 1
		else if (')]}'.includes(character)) depth = Math.max(0, depth - 1)
		else if (character === '\n') depths.push(depth)
		index += 1
	}
	return depths
}
