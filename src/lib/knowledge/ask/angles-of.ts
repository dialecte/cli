import { wordsOf } from '../../api/find-methods.ts'
import { attributesAdmitting } from '../../schema/attributes-admitting.ts'
import { describeElement } from '../../schema/describe-element.ts'
import { fillMessage } from '../standard/fill-message.ts'
import { LINK_STRENGTHS } from '../standard/standard-search.constants.ts'
import {
	ANGLE_FAMILIES,
	ANGLE_ID_PREFIX,
	BOUNDED_NAME_FLAGS,
	BOUNDED_NAME_INSENSITIVE_FLAGS,
	BOUNDED_NAME_TEMPLATE,
	DEFINITION_TEXT_SEPARATOR,
	REGEX_SPECIAL_PATTERN,
	REGEX_SPECIAL_REPLACEMENT,
	TYPE_NAMESPACE_PATTERN,
} from './ask.constants.ts'

import type { ElementDescription } from '../../schema/schema.types.ts'
import type { StandardSearchIndex, StandardUnit } from '../standard/standard-search.types.ts'
import type { AngleFamily, AnglesOfParams, AskAngle, FamilyTerms } from './ask.types.ts'

/**
 * The angles of search of a question: one per family in the order of the families, each with its terms; a term
 * keeps its first family and an empty family gives no angle.
 */
export function anglesOf(params: AnglesOfParams): AskAngle[] {
	const used = new Set<string>()
	const angles: AskAngle[] = []
	for (const { family, terms } of familyTermsOf(params)) {
		const fresh = [...new Set(terms)].filter((term) => !used.has(term))
		if (fresh.length === 0) continue
		for (const term of fresh) used.add(term)
		angles.push({ id: `${ANGLE_ID_PREFIX}${angles.length + 1}`, family, terms: fresh })
	}
	return angles
}

/** Every family's terms in the family order; a family read from a description gives one entry per subject tag. */
function familyTermsOf(params: AnglesOfParams): FamilyTerms[] {
	const descriptions = descriptionsOf(params)
	return ANGLE_FAMILIES.flatMap(function termsOfFamily(family: AngleFamily): FamilyTerms[] {
		const described = describedTermsOf({ family, descriptions })
		if (described !== undefined)
			return [
				...described.map((terms) => ({ family, terms })),
				...(family === 'values' ? [{ family, terms: admittingAttributesOf(params) }] : []),
			]
		return [{ family, terms: ownTermsOf({ family, params }) }]
	})
}

/** The description of each subject tag in its context: the one declaration its parent decides, else the tag level. */
function descriptionsOf(params: AnglesOfParams): ElementDescription[] {
	const { dialecte, context, subject } = params
	if (dialecte === undefined) return []
	const tags = context.tags.length > 0 ? context.tags : subject.tags
	return tags.flatMap(function describe(entry): ElementDescription[] {
		const element = describeElement({
			dialecte,
			tagName: entry.tag,
			parent: entry.parent ?? undefined,
		})
		return element === undefined ? [] : [element]
	})
}

/** A family read from the descriptions: its terms per description; undefined for every other family. */
function describedTermsOf(params: {
	family: AngleFamily
	descriptions: ElementDescription[]
}): string[][] | undefined {
	const { family, descriptions } = params
	switch (family) {
		case 'type':
			return descriptions.map((element) =>
				element.type === undefined ? [] : [localNameOf({ name: element.type })],
			)
		case 'documentation':
			return descriptions.map((element) => wordsOf(element.documentation ?? ''))
		case 'parents':
			return descriptions.map((element) => [...element.parents])
		case 'children':
			return descriptions.map((element) => element.children.map((child) => child.tag))
		case 'attributes':
			return descriptions.map((element) => element.attributes.map((attribute) => attribute.name))
		case 'variants':
			return descriptions.map((element) => element.xsiTypes.map((name) => localNameOf({ name })))
		case 'values':
			return descriptions.map((element) =>
				element.attributes.flatMap((attribute) => attribute.enumeration),
			)
		default:
			return undefined
	}
}

/** The terms of a family read from the parse, the rungs before, the documents' index or the question. */
function ownTermsOf(params: { family: AngleFamily; params: AnglesOfParams }): string[] {
	const { family } = params
	const { subject, methods, explained, question } = params.params
	switch (family) {
		case 'subject':
			return [
				...subject.tags.map((entry) => entry.tag),
				...subject.attributes,
				...subject.values,
				...subject.codes,
			]
		case 'methods':
			return [...subject.methods, ...methods].flatMap((path) => wordsOf(path))
		case 'code':
			return explained.flatMap((entry) => [
				...wordsOf(entry.message),
				...tagsNamedIn({ text: entry.message, tags: vocabularyTagsOf(params.params) }),
			])
		case 'definitions':
			return definitionTermsOf(params.params)
		case 'clauses':
			return clauseTermsOf(params.params)
		case 'tables':
			return tableTermsOf(params.params)
		case 'question':
			return wordsOf(question)
		default:
			return []
	}
}

