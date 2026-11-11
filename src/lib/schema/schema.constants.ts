/** The engine every dialecte is built on: its readers come from the copy each dialecte resolves. */
export const CORE_PACKAGE = '@dialecte/core'

/** Core's definition readers, imported from the core a dialecte resolves. */
export const CORE_READERS_ENTRY = '@dialecte/core/utils'

/** The readers `dialecte schema` needs from core's utils. */
export const CORE_READER_NAMES: readonly string[] = [
	'resolveDefinition',
	'getAttributeRules',
	'enumeratedValues',
	'valuePatterns',
	'admittedXsiTypes',
	'childOccurrences',
	'orderByConfigSequence',
]

/** The prefix of a definition hash: the algorithm its hex digest is of. */
export const DEFINITION_HASH_PREFIX = 'sha256:'

/** How many tag names an unknown tag suggests. */
export const SUGGESTION_LIMIT = 5
