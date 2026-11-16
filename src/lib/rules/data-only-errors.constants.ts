/** A type named this way is a function, whatever else it holds. */
export const FUNCTION_TYPE_NAMES: readonly string[] = [
	'Function',
	'CallableFunction',
	'NewableFunction',
]

/** `Object.setPrototypeOf(this, …)`: the one call an error's constructor may make. */
export const OBJECT_NAME = 'Object'

export const SET_PROTOTYPE_METHOD = 'setPrototypeOf'
