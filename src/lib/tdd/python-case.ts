/**
 * The identity of a pytest case, read from the source the cli's pytest plugin reports for it (the test function's
 * text and its parameter row): its hash, whether it is new or changed since the base, and whether the base provably
 * holds it. The TypeScript readers never parse Python: these read the plugin's texts and the base text only.
 */
import { hashText } from './tdd-files.ts'
import {
	CASE_NAME_SEPARATOR,
	PYTHON_DEF_LINE_PATTERN,
	PYTHON_PARAMETRIZE_DECORATOR_PATTERN,
	PYTHON_ROW_SEPARATOR,
} from './tdd.constants.ts'

import type { PythonCallParts, PythonCaseSource } from './tdd.types.ts'

/** sha256 of a pytest case's name and its source (the function's text and its row), whitespace normalised. */
export function pythonCaseHash(params: { name: string; source: PythonCaseSource }): string {
	return hashText(`${params.name}\0${pythonCaseBody(params.source)}`)
}

/** What a pytest case's hash covers besides its name: the function's text, its row and its parametrize settings, whitespace normalised. */
export function pythonCaseBody(source: PythonCaseSource): string {
	return [source.call, source.row ?? '', source.parametrize ?? ''].map(normalized).join('\0')
}

/**
 * Whether a pytest case is new or changed since the base: its file is new (`baseText` undefined), or the base text
 * lacks the function's text from its `def` on, or its decorators in order and count above a `def` of that function
 * (the parametrize ones left out, so a table line between them changes nothing), or the row of the case. A text
 * defining no function is a change.
 */
export function isPythonCaseOfChange(params: {
	source: PythonCaseSource
	baseText: string | undefined
}): boolean {
	const { source, baseText } = params
	if (baseText === undefined) return true
	const parts = callPartsOf(source.call)
	if (parts === undefined) return true
	if (!normalized(baseText).includes(normalized(parts.body))) return true
	if (!holdsDecorators({ text: baseText, parts })) return true
	return (
		source.row !== undefined &&
		!holdsRow({ text: baseText, functionName: parts.functionName, row: source.row })
	)
}

/**
 * Whether the base provably holds the case, whatever its body: its function's `def` line as many times or more
 * than the file holds it now, its decorators as they are (order and count), every class of its name, and its row.
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
	const parts = callPartsOf(source.call)
	if (parts === undefined) return false
	const { functionName } = parts
	const atBase = defLineIndexes({ text: baseText, functionName }).length
	if (atBase === 0 || defLineIndexes({ text, functionName }).length > atBase) return false
	if (!holdsDecorators({ text: baseText, parts })) return false
	const classes = params.name.split(CASE_NAME_SEPARATOR).slice(0, -1)
	if (!classes.every((className) => holdsClass({ text: baseText, className }))) return false
	return source.row === undefined || holdsRow({ text: baseText, functionName, row: source.row })
}

/** The text with every run of whitespace one space, trimmed: a re-indent or a reflow keeps it. */
function normalized(text: string): string {
	return text.replace(/\s+/g, ' ').trim()
}

/**
 * The function's text split at its first `def <name>(` line outside a bracket (any line of it: the plugin writes the
 * kept decorators above it), or undefined when it defines none.
 */
function callPartsOf(call: string): PythonCallParts | undefined {
	const lines = call.split('\n')
	const depths = bracketDepthsAtLineStarts(call)
	const defLine = lines.findIndex(
		(line, index) => depths[index] === 0 && PYTHON_DEF_LINE_PATTERN.test(line),
	)
	if (defLine < 0) return undefined
	const functionName = PYTHON_DEF_LINE_PATTERN.exec(lines[defLine])?.[1]
	if (functionName === undefined) return undefined
	return {
		functionName,
		decorators: decoratorsOf(lines.slice(0, defLine).join('\n')),
		body: lines.slice(defLine).join('\n'),
	}
}

/** Each decorator of a text of decorator lines, normalised: a line starting with `@` outside a bracket opens one. */
function decoratorsOf(text: string): string[] {
	const depths = bracketDepthsAtLineStarts(text)
	const decorators: string[] = []
	text.split('\n').forEach(function addLine(line, index) {
		if (depths[index] === 0 && line.trim().startsWith('@')) decorators.push(line)
		else if (decorators.length) decorators[decorators.length - 1] += `\n${line}`
	})
	return decorators.map(normalized)
}

/**
 * The case's decorators are, in order and count, the non-parametrize decorators directly above one `def` of its
 * function in the text: a reorder (it changes how mocks bind), a duplicate, one added or one removed is no match.
 */
function holdsDecorators(params: { text: string; parts: PythonCallParts }): boolean {
	const { parts } = params
	return decoratorBlocks({ text: params.text, functionName: parts.functionName }).some(
		function equalsCaseDecorators(block) {
			const kept = decoratorsOf(block).filter(
				(decorator) => !PYTHON_PARAMETRIZE_DECORATOR_PATTERN.test(decorator),
			)
			return (
				kept.length === parts.decorators.length &&
				kept.every((decorator, index) => decorator === parts.decorators[index])
			)
		},
	)
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
function holdsRow(params: { text: string; functionName: string; row: string }): boolean {
	const blocks = decoratorBlocks({ text: params.text, functionName: params.functionName })
	return params.row
		.split(PYTHON_ROW_SEPARATOR)
		.every((row) => blocks.some((block) => isElementOf({ block, row })))
}

/** The decorator block of each `def` of the function in the text. */
function decoratorBlocks(params: { text: string; functionName: string }): string[] {
	const { text } = params
	const lines = text.split('\n')
	const depths = bracketDepthsAtLineStarts(text)
	return defLineIndexes({ text, functionName: params.functionName }).map((defLine) =>
		decoratorBlock({ lines, depths, defLine }),
	)
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
