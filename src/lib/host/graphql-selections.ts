/** A small walker over a GraphQL query: the fields it selects, type by type from the root. */
import {
	GRAPHQL_OPERATIONS,
	GRAPHQL_PUNCTUATORS,
	GRAPHQL_REFUSALS,
} from './graphql-selections.constants.ts'

import type {
	GraphqlArguments,
	GraphqlCursor,
	GraphqlSelection,
	GraphqlStep,
	GraphqlToken,
} from './graphql-selections.types.ts'
import type { HostRefusal } from './host.types.ts'

/**
 * Every field the query selects, in document order, with its ancestors and its argument names (not the variables
 * they take). A fragment, an alias or a directive is refused, never half-read.
 */
export function selectionsOf(params: { query: string }): GraphqlSelection[] | HostRefusal {
	const tokens = tokensOf({ query: params.query })
	if ('refusal' in tokens) return tokens
	return readDocument({ cursor: { tokens, at: 0 } })
}

/** Every definition from the cursor to the end, read in turn. */
function readDocument(params: { cursor: GraphqlCursor }): GraphqlSelection[] | HostRefusal {
	const { tokens, at } = params.cursor
	if (at >= tokens.length) return []
	const step = readDefinition({ cursor: params.cursor })
	if ('refusal' in step) return step
	const rest = readDocument({ cursor: { tokens, at: step.at } })
	if ('refusal' in rest) return rest
	return [...step.selections, ...rest]
}

/** The query's tokens: whitespace, commas and comments dropped, strings kept whole. */
function tokensOf(params: { query: string }): GraphqlToken[] | HostRefusal {
	const { query } = params
	const tokens: GraphqlToken[] = []
	let at = 0
	while (at < query.length) {
		const rest = query.slice(at)
		const blank = /^[\s,﻿]+|^#[^\n\r]*/.exec(rest)
		if (blank) {
			at += blank[0].length
			continue
		}
		const word = /^[_A-Za-z][_0-9A-Za-z]*/.exec(rest)
		if (word) {
			tokens.push({ kind: 'name', text: word[0] })
			at += word[0].length
			continue
		}
		const value =
			/^"""[\s\S]*?(?<!\\)"""/.exec(rest) ??
			/^"(?:[^"\\\n\r]|\\.)*"/.exec(rest) ??
			/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(rest)
		if (value) {
			tokens.push({ kind: 'value', text: value[0] })
			at += value[0].length
			continue
		}
		const punctuator = GRAPHQL_PUNCTUATORS.find(function startsRest(text) {
			return rest.startsWith(text)
		})
		if (!punctuator) return { refusal: `the query is not GraphQL at "${rest.slice(0, 20)}"` }
		tokens.push({ kind: 'punctuator', text: punctuator })
		at += punctuator.length
	}
	return tokens
}

/** The token `ahead` of the cursor, or undefined past the end. */
function peek(params: { cursor: GraphqlCursor; ahead?: number }): GraphqlToken | undefined {
	return params.cursor.tokens[params.cursor.at + (params.ahead ?? 0)]
}

/** Whether the token `ahead` of the cursor is the punctuator `text`. */
function isPunctuator(params: { cursor: GraphqlCursor; text: string; ahead?: number }): boolean {
	const token = peek({ cursor: params.cursor, ahead: params.ahead })
	return token?.kind === 'punctuator' && token.text === params.text
}

/** The cursor moved `by` tokens on. */
function moved(params: { cursor: GraphqlCursor; by: number }): GraphqlCursor {
	return { tokens: params.cursor.tokens, at: params.cursor.at + params.by }
}

/** The refusal of a query that ends or breaks where `expected` was due. */
function malformed(params: { cursor: GraphqlCursor; expected: string }): HostRefusal {
	const token = peek({ cursor: params.cursor })
	const found = token ? `"${token.text}"` : 'the end'
	return { refusal: `the query is not GraphQL: ${params.expected} expected, ${found} found` }
}

/** One definition read: an operation (its selections walked) or a fragment (refused). */
function readDefinition(params: { cursor: GraphqlCursor }): GraphqlStep | HostRefusal {
	const token = peek({ cursor: params.cursor })
	if (token?.kind === 'name' && token.text === 'fragment')
		return { refusal: GRAPHQL_REFUSALS.fragmentDefinition }
	const body =
		token?.kind === 'name' && isOperation({ text: token.text })
			? operationBody({ cursor: moved({ cursor: params.cursor, by: 1 }) })
			: params.cursor
	if ('refusal' in body) return body
	if (!isPunctuator({ cursor: body, text: '{' }))
		return malformed({ cursor: body, expected: 'an operation' })
	return readSelectionSet({ cursor: body, path: [] })
}

/** The cursor after an operation's keyword moved past its name and variables to its selection set. */
function operationBody(params: { cursor: GraphqlCursor }): GraphqlCursor | HostRefusal {
	const named =
		peek({ cursor: params.cursor })?.kind === 'name'
			? moved({ cursor: params.cursor, by: 1 })
			: params.cursor
	const declared = isPunctuator({ cursor: named, text: '(' })
		? skipBalanced({ cursor: named, open: '(', close: ')' })
		: named
	if ('refusal' in declared) return declared
	if (isPunctuator({ cursor: declared, text: '@' })) return { refusal: GRAPHQL_REFUSALS.directive }
	return declared
}

