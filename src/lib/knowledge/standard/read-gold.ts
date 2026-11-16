import { readFileSync } from 'node:fs'

import { fillMessage } from './fill-message.ts'
import { GOLD_KIND_SEPARATOR, GOLD_KINDS, GOLD_MESSAGES } from './read-gold.constants.ts'

import type { GoldKind, StandardGoldExpected, StandardGoldItem } from './standard-search.types.ts'

/**
 * The gold items of a JSON-lines file (blank lines skipped), each keeping its `kind`, `answer` and `status`, or why
 * the file cannot be read (U9: moved here from the `standard` command).
 */
export function readGold(params: { path: string }): StandardGoldItem[] | string {
	let text: string
	try {
		text = readFileSync(params.path, 'utf8')
	} catch {
		return fillMessage({
			template: GOLD_MESSAGES.unreadable,
			values: { path: params.path },
		})
	}
	const items: StandardGoldItem[] = []
	for (const [index, line] of text.split('\n').entries()) {
		if (line.trim() === '') continue
		const reason = goldItemOf({ line })
		if (typeof reason === 'string')
			return fillMessage({
				template: GOLD_MESSAGES.malformed,
				values: { path: params.path, line: String(index + 1), reason },
			})
		items.push(reason)
	}
	return items
}

/** One gold line as an item, or what is wrong with it. */
function goldItemOf(params: { line: string }): StandardGoldItem | string {
	let parsed: unknown
	try {
		parsed = JSON.parse(params.line)
	} catch {
		return GOLD_MESSAGES.notJson
	}
	if (typeof parsed !== 'object' || parsed === null) return GOLD_MESSAGES.notJson
	const { question, about, kind, answer, status, expected } = parsed as Record<string, unknown>
	const expectedValid =
		Array.isArray(expected) &&
		expected.every(
			(entry: unknown) =>
				typeof entry === 'object' &&
				entry !== null &&
				typeof (entry as Record<string, unknown>).file === 'string' &&
				typeof (entry as Record<string, unknown>).quote === 'string',
		)
	if (typeof question !== 'string' || !expectedValid) return GOLD_MESSAGES.shape
	for (const optional of [about, answer, status])
		if (optional !== undefined && typeof optional !== 'string') return GOLD_MESSAGES.shape
	if (kind !== undefined && !isGoldKind(kind)) return unknownKindMessageOf({ kind })
	return {
		question,
		...(about === undefined ? {} : { about: about as string }),
		...(kind === undefined ? {} : { kind }),
		...(answer === undefined ? {} : { answer: answer as string }),
		...(status === undefined ? {} : { status: status as string }),
		// a file id is lowercased, as every id is
		expected: expected.map((entry: StandardGoldExpected) => ({
			file: entry.file.toLowerCase(),
			quote: entry.quote,
		})),
	}
}

function isGoldKind(value: unknown): value is GoldKind {
	return GOLD_KINDS.some((kind) => kind === value)
}

/** The refusal of a kind that is not one of the four: the value as written and the four kinds. */
function unknownKindMessageOf(params: { kind: unknown }): string {
	return fillMessage({
		template: GOLD_MESSAGES.unknownKind,
		values: {
			kind: typeof params.kind === 'string' ? params.kind : JSON.stringify(params.kind),
			kinds: GOLD_KINDS.join(GOLD_KIND_SEPARATOR),
		},
	})
}
