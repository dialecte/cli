/** Groups duplicating the typed surface (`q.any`, `tx.any`): not indexed, not required to be documented. */
export const UNINDEXED_GROUPS: readonly string[] = ['q.any', 'tx.any']

/** Which route names a method reached from several roots: a read is shown on `doc.query`. */
export const ROOT_PRIORITY: readonly string[] = ['q', 'tx', 'doc', 'project']

/** One collation for every sorted list of a generated block: the same order whatever the runtime locale. */
export const TEXT_COLLATOR = new Intl.Collator('en', { sensitivity: 'base' })

/** Text between straight or curly double quotes, on one line. */
export const QUOTED_TEXT_PATTERN = /"([^"\n]+)"|“([^”\n]+)”/g

/** From this many words, quoted text is a quoted sentence, not a quoted token like `"name"`. */
export const QUOTED_SENTENCE_MIN_WORDS = 4

/**
 * What `dialecte new verb` writes where a contributor has a sentence to write (the JSDoc summary, the
 * `@intent`, the test case): `skills check` refuses a method whose summary or intent still holds it.
 */
export const PLACEHOLDER_MARKER = 'FILL:'