/** Whether a name is an operation keyword. */
function isOperation(params: { text: string }): boolean {
	return GRAPHQL_OPERATIONS.some(function isKeyword(keyword) {
		return keyword === params.text
	})
}

/** A `{ … }` of fields read, each recorded under `path`, nested sets walked in document order. */
function readSelectionSet(params: {
	cursor: GraphqlCursor
	path: string[]
}): GraphqlStep | HostRefusal {
	return readFields({ cursor: moved({ cursor: params.cursor, by: 1 }), path: params.path })
}

/** The fields from the cursor to the set's `}`, read in turn. */
function readFields(params: { cursor: GraphqlCursor; path: string[] }): GraphqlStep | HostRefusal {
	const { cursor, path } = params
	if (isPunctuator({ cursor, text: '}' })) return { at: cursor.at + 1, selections: [] }
	const field = readField({ cursor, path })
	if ('refusal' in field) return field
	const rest = readFields({ cursor: { tokens: cursor.tokens, at: field.at }, path })
	if ('refusal' in rest) return rest
	return { at: rest.at, selections: [...field.selections, ...rest.selections] }
}

/** One field read: its name, its argument names, then its own selection set when it has one. */
function readField(params: { cursor: GraphqlCursor; path: string[] }): GraphqlStep | HostRefusal {
	const { cursor, path } = params
	if (isPunctuator({ cursor, text: '...' })) return fragmentRefusal({ cursor })
	const token = peek({ cursor })
	if (token?.kind !== 'name') return malformed({ cursor, expected: 'a field' })
	if (isPunctuator({ cursor, text: ':', ahead: 1 })) return { refusal: GRAPHQL_REFUSALS.alias }
	const named = moved({ cursor, by: 1 })
	const args = isPunctuator({ cursor: named, text: '(' })
		? readArgumentNames({ cursor: named })
		: { at: named.at, names: [] }
	if ('refusal' in args) return args
	const after = { tokens: cursor.tokens, at: args.at }
	if (isPunctuator({ cursor: after, text: '@' })) return { refusal: GRAPHQL_REFUSALS.directive }
	const selection = { path, field: token.text, args: args.names }
	if (!isPunctuator({ cursor: after, text: '{' })) return { at: after.at, selections: [selection] }
	const nested = readSelectionSet({ cursor: after, path: [...path, token.text] })
	if ('refusal' in nested) return nested
	return { at: nested.at, selections: [selection, ...nested.selections] }
}

/** The refusal of a `...`: an inline fragment (`... on T`, `... {`, `... @`) or a fragment spread. */
function fragmentRefusal(params: { cursor: GraphqlCursor }): HostRefusal {
	const next = peek({ cursor: params.cursor, ahead: 1 })
	const spread = next?.kind === 'name' && next.text !== 'on'
	return { refusal: spread ? GRAPHQL_REFUSALS.fragmentSpread : GRAPHQL_REFUSALS.inlineFragment }
}

/** A field's `( name: value … )` read into its argument names; each value skipped whole, its braces included. */
function readArgumentNames(params: { cursor: GraphqlCursor }): GraphqlArguments | HostRefusal {
	return readArguments({ cursor: moved({ cursor: params.cursor, by: 1 }) })
}

/** The arguments from the cursor to the list's `)`, read in turn. */
function readArguments(params: { cursor: GraphqlCursor }): GraphqlArguments | HostRefusal {
	const { cursor } = params
	if (isPunctuator({ cursor, text: ')' })) return { at: cursor.at + 1, names: [] }
	const token = peek({ cursor })
	if (token?.kind !== 'name' || !isPunctuator({ cursor, text: ':', ahead: 1 }))
		return malformed({ cursor, expected: 'an argument' })
	const value = skipValue({ cursor: moved({ cursor, by: 2 }) })
	if ('refusal' in value) return value
	const rest = readArguments({ cursor: value })
	if ('refusal' in rest) return rest
	return { at: rest.at, names: [token.text, ...rest.names] }
}

/** The cursor past one argument value: a variable, a list, an object, or a single literal or enum. */
function skipValue(params: { cursor: GraphqlCursor }): GraphqlCursor | HostRefusal {
	const { cursor } = params
	if (isPunctuator({ cursor, text: '$' }))
		return peek({ cursor, ahead: 1 })?.kind === 'name'
			? moved({ cursor, by: 2 })
			: malformed({ cursor, expected: 'a variable' })
	if (isPunctuator({ cursor, text: '[' })) return skipBalanced({ cursor, open: '[', close: ']' })
	if (isPunctuator({ cursor, text: '{' })) return skipBalanced({ cursor, open: '{', close: '}' })
	const token = peek({ cursor })
	if (!token || token.kind === 'punctuator') return malformed({ cursor, expected: 'a value' })
	return moved({ cursor, by: 1 })
}

/** The cursor past a bracketed group's matching close; strings are whole tokens, so their brackets do not count. */
function skipBalanced(params: {
	cursor: GraphqlCursor
	open: string
	close: string
}): GraphqlCursor | HostRefusal {
	const { cursor, open, close } = params
	const { tokens } = cursor
	let depth = 0
	for (let at = cursor.at; at < tokens.length; at++) {
		const here = { tokens, at }
		if (isPunctuator({ cursor: here, text: open })) depth++
		if (isPunctuator({ cursor: here, text: close })) depth--
		if (depth === 0) return { tokens, at: at + 1 }
	}
	return malformed({ cursor: { tokens, at: tokens.length }, expected: `"${close}"` })
}
