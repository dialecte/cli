/** The GraphQL walker's constants. */

/** The keywords an operation definition starts with. */
export const GRAPHQL_OPERATIONS = ['query', 'mutation', 'subscription'] as const

/** The punctuators of a query, longest first (`...` before any single character). */
export const GRAPHQL_PUNCTUATORS = [
	'...',
	'{',
	'}',
	'(',
	')',
	'[',
	']',
	':',
	'$',
	'!',
	'=',
	'@',
	'|',
	'&',
] as const

/** What the walker never half-reads, by kind: each refusal names its kind. */
export const GRAPHQL_REFUSALS = {
	fragmentSpread: 'a fragment spread is not read; write the fields in the query',
	fragmentDefinition: 'a fragment definition is not read; write the fields in the query',
	inlineFragment: 'an inline fragment is not read; write the fields in the query',
	alias: 'an alias is not read; select the field by its own name',
	directive: 'a directive is not read; select the fields without it',
} as const

/** The type a query's top-level fields belong to. */
export const GRAPHQL_ROOT_TYPE = 'Query'
