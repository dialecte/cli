/** What the GraphQL walker reads out of a query. */

/** One selected field: its ancestors' field names, its own name and the names of the arguments it passes. */
export type GraphqlSelection = { path: string[]; field: string; args: string[] }

/** One lexical token of a query: a name, a punctuator (`{`, `...`, `$`), or a value (string, number). */
export type GraphqlToken = { kind: 'name' | 'punctuator' | 'value'; text: string }

/** Where the walker stands: the query's tokens and the index of the next one. */
export type GraphqlCursor = { tokens: readonly GraphqlToken[]; at: number }

/** What one read step gives: the index after what it read, and the selections it read there. */
export type GraphqlStep = { at: number; selections: GraphqlSelection[] }

/** What an argument list gives: the index after its `)`, and the argument names. */
export type GraphqlArguments = { at: number; names: string[] }
