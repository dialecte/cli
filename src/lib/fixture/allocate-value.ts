/**
 * The first of the values not used yet in the document, now used; the first value when every one is (a fixed
 * value, a single enumeration). Sampled values stay distinct, so a unique or key field never repeats one.
 */
export function allocateValue(params: { values: readonly string[]; used: Set<string> }): string {
	const { values, used } = params
	const value = values.find((candidate) => !used.has(candidate)) ?? values[0]
	used.add(value)
	return value
}
