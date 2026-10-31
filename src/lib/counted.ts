/** A count with its noun, singular at 1: shared by the cards, the gate lines, a hook's summary. */

/** `<count> <noun>` with the noun in the plural unless the count is 1: `1 error`, `2 errors`. */
export function counted(params: { count: number; noun: string }): string {
	return `${params.count} ${params.noun}${params.count === 1 ? '' : 's'}`
}
