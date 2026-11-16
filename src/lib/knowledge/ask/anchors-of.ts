import { tokensOf } from './tokens-of.ts'

import type { AskSubjectTerms } from './ask.types.ts'

/** The names of the ask's subject: its tags and attributes, else its terms (a code, a method, free words). */
export function subjectNamesOf(params: { subject: AskSubjectTerms }): string[] {
	const { tags, attributes, terms } = params.subject
	const named = [...tags, ...attributes]
	return named.length > 0 ? named : terms
}

/** The words a text's polarity is counted around: the subject names it holds, else the fallback term, else none. */
export function anchorsOf(params: {
	text: string
	names: string[]
	fallback: string | undefined
}): string[] {
	const words = new Set(tokensOf({ text: params.text }))
	const holdsName = params.names.some((name) =>
		tokensOf({ text: name }).some((word) => words.has(word)),
	)
	if (holdsName) return params.names
	return params.fallback === undefined ? [] : [params.fallback]
}
