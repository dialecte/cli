import {
	ABOUT_PATTERN,
	ACRONYM_PATTERN,
	ORDINARY_WORD_PATTERN,
	QUOTED_VALUE_PATTERN,
	QUOTED_VALUE_REPLACEMENT,
	SHORT_WORD_LENGTH,
	TOKEN_EDGE_PATTERN,
	TOKEN_PATTERN,
	VALUE_WINDOW,
} from './ask.constants.ts'

import type { FactSubjectTag } from '../facts/facts.types.ts'
import type { AskSubject, AskVocabulary, ParseSubjectParams } from './ask.types.ts'

/**
 * The subjects a question names: tags, attributes, enumeration values, codes and methods found against the vocabulary, replaced by `about`, `code` and `method` when given.
 */
export function parseSubject(params: ParseSubjectParams): AskSubject {
	const found = subjectsOfText({ question: params.question, vocabulary: params.vocabulary })
	const about = aboutOf({ about: params.about })
	return {
		tags: about.tag === undefined ? found.tags : [about.tag],
		attributes: about.attribute === undefined ? found.attributes : [about.attribute],
		values: found.values,
		codes: params.code === undefined ? found.codes : [params.code],
		methods: params.method === undefined ? found.methods : [params.method],
	}
}

/** What the text names, each name once in the order of the question. */
function subjectsOfText(params: { question: string; vocabulary: AskVocabulary }): AskSubject {
	const { vocabulary } = params
	const tags = new Set<string>()
	const attributes = new Set<string>()
	const values = new Set<string>()
	const codes = new Set<string>()
	const methods = new Set<string>()
	let lastAttributeIndex: number | undefined

	const tokens = tokensOf({ question: params.question })
	tokens.forEach(function readToken(token: string, index: number): void {
		const atIndex = token.indexOf('@')
		if (atIndex !== -1) {
			const tag = token.slice(0, atIndex)
			const attribute = trimEquals({ name: token.slice(atIndex + 1) })
			if (vocabulary.tags.includes(tag)) tags.add(tag)
			if (vocabulary.attributes.includes(attribute)) {
				attributes.add(attribute)
				lastAttributeIndex = index
			}
			return
		}
		const equalsIndex = token.indexOf('=')
		if (equalsIndex !== -1) {
			const attribute = token.slice(0, equalsIndex)
			if (!vocabulary.attributes.includes(attribute)) return
			attributes.add(attribute)
			lastAttributeIndex = index
			const value = token.slice(equalsIndex + 1)
			if (vocabulary.values.includes(value)) values.add(value)
			return
		}
		const named = !isOrdinaryWord({ word: token })
		const inWindow = lastAttributeIndex !== undefined && index - lastAttributeIndex <= VALUE_WINDOW
		if (named && vocabulary.tags.includes(token)) tags.add(token)
		else if (named && vocabulary.attributes.includes(token)) {
			attributes.add(token)
			lastAttributeIndex = index
		} else if (named && vocabulary.codes.includes(token)) codes.add(token)
		else if (named && vocabulary.methods.includes(token)) methods.add(token)
		else if (inWindow && vocabulary.values.includes(token)) values.add(token)
	})

	return {
		tags: [...tags].map((tag): FactSubjectTag => ({ tag, parent: null })),
		attributes: [...attributes],
		values: [...values],
		codes: [...codes],
		methods: [...methods],
	}
}

/** The question's words: quotes around a value after `=` dropped, split on every other punctuation. */
function tokensOf(params: { question: string }): string[] {
	const unquoted = params.question.replace(QUOTED_VALUE_PATTERN, QUOTED_VALUE_REPLACEMENT)
	return (unquoted.match(TOKEN_PATTERN) ?? [])
		.map((token) => token.replace(TOKEN_EDGE_PATTERN, ''))
		.filter((token) => token.length > 0)
}

/** An attribute name written `name=` after `@`, without its `=` and what follows. */
function trimEquals(params: { name: string }): string {
	const equalsIndex = params.name.indexOf('=')
	return equalsIndex === -1 ? params.name : params.name.slice(0, equalsIndex)
}

/** Lowercase letters only and 3+ characters, or under 3 characters and not an acronym. */
function isOrdinaryWord(params: { word: string }): boolean {
	const { word } = params
	if (ORDINARY_WORD_PATTERN.test(word)) return true
	return word.length < SHORT_WORD_LENGTH && !ACRONYM_PATTERN.test(word)
}

/** The tag (with its parent) and the attribute an `--about` value names. */
export function aboutOf(params: { about: string | undefined }): {
	tag: FactSubjectTag | undefined
	attribute: string | undefined
} {
	if (params.about === undefined) return { tag: undefined, attribute: undefined }
	const groups = ABOUT_PATTERN.exec(params.about)?.groups
	if (groups === undefined)
		return { tag: { tag: params.about, parent: null }, attribute: undefined }
	return {
		tag: groups.tag === undefined ? undefined : { tag: groups.tag, parent: groups.parent ?? null },
		attribute: groups.attribute,
	}
}
