import { definitionHash } from '../../schema/definition-hash.ts'
import { describeElement } from '../../schema/describe-element.ts'
import { SCHEMA_SOURCE_KIND } from '../facts/facts.constants.ts'
import { fillMessage } from '../standard/fill-message.ts'
import {
	ASK_REFUSALS,
	ELEMENT_UNDER_TEMPLATE,
	NAME_SEPARATOR,
	NONE_SUFFIX,
	RUNG_ONE_SENTENCES,
	STRUCTURAL_KINDS,
	VERDICT_NO,
	VERDICT_VALUE,
	VERDICT_YES,
} from './ask.constants.ts'

import type { AttributeDescription, ElementDescription } from '../../schema/schema.types.ts'
import type { FactAnswer } from '../facts/facts.types.ts'
import type {
	AnswerFromDefinitionParams,
	AskKind,
	DefinitionQuestion,
	ResolvedElement,
	RungAnswer,
	RungOneSentence,
} from './ask.types.ts'

/**
 * Rung 1: the answer read from the one declaration the context resolved; undefined when the rung does not answer.
 */
export function answerFromDefinition(
	params: AnswerFromDefinitionParams,
): RungAnswer | { refused: string } | undefined {
	const { dialecte, version } = params
	const answer = definitionAnswerOf(params)
	if (answer === undefined || 'refused' in answer) return answer
	return {
		answer,
		sources: [
			{
				kind: SCHEMA_SOURCE_KIND,
				package: dialecte.packageName,
				version,
				definitionHash: definitionHash({ config: dialecte.config }),
			},
		],
	}
}

/**
 * The refusal rung 1 would make for the question: an attribute its resolved element lacks (what failed, the
 * element's attributes); undefined when rung 1 answers or does not run. Read before rung 0, so a question rung 1
 * refuses is never answered by a fact nor kept as an ask.
 */
export function attributeRefusalOf(params: DefinitionQuestion): string | undefined {
	const answer = definitionAnswerOf(params)
	return answer !== undefined && 'refused' in answer ? answer.refused : undefined
}

/**
 * The answer the one declaration the context resolved gives for the kind, or the refusal of an attribute the
 * element lacks; undefined when the rung does not answer.
 */
function definitionAnswerOf(
	params: DefinitionQuestion,
): FactAnswer | { refused: string } | undefined {
	const { kind, slots } = params
	const resolved = resolvedElementOf(params)
	if (resolved === undefined) return undefined
	const { element, tag, parent } = resolved

	const subject =
		parent === undefined || parent === null
			? tag
			: fillMessage({ template: ELEMENT_UNDER_TEMPLATE, values: { tag, parent } })
	return answerOf({ element, kind, subject, attributeName: slots.attribute })
}

/**
 * The description of the one declaration the context resolved for the question's tag, with the tag and the parent
 * that decided it; undefined for a kind the definition does not answer, an unresolved context, or a tag it does not
 * resolve.
 */
export function resolvedElementOf(params: DefinitionQuestion): ResolvedElement | undefined {
	const { dialecte, kind, slots, context } = params
	const tag = slots.tag
	if (!STRUCTURAL_KINDS.includes(kind) || !context.resolved || tag === undefined) return undefined
	const contextTag = context.tags.find((entry) => entry.tag === tag)
	if (contextTag?.resolved === false) return undefined
	const parent = contextTag?.parent ?? slots.parent
	const element = describeElement({ dialecte, tagName: tag, parent })
	if (element === undefined || !element.resolved) return undefined
	return { element, tag, parent }
}

