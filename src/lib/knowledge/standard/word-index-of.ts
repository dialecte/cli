import { WORD_TOKEN_PATTERN } from './standard-search.constants.ts'
import { wordKeysOf } from './word-keys-of.ts'

import type { StandardWordIndex, WordIndexOfParams } from './standard-search.types.ts'

/**
 * The word index of a standard: every word of every logical line (kept whole and split into its parts)
 * by its stem, with the standard lines holding it in increasing order. It does not depend on the
 * installed dialectes: short vocabulary names are linked by the tag links instead.
 */
export function wordIndexOf(params: WordIndexOfParams): StandardWordIndex {
	const stems: Record<string, number[]> = Object.create(null)
	// the keys of each token are computed once per index build
	const keysOfToken = new Map<string, string[]>()
	let standardLine = 0
	for (const file of params.files)
		for (const line of file.logicalLines) {
			const lineStems = new Set<string>()
			for (const match of line.text.matchAll(WORD_TOKEN_PATTERN)) {
				const token = match[0]
				const keys = keysOfToken.get(token) ?? wordKeysOf({ token, split: true })
				keysOfToken.set(token, keys)
				for (const key of keys) lineStems.add(key)
			}
			for (const stem of lineStems) {
				const lines = stems[stem]
				if (lines) lines.push(standardLine)
				else stems[stem] = [standardLine]
			}
			standardLine++
		}
	return { logicalLineCount: standardLine, stems }
}
