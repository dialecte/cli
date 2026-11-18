/**
 * `duplicate-read`: a function the change adds that reads what an existing function already reads (the same element
 * and three or more attributes, a named set counting three), or that `api find` says already exists; never against a
 * function it calls (one level through the package functions it calls), nor against another added function.
 */
import { findMethods, wordsOf } from '../api/find-methods.ts'
import {
	DUPLICATE_FIND_LIMIT,
	DUPLICATE_FIND_MIN_WORDS,
	DUPLICATE_FIND_STOP_WORDS,
	DUPLICATE_READ_MIN_ATTRIBUTES,
	EXISTING_SOURCE_PACKAGE,
	NAMED_SET_KEY,
} from './quality.constants.ts'

import type { ApiJson, ApiMethod } from '../api/api-json.types.ts'
import type { ReadKeys } from '../api/source-functions.types.ts'
import type {
	DuplicateRead,
	FunctionSides,
	ResolveSpecifier,
	SidedFunction,
} from './quality.types.ts'

/**
 * The duplicate reads of `sides`: at most one per added function and existing function, the `reads` signal first;
 * `indexes` are the package's own API indexes (none for a tool), searched with the existing functions.
 *
 * @intent point at an existing function a new one re-reads
 * @internal
 */
export function findDuplicateReads(params: {
	sides: FunctionSides
	indexes: readonly ApiJson[]
	resolve: ResolveSpecifier
}): DuplicateRead[] {
	const { sides, resolve } = params
	const byKey = new Map(sides.existing.map((side) => [keyOf(side), side]))
	// the generic words, stemmed as the names are
	const stop = new Set(DUPLICATE_FIND_STOP_WORDS.flatMap(wordsOf))
	const byNameWord = nameWordIndexOf({ existing: sides.existing, stop })
	return sides.added.flatMap(function duplicatesOfAdded(added) {
		const called = calledOf({ side: added, existing: byKey, resolve })
		const keys = keysThroughCalls({ side: added, called, existing: byKey })
		const reads = sides.existing.flatMap(function readsLike(existing): DuplicateRead[] {
			if (keyOf(existing) === keyOf(added) || called.has(keyOf(existing))) return []
			const shared = sharedReadOf({ added: keys, existing: existing.facts.readKeys })
			return shared === undefined
				? []
				: [{ ...findingOf({ added, existing, signal: 'reads' }), ...shared }]
		})
		const named = new Set(reads.map((read) => `${read.existing.file}#${read.existing.name}`))
		const found = [
			...new Map(
				foundByWords({ added, byNameWord, stop, indexes: params.indexes }).map((side) => [
					keyOf(side),
					side,
				]),
			).values(),
		]
			.filter((existing) => keyOf(existing) !== keyOf(added))
			.filter((existing) => !called.has(keyOf(existing)) && !named.has(keyOf(existing)))
			.map((existing) => findingOf({ added, existing, signal: 'find' }))
		return [...reads, ...found]
	})
}

/** `file#name`: one function of the package. */
function keyOf(side: SidedFunction): string {
	return `${side.file}#${side.facts.name}`
}

/** The finding of `added` against `existing` by `signal`, without its shared keys. */
function findingOf(params: {
	added: SidedFunction
	existing: SidedFunction
	signal: DuplicateRead['signal']
}): DuplicateRead {
	const { added, existing } = params
	return {
		file: added.file,
		line: added.facts.line,
		name: added.facts.name,
		signal: params.signal,
		existing: { file: existing.file, line: existing.facts.line, name: existing.facts.name },
	}
}

/**
 * The existing functions `side` calls, directly or one level down through the package functions it calls: their keys.
 */
function calledOf(params: {
	side: SidedFunction
	existing: ReadonlyMap<string, SidedFunction>
	resolve: ResolveSpecifier
}): Set<string> {
	const direct = calleesOf(params)
	const below = direct.flatMap((key) => {
		const callee = params.existing.get(key)
		return callee === undefined ? [] : calleesOf({ ...params, side: callee })
	})
	return new Set([...direct, ...below])
}

/** The keys of the functions `side` calls by name: in its own file, or in the file its import resolves to. */
function calleesOf(params: { side: SidedFunction; resolve: ResolveSpecifier }): string[] {
	const { side } = params
	return side.facts.calls.flatMap(function keyOfCall(call) {
		if (call.specifier === undefined) return [`${side.file}#${call.name}`]
		const file = params.resolve({ from: side.file, specifier: call.specifier })
		return file === undefined ? [] : [`${file}#${call.name}`]
	})
}

