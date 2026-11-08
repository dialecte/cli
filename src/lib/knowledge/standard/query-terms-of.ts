import { normaliseText } from './normalise-text.ts'
import {
	ABOUT_FACTOR,
	LOWERCASE_WORD_PATTERN,
	MINIMUM_WORD_LENGTH,
	WORD_TOKEN_PATTERN,
} from './standard-search.constants.ts'
import { wordKeysOf } from './word-keys-of.ts'

import type { StandardQueryTerm } from './standard-search.types.ts'

/**
 * The terms of a query, in query order: each whole word of the normalised query, a vocabulary name
 * (exact case) as a name - but a name in lowercase letters only of three characters or more, an ordinary
 * word - any other word by its stem (a stop word or a short word is no term). A term
 * typed twice counts once, as first typed. The tag the query is about comes last, counted twice.
 */
export function queryTermsOf(params: {
	query: string
	about?: string
	names: Set<string>
}): StandardQueryTerm[] {
	const { query, about, names } = params
	const terms: StandardQueryTerm[] = []
	const seen = new Set<string>()
	const aboutKey = about === undefined ? null : keyOf({ kind: 'name', key: about })
	for (const match of normaliseText(query).matchAll(WORD_TOKEN_PATTERN)) {
		const typed = match[0]
		const term = termOf({ typed, names })
		if (!term) continue
		const key = keyOf(term)
		if (seen.has(key) || key === aboutKey) continue
		seen.add(key)
		terms.push(term)
	}
	if (about !== undefined)
		terms.push({ typed: about, kind: 'name', key: about, factor: ABOUT_FACTOR })
	return terms
}

function termOf(params: { typed: string; names: Set<string> }): StandardQueryTerm | null {
	const { typed, names } = params
	if (names.has(typed) && !isOrdinaryWord(typed))
		return { typed, kind: 'name', key: typed, factor: 1 }
	const [stem] = wordKeysOf({ token: typed, split: false })
	return stem === undefined ? null : { typed, kind: 'word', key: stem, factor: 1 }
}

/**
 * A name written in lowercase letters only, at the minimum word length: ambiguous with prose, so a query
 * searches it as a word.
 */
function isOrdinaryWord(name: string): boolean {
	return name.length >= MINIMUM_WORD_LENGTH && LOWERCASE_WORD_PATTERN.test(name)
}

function keyOf(term: Pick<StandardQueryTerm, 'kind' | 'key'>): string {
	return `${term.kind}:${term.key}`
}
