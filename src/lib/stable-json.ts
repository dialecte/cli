/**
 * JSON with the keys of every object in sorted order, so equal values serialise alike: arrays keep their order,
 * `undefined` members are dropped as `JSON.stringify` drops them (an `undefined` array item is `null`). Keys are
 * compared by code unit (never by locale), and written in that order whatever they are (an integer-like key is not
 * moved first, as an object would move it). Throws on a value that is not plain JSON data: an object whose
 * prototype is neither `Object.prototype` nor `null` (a Date, Map, Set, RegExp, class instance), a sparse array, a
 * function, a symbol or a bigint - `JSON.stringify` would write those lossily or not at all.
 */
export function stableJson(value: unknown): string {
	if (Array.isArray(value)) return `[${arrayItemsJson(value).join(',')}]`
	if (typeof value === 'object' && value !== null) {
		if (!isPlainObject(value)) throw notPlainJson({ found: describeObject(value) })
		const members = Object.entries(value)
			.filter(([, member]) => member !== undefined)
			.sort(byKeyCodeUnits)
			.map(([key, member]) => `${JSON.stringify(key)}:${stableJson(member)}`)
		return `{${members.join(',')}}`
	}
	if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint')
		throw notPlainJson({ found: `a ${typeof value}` })
	return JSON.stringify(value) ?? 'null'
}

/** Each item of an array as JSON, `undefined` as `null`; a hole (a sparse array) is refused. */
function arrayItemsJson(items: readonly unknown[]): string[] {
	const written: string[] = []
	for (let index = 0; index < items.length; index++) {
		if (!(index in items)) throw notPlainJson({ found: `a sparse array (no item at ${index})` })
		const item = items[index]
		written.push(item === undefined ? 'null' : stableJson(item))
	}
	return written
}

/** An object literal or an object without a prototype. */
function isPlainObject(value: object): boolean {
	const prototype: unknown = Object.getPrototypeOf(value)
	return prototype === Object.prototype || prototype === null
}

/** What a non-plain object is, by its constructor's name when it has one. */
function describeObject(value: object): string {
	const name: unknown = value.constructor?.name
	return typeof name === 'string' && name !== '' ? `a ${name}` : 'an object with a prototype'
}

function notPlainJson(params: { found: string }): TypeError {
	return new TypeError(`stableJson: not plain JSON data: ${params.found}`)
}

function byKeyCodeUnits([first]: [string, unknown], [second]: [string, unknown]): number {
	return first < second ? -1 : first > second ? 1 : 0
}