/** The read keys of `side` with those of the existing package functions it calls (one level), merged, each once. */
function keysThroughCalls(params: {
	side: SidedFunction
	called: ReadonlySet<string>
	existing: ReadonlyMap<string, SidedFunction>
}): ReadKeys {
	const all = [
		params.side.facts.readKeys,
		...[...params.called].flatMap((key) => {
			const callee = params.existing.get(key)
			return callee === undefined ? [] : [callee.facts.readKeys]
		}),
	]
	return {
		elements: [...new Set(all.flatMap((keys) => keys.elements))].sort(),
		attributes: [...new Set(all.flatMap((keys) => keys.attributes))].sort(),
		namedSets: [...new Set(all.flatMap((keys) => keys.namedSets))].sort(),
	}
}

/**
 * The element and attributes two functions both read, when it is enough to read alike (one element and at least
 * `DUPLICATE_READ_MIN_ATTRIBUTES` attributes, a shared named set counting that many); undefined otherwise.
 */
function sharedReadOf(params: {
	added: ReadKeys
	existing: ReadKeys
}): { element: string; attributes: string[] } | undefined {
	const element = params.added.elements.find((candidate) =>
		params.existing.elements.includes(candidate),
	)
	if (element === undefined) return undefined
	const attributes = params.added.attributes.filter((name) =>
		params.existing.attributes.includes(name),
	)
	const sets = params.added.namedSets.filter((name) => params.existing.namedSets.includes(name))
	const weight = attributes.length + sets.length * DUPLICATE_READ_MIN_ATTRIBUTES
	if (weight < DUPLICATE_READ_MIN_ATTRIBUTES) return undefined
	return {
		element,
		attributes: [...attributes, ...sets.map((name) => NAMED_SET_KEY.replace('{name}', () => name))],
	}
}

/**
 * The existing functions `api find` names for `added`'s name and summary, keeping those whose own name holds at least
 * `DUPLICATE_FIND_MIN_WORDS` distinct words of `added`'s name (Q27, measured: summaries share common words too often
 * to tell a need apart).
 */
function foundByWords(params: {
	added: SidedFunction
	byNameWord: ReadonlyMap<string, readonly SidedFunction[]>
	stop: ReadonlySet<string>
	indexes: readonly ApiJson[]
}): SidedFunction[] {
	const { added } = params
	const need = `${added.facts.name} ${added.facts.summary ?? ''}`
	const nameWords = new Set(nameWordsOf({ name: added.facts.name, stop: params.stop }))
	// only the existing functions sharing a word of the name can share two: `api find` ranks those alone
	const candidates = [
		...new Map(
			[...nameWords].flatMap((word) =>
				(params.byNameWord.get(word) ?? []).map((side) => [keyOf(side), side]),
			),
		).values(),
	]
	const byPath = new Map(candidates.map((side) => [keyOf(side), side]))
	const byPlace = new Map(candidates.map((side) => [`${side.file}:${side.facts.line}`, side]))
	const existingIndex: ApiJson = {
		package: EXISTING_SOURCE_PACKAGE,
		methods: candidates.map(methodOf),
	}
	const indexes = [...params.indexes, existingIndex]
	return findMethods({ indexes, need, limit: DUPLICATE_FIND_LIMIT }).flatMap(
		function sideOfFound(found) {
			// an indexed method maps to its function by where it is declared; an existing one by its key
			const side =
				byPath.get(found.method.path) ??
				(found.method.declaredAt === undefined ? undefined : byPlace.get(found.method.declaredAt))
			if (side === undefined) return []
			const shared = wordsOf(side.facts.name).filter((word) => nameWords.has(word))
			return new Set(shared).size >= DUPLICATE_FIND_MIN_WORDS ? [side] : []
		},
	)
}

/** The existing functions by each word of their name (the generic words left out), built once per run. */
function nameWordIndexOf(params: {
	existing: readonly SidedFunction[]
	stop: ReadonlySet<string>
}): Map<string, SidedFunction[]> {
	const index = new Map<string, SidedFunction[]>()
	for (const side of params.existing)
		for (const word of new Set(nameWordsOf({ name: side.facts.name, stop: params.stop })))
			index.set(word, [...(index.get(word) ?? []), side])
	return index
}

/** The words of a function's name that tell what it does: `DUPLICATE_FIND_STOP_WORDS` left out. */
function nameWordsOf(params: { name: string; stop: ReadonlySet<string> }): string[] {
	return wordsOf(params.name).filter((word) => !params.stop.has(word))
}

/** An existing function as a method `api find` ranks: its path is its key. */
function methodOf(side: SidedFunction): ApiMethod {
	return {
		path: keyOf(side),
		root: 'source',
		otherRoutes: [],
		signature: '',
		summary: side.facts.summary,
		intents: [],
		declaredAt: `${side.file}:${side.facts.line}`,
		example: undefined,
	}
}
