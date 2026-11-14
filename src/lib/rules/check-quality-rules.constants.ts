/** Methods that change the value they are called on. */
export const MUTATING_METHODS: readonly string[] = [
	'push',
	'pop',
	'shift',
	'unshift',
	'splice',
	'sort',
	'reverse',
	'fill',
	'copyWithin',
	'add',
	'delete',
	'clear',
	'set',
]

/** Array methods whose callback runs once per item: a loop body. */
export const LOOP_CALLBACK_METHODS: readonly string[] = [
	'map',
	'forEach',
	'flatMap',
	'filter',
	'reduce',
	'some',
	'every',
	'find',
	'findIndex',
]

/** A function body longer than this many code lines is reported. */
export const LONG_FUNCTION_LINES = 60

/** A receiver named with one of these endings is a query binding (`sourceQuery`, `targetTx`). */
export const QUERY_BINDING_SUFFIXES: readonly string[] = ['Query', 'Tx']

/** A receiver path through one of these properties reads a query (`context.query.x`, `tx.any.x`). */
export const QUERY_PATH_SEGMENTS: readonly string[] = ['query', 'tx', 'any']

/** A receiver path through this property calls a measuring helper, never a query read (`doc.query.perf.x`). */
export const PERF_PATH_SEGMENT = 'perf'

/** A class or namespace name: a static call on it (`Object.entries(table)`) starts a chain. */
export const CLASS_NAME_PATTERN = /^[A-Z]/
