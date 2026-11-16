/**
 * A small TOML reader for pytest's settings: the values of a document by their dotted key paths, and its tables
 * (headers, and the tables dotted keys open). Strings (basic, literal, both multi-line) and arrays are read; every
 * other value (numbers, booleans, dates, inline tables) is kept as unread text. A line it cannot read is skipped.
 */
import type {
	TomlCursor as Cursor,
	TomlDocument,
	TomlRead as Read,
	TomlValue,
} from './tdd.types.ts'

export function readToml(text: string): TomlDocument {
	const values = new Map<string, TomlValue>()
	const tables = new Set<string>()
	let table: string[] = []
	let index = 0
	for (;;) {
		index = skipBlank({ text, index })
		if (index >= text.length) return { values, tables }
		if (text[index] === '[') {
			const header = readKeyPath({
				text,
				index: text.startsWith('[[', index) ? index + 2 : index + 1,
			})
			table = header.value
			for (const prefix of prefixesOf(table)) tables.add(prefix)
			index = lineEnd({ text, index: header.end })
			continue
		}
		const key = readKeyPath({ text, index })
		const equals = skipSpaces({ text, index: key.end })
		if (key.value.length === 0 || text[equals] !== '=') {
			index = lineEnd({ text, index })
			continue
		}
		const value = readValue({ text, index: skipSpaces({ text, index: equals + 1 }) })
		const path = [...table, ...key.value]
		values.set(path.join('.'), value.value)
		for (const prefix of prefixesOf(path.slice(0, -1))) tables.add(prefix)
		index = lineEnd({ text, index: value.end })
	}
}

/** Every table a path opens: `a`, `a.b`, `a.b.c` for `[a, b, c]`. */
function prefixesOf(path: readonly string[]): string[] {
	return path.map((_, position) => path.slice(0, position + 1).join('.'))
}

/** A dotted key: bare or quoted parts joined by `.`. */
function readKeyPath(cursor: Cursor): Read<string[]> {
	const { text } = cursor
	const parts: string[] = []
	let index = cursor.index
	for (;;) {
		index = skipSpaces({ text, index })
		const character = text[index]
		if (character === '"' || character === "'") {
			const part = readValue({ text, index })
			parts.push(typeof part.value === 'string' ? part.value : '')
			index = part.end
		} else {
			const bare = /^[A-Za-z0-9_-]+/.exec(text.slice(index))
			if (!bare) return { value: parts, end: index }
			parts.push(bare[0])
			index += bare[0].length
		}
		index = skipSpaces({ text, index })
		if (text[index] !== '.') return { value: parts, end: index }
		index++
	}
}

/** One value: a string of the four kinds, an array, or another value kept as unread. */
function readValue(cursor: Cursor): Read<TomlValue> {
	const { text, index } = cursor
	if (text.startsWith('"""', index)) return readMultilineString({ ...cursor, quote: '"""' })
	if (text.startsWith("'''", index)) return readMultilineString({ ...cursor, quote: "'''" })
	const character = text[index]
	if (character === '"') return readBasicString(cursor)
	if (character === "'") {
		const close = text.indexOf("'", index + 1)
		const stop = close < 0 ? text.length : close
		return { value: text.slice(index + 1, stop), end: stop + 1 }
	}
	if (character === '[') return readArray(cursor)
	if (character === '{') return readInlineTable(cursor)
	const raw = /^[^,\]}\n#]*/.exec(text.slice(index))?.[0] ?? ''
	return { value: { unread: raw.trim() }, end: index + raw.length }
}

function readBasicString(cursor: Cursor): Read<string> {
	const { text } = cursor
	let value = ''
	let index = cursor.index + 1
	while (index < text.length && text[index] !== '"') {
		if (text[index] === '\\') {
			const escaped = escapedCharacter({ text, index: index + 1 })
			value += escaped.value
			index = escaped.end
		} else value += text[index++]
	}
	return { value, end: index + 1 }
}

function readMultilineString(params: Cursor & { quote: string }): Read<string> {
	const { text, quote } = params
	const start = params.index + quote.length
	const close = text.indexOf(quote, start)
	const stop = close < 0 ? text.length : close
	// a newline right after the opening quotes is not part of the string
	const raw = text.slice(start, stop).replace(/^\r?\n/, '')
	const value =
		quote === "'''"
			? raw
			: raw
					.replace(/\\\r?\n\s*/g, '')
					.replace(/\\(["\\nt])/g, (_, escaped: string) =>
						escaped === 'n' ? '\n' : escaped === 't' ? '\t' : escaped,
					)
	return { value, end: stop + quote.length }
}

/** The character an escape stands for, the cursor on the character after the backslash. */
function escapedCharacter(cursor: Cursor): Read<string> {
	const { text, index } = cursor
	const character = text[index] ?? ''
	if (character === 'u' || character === 'U') {
		const length = character === 'u' ? 4 : 8
		const code = Number.parseInt(text.slice(index + 1, index + 1 + length), 16)
		return {
			value: Number.isNaN(code) ? '' : String.fromCodePoint(code),
			end: index + 1 + length,
		}
	}
	const named: Record<string, string> = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f' }
	return { value: named[character] ?? character, end: index + 1 }
}

function readArray(cursor: Cursor): Read<TomlValue[]> {
	const { text } = cursor
	const items: TomlValue[] = []
	let index = cursor.index + 1
	for (;;) {
		index = skipBlank({ text, index })
		if (index >= text.length) return { value: items, end: index }
		if (text[index] === ']') return { value: items, end: index + 1 }
		const item = readValue({ text, index })
		items.push(item.value)
		index = skipBlank({ text, index: Math.max(item.end, index + 1) })
		if (text[index] === ',') index++
	}
}

/** An inline table, skipped whole (strings in it respected): pytest's discovery settings are never one. */
function readInlineTable(cursor: Cursor): Read<TomlValue> {
	const { text } = cursor
	let depth = 0
	let index = cursor.index
	while (index < text.length) {
		const character = text[index]
		if (character === '"' || character === "'") {
			index = readValue({ text, index }).end
			continue
		}
		index++
		if (character === '{') depth++
		else if (character === '}' && --depth === 0) break
	}
	return { value: { unread: text.slice(cursor.index, index) }, end: index }
}

/** The index after the spaces and tabs at the cursor. */
function skipSpaces(cursor: Cursor): number {
	let index = cursor.index
	while (cursor.text[index] === ' ' || cursor.text[index] === '\t') index++
	return index
}

/** The index after the whitespace, newlines and comments at the cursor. */
function skipBlank(cursor: Cursor): number {
	let index = cursor.index
	for (;;) {
		const character = cursor.text[index]
		if (character === undefined) return index
		if (/\s/.test(character)) index++
		else if (character === '#') index = lineEnd({ text: cursor.text, index })
		else return index
	}
}

/** The index of the start of the next line. */
function lineEnd(cursor: Cursor): number {
	const newline = cursor.text.indexOf('\n', cursor.index)
	return newline < 0 ? cursor.text.length : newline + 1
}
