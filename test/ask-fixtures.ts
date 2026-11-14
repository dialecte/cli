/**
 * Shared by the ask tests: the vocabulary a dialecte offers a parse, a subject and a resolved context built by
 * hand.
 */
import { EXAMPLE_CODE, EXAMPLE_METHOD } from './ask-fixtures.constants.ts'

import type {
	AskContext,
	AskSubject,
	AskVocabulary,
	ContextTag,
} from '../src/lib/knowledge/ask/ask.types.ts'
import type { LoadedDialecte } from '../src/lib/schema/schema.types.ts'

/** The tags, attributes and enumeration values of a dialecte's definition, with a catalogue code and a method. */
export function vocabularyOf(params: { dialecte: LoadedDialecte }): AskVocabulary {
	const { definition, elements } = params.dialecte.config
	const attributes = new Set<string>()
	const values = new Set<string>()
	for (const tag of elements) {
		const entries = [definition[tag], ...Object.values(definition[tag].declarations ?? {})]
		for (const entry of entries) {
			for (const name of entry.attributes.sequence) attributes.add(name)
			for (const detail of Object.values(entry.attributes.details)) {
				const type = detail?.type
				if (type !== undefined && 'facets' in type)
					for (const value of type.facets?.enumeration ?? []) values.add(value)
			}
		}
	}
	return {
		tags: [...elements],
		attributes: [...attributes],
		values: [...values],
		codes: [EXAMPLE_CODE],
		methods: [EXAMPLE_METHOD],
	}
}

/** A subject with only what the case names. */
export function subjectOf(params: {
	tags?: { tag: string; parent?: string | null }[]
	attributes?: string[]
	values?: string[]
	codes?: string[]
	methods?: string[]
}): AskSubject {
	return {
		tags: (params.tags ?? []).map(({ tag, parent }) => ({ tag, parent: parent ?? null })),
		attributes: params.attributes ?? [],
		values: params.values ?? [],
		codes: params.codes ?? [],
		methods: params.methods ?? [],
	}
}

/** The context of one resolved tag. */
export function resolvedContext(params: {
	packageName: string
	tag: string
	parent: string | null
	declarations: number
}): AskContext {
	const contextTag: ContextTag = {
		tag: params.tag,
		parent: params.parent,
		declarations: params.declarations,
		resolved: true,
		packages: [params.packageName],
	}
	return { package: params.packageName, tags: [contextTag], resolved: true, decision: false }
}
