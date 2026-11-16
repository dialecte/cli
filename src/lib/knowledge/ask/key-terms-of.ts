import { normaliseText } from '../standard/normalise-text.ts'
import {
	ACRONYM_PATTERN,
	ASSIGNMENT_MARK,
	ATTRIBUTE_MARK,
	KEY_TERM_NUMBER_PATTERN,
	KEY_TERM_WORDS_PATTERN,
	NAME_SCAN_FLAGS,
	ORDINARY_WORD_PATTERN,
	QUOTED_PASSAGE_PATTERN,
	SHORT_WORD_LENGTH,
	WHITESPACE_PATTERN,
} from './ask.constants.ts'
import { boundedNamePatternOf } from './bounded-name-pattern-of.ts'

import type { FoundTerm, KeyTermsOfParams, KeyVocabulary } from './ask.types.ts'

/**
 * The key terms of a text, in order of appearance without repeats: vocabulary names (word-bounded, case kept),
 * numbers and cardinalities, normative verbs and quoted words. A name that is an ordinary word is a term only as
 * `@name`, `name=` or inside quotes, unless it is a tag or attribute of the ask's subject.
 */
export function keyTermsOf(params: KeyTermsOfParams): string[] {
	const text = normaliseText(params.text)
	const found = [
		...namedTermsOf({ text, params }),
		...scannedTermsOf({ text, pattern: KEY_TERM_WORDS_PATTERN, lowerCase: true }),
		...scannedTermsOf({ text, pattern: KEY_TERM_NUMBER_PATTERN, lowerCase: false }),
		...quotedTermsOf({ text }),
	]
	found.sort((first, second) => first.index - second.index)
	return [...new Set(found.map((entry) => entry.term))]
}

/** True when the name is an ordinary word: lowercase letters only (3 or more), or short and not an acronym. */
function isOrdinaryName(name: string): boolean {
	return (
		ORDINARY_WORD_PATTERN.test(name) ||
		(name.length < SHORT_WORD_LENGTH && !ACRONYM_PATTERN.test(name))
	)
}

/** The vocabulary and subject names the text holds, each in the way its kind is a key term. */
function namedTermsOf(params: { text: string; params: KeyTermsOfParams }): FoundTerm[] {
	const { text, params: read } = params
	const subjectNames = new Set([...read.subject.tags, ...read.subject.attributes])
	const found: FoundTerm[] = []
	for (const name of vocabularyNamesOf({ vocabulary: read.vocabulary, subjectNames })) {
		const bounded = boundedNamePatternOf({ name, flags: NAME_SCAN_FLAGS })
		const patterns =
			subjectNames.has(name) || !isOrdinaryName(name)
				? [bounded]
				: [
						new RegExp(`${ATTRIBUTE_MARK}${bounded.source}`, NAME_SCAN_FLAGS),
						new RegExp(`${bounded.source}${ASSIGNMENT_MARK}`, NAME_SCAN_FLAGS),
					]
		for (const pattern of patterns)
			for (const match of text.matchAll(pattern)) found.push({ index: match.index, term: name })
	}
	return found
}

/** Every name the terms can be made of, once. */
function vocabularyNamesOf(params: {
	vocabulary: KeyVocabulary
	subjectNames: Set<string>
}): string[] {
	const { vocabulary, subjectNames } = params
	return [
		...new Set([
			...vocabulary.tags,
			...vocabulary.attributes,
			...vocabulary.values,
			...subjectNames,
		]),
	]
}

/** The terms a pattern finds, as written or lower-cased. */
function scannedTermsOf(params: {
	text: string
	pattern: RegExp
	lowerCase: boolean
}): FoundTerm[] {
	return [...params.text.matchAll(params.pattern)].map((match) => ({
		index: match.index,
		term: params.lowerCase ? match[0].toLowerCase() : match[0],
	}))
}

/** The words of each double-quoted passage. */
function quotedTermsOf(params: { text: string }): FoundTerm[] {
	const found: FoundTerm[] = []
	for (const match of params.text.matchAll(QUOTED_PASSAGE_PATTERN))
		for (const word of match[1].split(WHITESPACE_PATTERN))
			if (word !== '') found.push({ index: match.index, term: word })
	return found
}
