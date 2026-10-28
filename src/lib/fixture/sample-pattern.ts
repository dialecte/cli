/**
 * One string every pattern of an attribute matches, written from the patterns themselves: the forms the
 * generated definitions use (literals, classes, escapes, `.`, groups, alternatives, counts) are read; a
 * construct outside them (a lookaround, a back reference, a word boundary) is named instead of guessed.
 */
import {
	CLASS_ESCAPE_LETTERS,
	CONTROL_ESCAPES,
	PATTERN_CANDIDATE_LIMIT,
	PATTERN_STRETCH_LIMIT,
	PREFERRED_CHARACTERS,
} from './fixture.constants.ts'

import type { PatternCursor, PatternNode, SampleResult, ValuesResult } from './fixture.types.ts'

/**
 * The first string a pattern's alternatives give (in order, each count at least once, never more than its
 * most) that every pattern matches; a class gives the first of the preferred characters it admits.
 */
export function samplePattern(params: { patterns: readonly RegExp[] }): SampleResult {
	const sampled = patternValues({ patterns: params.patterns, limit: 1 })
	if ('problem' in sampled) return sampled
	const [value] = sampled.values
	return value === undefined
		? {
				problem: `no sample matches every pattern (${params.patterns.map((pattern) => pattern.source).join(', ')})`,
			}
		: { value }
}

/**
 * Up to `limit` distinct strings every pattern matches and `accepts` (a type's other facets) takes, written
 * from the patterns in order: the shortest first, then with each repeated part stretched one count longer, up
 * to a few times, for a value a length facet wants longer. Empty when none is found; a construct the reader
 * does not sample is the problem.
 */
export function patternValues(params: {
	patterns: readonly RegExp[]
	limit: number
	accepts?: (value: string) => boolean
}): ValuesResult {
	const { patterns, limit } = params
	const trees: PatternNode[] = []
	for (const pattern of patterns) {
		try {
			trees.push(readPattern({ source: pattern.source }))
		} catch (thrown) {
			if (!(thrown instanceof UnreadConstruct)) throw thrown
			return {
				problem: `pattern ${pattern.source} uses ${thrown.construct}, which the fixture cannot sample`,
			}
		}
	}
	const values: string[] = []
	for (let stretch = 0; stretch <= PATTERN_STRETCH_LIMIT && values.length < limit; stretch++)
		for (const tree of trees) {
			let tried = 0
			for (const candidate of candidatesOf({ node: tree, stretch })) {
				const isValid =
					!values.includes(candidate) &&
					patterns.every((pattern) => pattern.test(candidate)) &&
					(params.accepts?.(candidate) ?? true)
				if (isValid) values.push(candidate)
				if (values.length >= limit || ++tried >= PATTERN_CANDIDATE_LIMIT) break
			}
			if (values.length >= limit) break
		}
	return { values }
}

/** A construct the reader does not sample, by the text that starts it. */
class UnreadConstruct extends Error {
	readonly construct: string
	constructor(construct: string) {
		super(`unread pattern construct ${construct}`)
		this.name = 'UnreadConstruct'
		this.construct = construct
	}
}

function readPattern(params: { source: string }): PatternNode {
	const cursor: PatternCursor = { source: params.source, position: 0 }
	const tree = readAlternation({ cursor })
	if (cursor.position < cursor.source.length)
		throw new UnreadConstruct(cursor.source[cursor.position])
	return tree
}

function readAlternation(params: { cursor: PatternCursor }): PatternNode {
	const { cursor } = params
	const branches = [readSequence({ cursor })]
	while (cursor.source[cursor.position] === '|') {
		cursor.position++
		branches.push(readSequence({ cursor }))
	}
	return branches.length === 1 ? branches[0] : { kind: 'alternation', branches }
}

function readSequence(params: { cursor: PatternCursor }): PatternNode {
	const { cursor } = params
	const items: PatternNode[] = []
	while (cursor.position < cursor.source.length) {
		const character = cursor.source[cursor.position]
		if (character === '|' || character === ')') break
		if (character === '^' || character === '$') {
			cursor.position++
			continue
		}
		items.push(readQuantified({ cursor, node: readAtom({ cursor }) }))
	}
	return { kind: 'sequence', items }
}

function readAtom(params: { cursor: PatternCursor }): PatternNode {
	const { cursor } = params
	const { source } = cursor
	const character = source[cursor.position]

	if (character === '(') {
		if (source.startsWith('(?:', cursor.position)) cursor.position += 3
		else if (source[cursor.position + 1] === '?')
			throw new UnreadConstruct(source.slice(cursor.position, cursor.position + 3))
		else cursor.position++
		const group = readAlternation({ cursor })
		if (source[cursor.position] !== ')') throw new UnreadConstruct('(')
		cursor.position++
		return group
	}
	if (character === '[') return readClass({ cursor })
	if (character === '.') {
		cursor.position++
		return { kind: 'characterSet', source: '.' }
	}
	if (character === '\\') return readEscape({ cursor })
	if ('*+?{'.includes(character)) throw new UnreadConstruct(character)
	cursor.position++
	return { kind: 'literal', character }
}

