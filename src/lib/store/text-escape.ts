/** Text an agent wrote, made safe to print: control characters and bidi overrides shown as escapes (33S case 40). */
import { DISPLAY_ESCAPED_RANGES, ESCAPE_RADIX } from './store.constants.ts'

/**
 * `value` made safe to print, whole (R5): every string it holds, at any depth, through `escapeControlCharacters`.
 * A text form takes the values it composes its lines from through it once, where it starts, so a field added later
 * is escaped too; the command's own line breaks are added after. JSON takes the values as stored.
 */
export function printableOf<Value>(value: Value): Value {
	if (typeof value === 'string') return escapeControlCharacters({ text: value }) as Value
	if (Array.isArray(value)) return value.map((item: unknown) => printableOf(item)) as Value
	if (typeof value === 'object' && value !== null)
		return Object.fromEntries(
			Object.entries(value).map(([key, inner]) => [key, printableOf(inner)]),
		) as Value
	return value
}

/**
 * `text` with every C0 control (tab and line breaks included), DEL, C1 control, U+202A-202E, U+2066-2069, U+200E,
 * U+200F, U+061C, U+2028 and U+2029 written as `\u{<hex>}` (lowercase hex, no padding); every other character kept.
 */
export function escapeControlCharacters(params: { text: string }): string {
	return Array.from(params.text, function escapeOf(character) {
		const code = character.codePointAt(0) ?? 0
		const escaped = DISPLAY_ESCAPED_RANGES.some(([first, last]) => code >= first && code <= last)
		return escaped ? `\\u{${code.toString(ESCAPE_RADIX)}}` : character
	}).join('')
}
