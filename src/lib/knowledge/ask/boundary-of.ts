import { answerFromDefinition, resolvedElementOf } from './answer-from-definition.ts'
import {
	BOUNDARY_LIST_KINDS,
	BOUNDARY_VALUE_KINDS,
	LIST_ITEM_PATTERN,
	NAME_SEPARATOR,
	NO_VALUE_ITEM,
	STANDARD_VS_XSD,
	VERDICT_NO,
	VERDICT_YES,
} from './ask.constants.ts'

import type { FactAnswer } from '../facts/facts.types.ts'
import type {
	AskBoundary,
	BoundaryOfParams,
	BoundedAnswer,
	BoundedAnswerOfParams,
	ReadQuestion,
} from './ask.types.ts'

/**
 * The boundary of a `--decision` ask (D29): the definition's answer read live from the one declaration the context
 * resolved, with the source it rests on. A read, never an answer (Q5): null without `--decision`, without a dialecte,
 * or when the definition does not answer the kind.
 */
export function boundaryOf(params: BoundaryOfParams): AskBoundary | null {
	const { request, read, setup } = params
	const { dialecte } = read
	if (!request.decision || dialecte === undefined) return null
	const answered = answerFromDefinition({
		dialecte,
		version: setup.versions[dialecte.packageName] ?? '',
		kind: read.kind,
		slots: read.slots,
		context: read.context,
	})
	if (answered === undefined || 'refused' in answered) return null
	const [source] = answered.sources
	return source === undefined ? null : { answer: answered.answer, source }
}

/**
 * A prose fact's answer held against the boundary (D29): inside it, the fact's answer and no conflict; outside it, the
 * definition wins: a list restricted to the boundary's items, a yes/no or a single value replaced by the boundary's
 * own answer, and the conflict naming the fact and what it named outside. The children of an element admitting any
 * child (a wildcard of other namespaces) admit every name that is no tag of the dialecte (D31); the values of an
 * attribute with no enumeration admit any value of its type (D32).
 */
export function boundedAnswerOf(params: BoundedAnswerOfParams): BoundedAnswer {
	const { fact, read, boundary } = params
	const { kind } = read
	const prose = fact.answer
	const limit = boundary.answer
	if (limit.verdict === VERDICT_YES || limit.verdict === VERDICT_NO)
		return prose.verdict === limit.verdict
			? { answer: prose, conflict: null }
			: conflictOf({ fact: fact.id, answer: limit, outside: [prose.verdict] })
	if (kind === 'values' && !isEnumeratedAttribute({ read }))
		return { answer: prose, conflict: null }
	if (BOUNDARY_LIST_KINDS.includes(kind)) {
		const declared = new Set(itemsOf({ value: limit.value }))
		const dialecteTags = foreignOpenTagsOf({ read })
		function admitted(item: string): boolean {
			return declared.has(item) || (dialecteTags !== null && !dialecteTags.has(item))
		}
		const items = itemsOf({ value: prose.value })
		const outside = items.filter((item) => !admitted(item))
		if (outside.length === 0) return { answer: prose, conflict: null }
		const inside = items.filter(admitted).join(NAME_SEPARATOR)
		return conflictOf({ fact: fact.id, answer: { ...prose, value: inside }, outside })
	}
	if (BOUNDARY_VALUE_KINDS.includes(kind) && prose.value !== limit.value)
		return conflictOf({ fact: fact.id, answer: limit, outside: [prose.value ?? NO_VALUE_ITEM] })
	return { answer: prose, conflict: null }
}

/**
 * The dialecte's tags when the question asks the children of an element admitting any child (D31): the names its
 * children boundary leaves open are every name outside them. Null for any other question.
 */
function foreignOpenTagsOf(params: { read: ReadQuestion }): ReadonlySet<string> | null {
	const { read } = params
	const { dialecte } = read
	if (read.kind !== 'children' || dialecte === undefined) return null
	const resolved = resolvedElementOf({
		dialecte,
		kind: read.kind,
		slots: read.slots,
		context: read.context,
	})
	return resolved?.element.anyChild === true ? new Set(dialecte.config.elements) : null
}

/**
 * Whether the attribute a values question names holds an enumeration on the resolved element (D32): only an
 * enumerated attribute's values are a closed list; one without admits any value of its type.
 */
function isEnumeratedAttribute(params: { read: ReadQuestion }): boolean {
	const { read } = params
	const { dialecte } = read
	const attributeName = read.slots.attribute
	if (dialecte === undefined || attributeName === undefined) return false
	const resolved = resolvedElementOf({
		dialecte,
		kind: read.kind,
		slots: read.slots,
		context: read.context,
	})
	const attribute = resolved?.element.attributes.find(({ name }) => name === attributeName)
	return attribute !== undefined && attribute.enumeration.length > 0
}

/** The answer the definition leaves, and the standard-vs-XSD conflict naming the fact and what it named outside. */
function conflictOf(params: {
	fact: string
	answer: FactAnswer
	outside: string[]
}): BoundedAnswer {
	const { fact, answer, outside } = params
	return { answer, conflict: { kind: STANDARD_VS_XSD, fact, outside } }
}

/** The items of a list answer, in order (none for an empty or missing value). */
function itemsOf(params: { value: string | null }): string[] {
	if (params.value === null) return []
	return params.value
		.trim()
		.split(LIST_ITEM_PATTERN)
		.filter((item) => item !== '')
}