/** `[...]` as it is written: the characters it admits are found by testing it. */
function readClass(params: { cursor: PatternCursor }): PatternNode {
	const { cursor } = params
	const { source } = cursor
	const start = cursor.position
	let position = start + 1
	while (position < source.length && source[position] !== ']')
		position += source[position] === '\\' ? 2 : 1
	if (position >= source.length) throw new UnreadConstruct('[')
	cursor.position = position + 1
	return { kind: 'characterSet', source: source.slice(start, cursor.position) }
}

function readEscape(params: { cursor: PatternCursor }): PatternNode {
	const { cursor } = params
	const { source } = cursor
	const letter = source[cursor.position + 1]
	if (letter === undefined) throw new UnreadConstruct('\\')

	if (CLASS_ESCAPE_LETTERS.has(letter)) {
		cursor.position += 2
		return { kind: 'characterSet', source: `\\${letter}` }
	}
	if ((letter === 'p' || letter === 'P') && source[cursor.position + 2] === '{') {
		const end = source.indexOf('}', cursor.position)
		if (end < 0) throw new UnreadConstruct(`\\${letter}`)
		const escape = source.slice(cursor.position, end + 1)
		cursor.position = end + 1
		return { kind: 'characterSet', source: escape }
	}
	if (letter in CONTROL_ESCAPES) {
		cursor.position += 2
		return { kind: 'literal', character: CONTROL_ESCAPES[letter] }
	}
	if (letter === 'u') {
		const unicode = /^\\u(?:\{([0-9A-Fa-f]+)\}|([0-9A-Fa-f]{4}))/u.exec(
			source.slice(cursor.position),
		)
		if (!unicode) throw new UnreadConstruct('\\u')
		cursor.position += unicode[0].length
		return {
			kind: 'literal',
			character: String.fromCodePoint(Number.parseInt(unicode[1] ?? unicode[2], 16)),
		}
	}
	// a letter or a digit escaped means something else (\b, \1, \k<name>): not read
	if (/[0-9A-Za-z]/u.test(letter)) throw new UnreadConstruct(`\\${letter}`)
	cursor.position += 2
	return { kind: 'literal', character: letter }
}

function readQuantified(params: { cursor: PatternCursor; node: PatternNode }): PatternNode {
	const { cursor, node } = params
	const { source } = cursor
	const character = source[cursor.position]
	let counts: { min: number; max: number | undefined } | undefined

	if (character === '?') counts = { min: 0, max: 1 }
	else if (character === '*') counts = { min: 0, max: undefined }
	else if (character === '+') counts = { min: 1, max: undefined }
	if (counts) cursor.position++
	else if (character === '{') {
		const braces = /^\{(\d+)(,(\d*))?\}/u.exec(source.slice(cursor.position))
		if (!braces) throw new UnreadConstruct('{')
		const min = Number(braces[1])
		const max = braces[2] === undefined ? min : braces[3] ? Number(braces[3]) : undefined
		counts = { min, max }
		cursor.position += braces[0].length
	}
	if (!counts) return node
	// a lazy count matches the same strings
	if (source[cursor.position] === '?') cursor.position++
	return { kind: 'repeat', node, ...counts }
}

/**
 * The strings the tree gives, alternatives in order; a class every character it admits, preferred first; a count
 * repeats its least (at least once) plus `stretch`, never past its most.
 */
function* candidatesOf(params: { node: PatternNode; stretch: number }): Generator<string> {
	const { node, stretch } = params
	if (node.kind === 'literal') {
		yield node.character
		return
	}
	if (node.kind === 'characterSet') {
		yield* admittedCharacters({ characterSet: node.source })
		return
	}
	if (node.kind === 'alternation') {
		for (const branch of node.branches) yield* candidatesOf({ node: branch, stretch })
		return
	}
	if (node.kind === 'sequence') {
		yield* concatenations({ items: node.items, stretch })
		return
	}
	const repetitions =
		node.max === 0
			? 0
			: Math.min(Math.max(node.min, 1) + stretch, node.max ?? Number.POSITIVE_INFINITY)
	yield* concatenations({
		items: Array.from({ length: repetitions }, () => node.node),
		stretch,
	})
}

function* concatenations(params: {
	items: readonly PatternNode[]
	stretch: number
}): Generator<string> {
	const [first, ...rest] = params.items
	if (first === undefined) {
		yield ''
		return
	}
	for (const head of candidatesOf({ node: first, stretch: params.stretch }))
		for (const tail of concatenations({ items: rest, stretch: params.stretch })) yield head + tail
}

function admittedCharacters(params: { characterSet: string }): string[] {
	const admits = new RegExp(`^${params.characterSet}$`, 'u')
	return [...PREFERRED_CHARACTERS].filter((character) => admits.test(character))
}
