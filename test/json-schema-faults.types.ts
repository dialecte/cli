/** A JSON Schema as read from its file. */
export type JsonSchema = Record<string, unknown>

/** What a schema check carries down its walk. */
export type FaultContext = {
	/** The schema whose `$defs` a local `$ref` reads: the root of the file the current schema came from. */
	root: JsonSchema
	/** The sibling schemas a `$ref` may name, by their `$id`. */
	schemas: readonly JsonSchema[]
}
