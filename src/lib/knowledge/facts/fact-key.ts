import { createHash } from 'node:crypto'

import { stableJson } from '../../stable-json.ts'
import { normaliseText } from '../standard/normalise-text.ts'
import { QUESTION_WHITESPACE_PATTERN } from './facts.constants.ts'

import type { FactKeyParts, FactSubject, FactSubjectTag } from './facts.types.ts'

/**
 * The key of a fact: the sha256 hex (64 lowercase characters) of the stable JSON of the question's normal form,
 * the canonical subject, the kind and the package.
 */
export function factKeyOf(params: FactKeyParts): string {
	const parts = {
		question: questionNormalForm({ question: params.question }),
		subject: canonicalSubject({ subject: params.subject }),
		kind: params.kind,
		package: params.package,
	}
	return createHash('sha256').update(stableJson(parts)).digest('hex')
}

/** A question as its key reads it: folded as a quote is, NFKC, lowercase, whitespace runs to one space, trimmed. */
function questionNormalForm(params: { question: string }): string {
	return normaliseText(params.question)
		.normalize('NFKC')
		.toLowerCase()
		.replace(QUESTION_WHITESPACE_PATTERN, ' ')
		.trim()
}

/** The subject's lists sorted, duplicates dropped: tags by tag then parent (none first), the others by code unit. */
function canonicalSubject(params: { subject: FactSubject }): Omit<FactSubject, 'package'> {
	return {
		tags: canonicalTags({ tags: params.subject.tags }),
		attributes: sortedUnique({ items: params.subject.attributes }),
		codes: sortedUnique({ items: params.subject.codes }),
		methods: sortedUnique({ items: params.subject.methods }),
	}
}

/** Tags sorted by tag then parent, a tag under the same parent kept once. */
function canonicalTags(params: { tags: readonly FactSubjectTag[] }): FactSubjectTag[] {
	const byIdentity = new Map<string, FactSubjectTag>()
	for (const tag of params.tags)
		byIdentity.set(stableJson([tag.tag, tag.parent]), { tag: tag.tag, parent: tag.parent })
	return [...byIdentity.values()].sort(byTagThenParent)
}

function byTagThenParent(first: FactSubjectTag, second: FactSubjectTag): number {
	return (
		compareCodeUnits({ first: first.tag, second: second.tag }) ||
		compareCodeUnits({ first: first.parent ?? '', second: second.parent ?? '' }) ||
		Number(first.parent !== null) - Number(second.parent !== null)
	)
}

/** The distinct items, sorted by code unit. */
function sortedUnique(params: { items: readonly string[] }): string[] {
	return [...new Set(params.items)].sort((first, second) => compareCodeUnits({ first, second }))
}

function compareCodeUnits(params: { first: string; second: string }): number {
	return params.first < params.second ? -1 : params.first > params.second ? 1 : 0
}
