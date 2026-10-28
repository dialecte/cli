/** The seed of the ids a fixture mints: the same command gives the same document. */
export const FIXTURE_SEED = 0

/** The instant the clock stands at while a fixture is built: a date a hook writes is the same every time. */
export const FIXTURE_NOW = new Date('2000-01-01T00:00:00.000Z')

/**
 * The characters tried, in this order, for one a pattern's class, escape or `.` admits: letters first,
 * then digits, then the other printable ASCII characters.
 */
export const PREFERRED_CHARACTERS =
	'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-.:/ !"#$%&\'()*+,;<=>?@[\\]^`{|}~'

/** How many strings of a pattern are tried, at each stretch of its counts, for ones every check accepts. */
export const PATTERN_CANDIDATE_LIMIT = 512

/**
 * How far past its least count a repeated part is stretched when shorter strings do not do (a length facet):
 * the pattern is read again with each count one longer, up to this many times.
 */
export const PATTERN_STRETCH_LIMIT = 8

/** How many valid values of a type are offered, so a value already used elsewhere can be passed over. */
export const VALUE_CHOICE_LIMIT = 32

/** How many times the references are walked again for the elements planted by the last walk. */
export const REFERENCE_ROUND_LIMIT = 16

/** The escapes standing for a class of characters (`\d`, `\w`, `\s` and their negations). */
export const CLASS_ESCAPE_LETTERS: ReadonlySet<string> = new Set(['d', 'D', 'w', 'W', 's', 'S'])

/** The escapes standing for one control character. */
export const CONTROL_ESCAPES: Readonly<Record<string, string>> = {
	t: '\t',
	n: '\n',
	r: '\r',
	f: '\f',
	v: '\v',
}

/**
 * The built-in types whose value is free text: an untyped required attribute takes the element's tag name,
 * which every one of them admits.
 */
export const TEXT_BUILTINS: ReadonlySet<string> = new Set([
	'string',
	'normalizedString',
	'token',
	'Name',
	'NCName',
	'NMTOKEN',
	'NMTOKENS',
	'ID',
	'IDREF',
	'IDREFS',
	'ENTITY',
	'ENTITIES',
	'anySimpleType',
])

/** The built-in types whose value is a number: their values count up from the lowest one the facets allow. */
export const NUMERIC_BUILTINS: ReadonlySet<string> = new Set([
	'decimal',
	'integer',
	'int',
	'long',
	'short',
	'byte',
	'nonNegativeInteger',
	'nonPositiveInteger',
	'negativeInteger',
	'positiveInteger',
	'unsignedLong',
	'unsignedInt',
	'unsignedShort',
	'unsignedByte',
	'float',
	'double',
])

/** The numeric built-in types whose value is a whole number. */
export const INTEGER_BUILTINS: ReadonlySet<string> = new Set([
	'integer',
	'int',
	'long',
	'short',
	'byte',
	'nonNegativeInteger',
	'nonPositiveInteger',
	'negativeInteger',
	'positiveInteger',
	'unsignedLong',
	'unsignedInt',
	'unsignedShort',
	'unsignedByte',
])

/** The built-in types an empty value is not one of. */
export const NON_EMPTY_BUILTINS: ReadonlySet<string> = new Set([
	...NUMERIC_BUILTINS,
	'boolean',
	'Name',
	'NCName',
	'NMTOKEN',
	'NMTOKENS',
	'ID',
	'IDREF',
	'IDREFS',
	'ENTITY',
	'ENTITIES',
	'QName',
	'language',
	'date',
	'dateTime',
	'time',
	'duration',
	'gYear',
	'gYearMonth',
	'gMonth',
	'gMonthDay',
	'gDay',
])

/** The values of a boolean. */
export const BOOLEAN_VALUES: ReadonlySet<string> = new Set(['true', 'false', '1', '0'])

/** A valid value of each other built-in type a required attribute may take. */
export const BUILTIN_SAMPLES: Readonly<Record<string, string>> = {
	boolean: 'false',
	decimal: '0',
	integer: '0',
	int: '0',
	long: '0',
	short: '0',
	byte: '0',
	nonNegativeInteger: '0',
	nonPositiveInteger: '0',
	unsignedLong: '0',
	unsignedInt: '0',
	unsignedShort: '0',
	unsignedByte: '0',
	positiveInteger: '1',
	negativeInteger: '-1',
	float: '0',
	double: '0',
	language: 'en',
	anyURI: 'urn:fixture',
	date: '2000-01-01',
	dateTime: '2000-01-01T00:00:00Z',
	time: '00:00:00',
	duration: 'PT0S',
	gYear: '2000',
	gYearMonth: '2000-01',
	gMonth: '--01',
	gMonthDay: '--01-01',
	gDay: '---01',
	hexBinary: '00',
	base64Binary: 'AA==',
}

/** The namespace of xsi:type: the XML Schema instance namespace, the same in every document. */
export const XSI_NAMESPACE = { prefix: 'xsi', uri: 'http://www.w3.org/2001/XMLSchema-instance' }

/** The attribute an element of an abstract type names its variant with. */
export const XSI_TYPE_ATTRIBUTE = 'xsi:type'
