/** The functions and methods that read an attribute: their literal arguments are the attributes read. */
export const ATTRIBUTE_READERS: readonly string[] = [
	'getAttribute',
	'getAttributes',
	'readAttribute',
	'readAttributes',
]

/** A binding holding attributes: named `attributes`, `attrs`, or ending in `Attributes` (a type name too). */
export const ATTRIBUTE_BINDING_PATTERN = /^(?:attributes|attrs|\w*Attributes)$/

/** The properties that hold a tag name: compared with a literal, or set to one in an option object. */
export const TAG_PROPERTIES: readonly string[] = ['tagName', 'tag']

/** The array methods that read a constant as a list of names, one name at a time. */
export const ITERATING_METHODS: readonly string[] = [
	'map',
	'flatMap',
	'forEach',
	'filter',
	'some',
	'every',
]

/** A module constant's name: a named set when read through as a list of attribute names. */
export const NAMED_SET_PATTERN = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$|^[A-Z]{2,}$/

/** Between two tokens of a hashed text: no token holds it. */
export const TOKEN_SEPARATOR = '\u0000'
