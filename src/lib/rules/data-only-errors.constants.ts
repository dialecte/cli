/** A name whose value is always data, whatever the module declares. */
export const ALWAYS_DATA_NAMES: readonly string[] = ['undefined', 'NaN', 'Infinity']

/** A type named this way is a function, whatever else it holds. */
export const FUNCTION_TYPE_NAMES: readonly string[] = [
	'Function',
	'CallableFunction',
	'NewableFunction',
]