/** What the description says for the kind, or the refusal of an attribute the element lacks. */
function answerOf(params: {
	element: ElementDescription
	kind: AskKind
	subject: string
	attributeName: string | undefined
}): FactAnswer | { refused: string } | undefined {
	const { element, kind, subject, attributeName } = params
	if (kind === 'children') return childrenAnswer({ element, subject })
	if (kind === 'parents')
		return listAnswer({ names: element.parents, sentence: 'parents', subject })
	if (kind === 'variants')
		return listAnswer({ names: element.xsiTypes, sentence: 'variants', subject })
	if (kind === 'documentation')
		return valueAnswer({ value: element.documentation, sentence: 'documentation', subject })
	if (kind === 'type' && attributeName === undefined)
		return valueAnswer({ value: element.type, sentence: 'typeOfElement', subject })
	if (kind === 'required' && attributeName === undefined)
		return listAnswer({
			names: element.attributes.filter(({ required }) => required).map(({ name }) => name),
			sentence: 'requiredList',
			subject,
		})
	if (attributeName === undefined) return undefined

	const attribute = element.attributes.find(({ name }) => name === attributeName)
	if (attribute === undefined)
		return {
			refused: fillMessage({
				template: ASK_REFUSALS.attributeNotOnElement,
				values: {
					subject,
					tag: element.tag,
					attribute: attributeName,
					attributes: element.attributes.map(({ name }) => name).join(NAME_SEPARATOR),
				},
			}),
		}
	return attributeAnswer({ attribute, kind, subject })
}

/** What an attribute's rules say for the kind. */
function attributeAnswer(params: {
	attribute: AttributeDescription
	kind: AskKind
	subject: string
}): FactAnswer | undefined {
	const { attribute, kind, subject } = params
	const extra = { attribute: attribute.name }
	if (kind === 'required')
		return {
			verdict: attribute.required ? VERDICT_YES : VERDICT_NO,
			value: attribute.name,
			text: fillMessage({
				template: attribute.required
					? RUNG_ONE_SENTENCES.requiredYes
					: RUNG_ONE_SENTENCES.requiredNo,
				values: { subject, ...extra },
			}),
		}
	if (kind === 'values')
		return listAnswer({ names: attribute.enumeration, sentence: 'values', subject, extra })
	if (kind === 'default')
		return valueAnswer({ value: attribute.default, sentence: 'default', subject, extra })
	if (kind === 'fixed')
		return valueAnswer({ value: attribute.fixed, sentence: 'fixed', subject, extra })
	if (kind === 'type')
		return valueAnswer({ value: attribute.type, sentence: 'typeOfAttribute', subject, extra })
	return undefined
}

/** The children in the description's order; the sentence says when a wildcard admits other namespaces too. */
function childrenAnswer(params: { element: ElementDescription; subject: string }): FactAnswer {
	const { element, subject } = params
	const value = element.children.map(({ tag }) => tag).join(NAME_SEPARATOR)
	const sentence: RungOneSentence =
		value === ''
			? element.anyChild
				? 'childrenOnlyAny'
				: 'childrenNone'
			: element.anyChild
				? 'childrenWithAny'
				: 'children'
	return {
		verdict: VERDICT_VALUE,
		value,
		text: fillMessage({ template: RUNG_ONE_SENTENCES[sentence], values: { subject, value } }),
	}
}

/** A list kind: the names joined (`''` when none), the sentence or its `None` form. */
function listAnswer(params: {
	names: readonly string[]
	sentence: RungOneSentence
	subject: string
	extra?: Record<string, string>
}): FactAnswer {
	const value = params.names.join(NAME_SEPARATOR)
	return {
		verdict: VERDICT_VALUE,
		value,
		text: sentenceOf({ ...params, value, none: value === '' }),
	}
}

/** A single-value kind: the string, `null` when there is none. */
function valueAnswer(params: {
	value: string | undefined
	sentence: RungOneSentence
	subject: string
	extra?: Record<string, string>
}): FactAnswer {
	const value = params.value ?? null
	return {
		verdict: VERDICT_VALUE,
		value,
		text: sentenceOf({ ...params, value: value ?? '', none: value === null }),
	}
}

/** The kind's sentence, or its `None` form, filled. */
function sentenceOf(params: {
	sentence: RungOneSentence
	subject: string
	value: string
	none: boolean
	extra?: Record<string, string>
}): string {
	const name = params.none
		? (`${params.sentence}${NONE_SUFFIX}` as RungOneSentence)
		: params.sentence
	return fillMessage({
		template: RUNG_ONE_SENTENCES[name],
		values: { subject: params.subject, value: params.value, ...params.extra },
	})
}
