/** The checks of the config keys: each returns what is wrong with a value, undefined when it holds. */

/** True for a mapping (an object that is neither null nor a list). */
export function isMapping(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** A text. */
export function stringProblem(value: unknown): string | undefined {
	return typeof value === 'string' ? undefined : 'must be a text'
}

/** A list of texts. */
export function stringListProblem(value: unknown): string | undefined {
	return Array.isArray(value) && value.every((item) => typeof item === 'string')
		? undefined
		: 'must be a list of texts'
}

/** A mapping (its deeper shape checked by the reader of the key). */
export function mappingProblem(value: unknown): string | undefined {
	return isMapping(value) ? undefined : 'must be a mapping'
}

/** The first field of a mapping outside `allowed`, if any. */
function unknownFieldProblem(params: {
	value: Record<string, unknown>
	allowed: readonly string[]
}): string | undefined {
	const unknown = Object.keys(params.value).find((field) => !params.allowed.includes(field))
	return unknown === undefined
		? undefined
		: `has an unknown field '${unknown}' (allowed: ${params.allowed.join(', ')})`
}

/** `{ allow?: string[], patterns?: string[] }`. */
export function referencesProblem(value: unknown): string | undefined {
	if (!isMapping(value)) return 'must be a mapping of allow and patterns'
	const unknown = unknownFieldProblem({ value, allowed: ['allow', 'patterns'] })
	if (unknown !== undefined) return unknown
	for (const field of ['allow', 'patterns']) {
		if (value[field] === undefined) continue
		const problem = stringListProblem(value[field])
		if (problem !== undefined) return `${field} ${problem}`
	}
	return undefined
}

/** `{ budget?: integer >= 1 }`. */
export function loadProblem(value: unknown): string | undefined {
	if (!isMapping(value)) return 'must be a mapping of budget'
	const unknown = unknownFieldProblem({ value, allowed: ['budget'] })
	if (unknown !== undefined) return unknown
	const budget = value.budget
	if (budget === undefined) return undefined
	return typeof budget === 'number' && Number.isInteger(budget) && budget >= 1
		? undefined
		: 'budget must be a whole number of 1 or more'
}

/** One corpus: `{ xsd: string, instances?: string }`. */
function corpusProblem(value: unknown): string | undefined {
	if (!isMapping(value)) return 'must be a mapping of xsd and instances'
	const unknown = unknownFieldProblem({ value, allowed: ['xsd', 'instances'] })
	if (unknown !== undefined) return unknown
	if (typeof value.xsd !== 'string') return 'needs xsd, the path of its XSD'
	if (value.instances !== undefined && typeof value.instances !== 'string')
		return 'instances must be a text (a folder)'
	return undefined
}

/** A mapping of corpus names to corpora. */
export function corporaProblem(value: unknown): string | undefined {
	if (!isMapping(value)) return 'must be a mapping of corpus names'
	for (const [name, corpus] of Object.entries(value)) {
		const problem = corpusProblem(corpus)
		if (problem !== undefined) return `corpus '${name}' ${problem}`
	}
	return undefined
}