/** The attributes whose enumeration holds a value the question names (the reverse lookup of the values family). */
function admittingAttributesOf(params: AnglesOfParams): string[] {
	const { dialecte } = params
	if (dialecte === undefined) return []
	return params.subject.values.flatMap((value) =>
		attributesAdmitting({ dialecte, value }).map((admitting) => admitting.attribute),
	)
}

/** A type name's local part: its Clark namespace or prefix dropped. */
function localNameOf(params: { name: string }): string {
	return params.name.replace(TYPE_NAMESPACE_PATTERN, '')
}

/** The tags of the dialecte and of the documents' vocabulary. */
function vocabularyTagsOf(params: AnglesOfParams): string[] {
	return [
		...new Set([
			...(params.dialecte?.config.elements ?? []),
			...params.standard.flatMap((index) => index.vocabulary.tags),
		]),
	]
}

/** The tags a text names word-bounded, case kept, in the vocabulary's order. */
function tagsNamedIn(params: { text: string; tags: string[] }): string[] {
	return params.tags.filter((tag) =>
		boundedPatternOf({ name: tag, flags: BOUNDED_NAME_FLAGS }).test(params.text),
	)
}

/** A name met word-bounded, its pattern characters escaped. */
function boundedPatternOf(params: { name: string; flags: string }): RegExp {
	const name = params.name.replace(REGEX_SPECIAL_PATTERN, REGEX_SPECIAL_REPLACEMENT)
	return new RegExp(
		fillMessage({ template: BOUNDED_NAME_TEMPLATE, values: { name } }),
		params.flags,
	)
}

/** The subject words the index families look for: the subject tags and attributes. */
function subjectWordsOf(params: AnglesOfParams): string[] {
	return [...params.subject.tags.map((entry) => entry.tag), ...params.subject.attributes]
}

/** Each defined term whose term or definition text names a subject word, case-insensitive (D11b). */
function definitionTermsOf(params: AnglesOfParams): string[] {
	const patterns = subjectWordsOf(params).map((name) =>
		boundedPatternOf({ name, flags: BOUNDED_NAME_INSENSITIVE_FLAGS }),
	)
	if (patterns.length === 0) return []
	return params.standard.flatMap((index) =>
		index.files.flatMap((file) =>
			file.definitions.flatMap(function termIfNamed(definition): string[] {
				const text = file.logicalLines
					.filter((line) => line.from >= definition.from && line.to <= definition.to)
					.map((line) => line.text)
					.join(DEFINITION_TEXT_SEPARATOR)
				const named = patterns.some(
					(pattern) => pattern.test(definition.term) || pattern.test(text),
				)
				return named ? [definition.term] : []
			}),
		),
	)
}

/**
 * The content words of the titles of the clauses whose heading names a subject tag, then of the clauses their
 * resolved cross-references target (one hop) (D11b).
 */
function clauseTermsOf(params: AnglesOfParams): string[] {
	return params.standard.flatMap(function clauseTermsOfIndex(index): string[] {
		const headed = linkedUnitsOf({ index, tags: subjectTagsOf(params), kind: 'clause' })
		const targets = headed.flatMap((unit) => targetUnitsOf({ index, unit }))
		return [...headed, ...targets].flatMap((unit) => wordsOf(unit.title ?? ''))
	})
}

/** The content words of the captions of the tables whose caption names a subject tag (D11b). */
function tableTermsOf(params: AnglesOfParams): string[] {
	return params.standard.flatMap((index) =>
		linkedUnitsOf({ index, tags: subjectTagsOf(params), kind: 'table' }).flatMap((unit) =>
			wordsOf(unit.title ?? ''),
		),
	)
}

/** The subject tags. */
function subjectTagsOf(params: AnglesOfParams): string[] {
	return params.subject.tags.map((entry) => entry.tag)
}

/** The units of a kind whose heading or caption names one of the tags (a link of the heading strength). */
function linkedUnitsOf(params: {
	index: StandardSearchIndex
	tags: string[]
	kind: StandardUnit['kind']
}): StandardUnit[] {
	const { index, kind } = params
	const strength = kind === 'table' ? LINK_STRENGTHS.caption : LINK_STRENGTHS.heading
	const found = new Set<number>()
	for (const tag of params.tags)
		for (const link of index.tagLinks[tag] ?? [])
			if (link.strength === strength && index.units[link.unit]?.kind === kind) found.add(link.unit)
	return [...found].map((unit) => index.units[unit])
}

/** The units a unit's resolved cross-references target, in the order they are cited. */
function targetUnitsOf(params: { index: StandardSearchIndex; unit: StandardUnit }): StandardUnit[] {
	const { index, unit } = params
	const file = index.files.find((candidate) => candidate.fileId === unit.fileId)
	return (file?.crossReferences ?? []).flatMap(function targetOf(reference): StandardUnit[] {
		if (!reference.resolved || reference.from < unit.from || reference.from > unit.to) return []
		const target = index.units.find(
			(candidate) => candidate.fileId === unit.fileId && candidate.target === reference.target,
		)
		return target === undefined ? [] : [target]
	})
}
