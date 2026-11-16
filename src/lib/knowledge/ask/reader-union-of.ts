import type { ReaderUnionOfParams } from './ask.types.ts'

/**
 * The slices of readers A and B together (D25): A1, B1, A2, B2 and so on, the rest of the longer side after the
 * shorter, a slice met twice kept at its first place.
 */
export function readerUnionOf(params: ReaderUnionOfParams): string[] {
	const sides = [params.a, params.b]
	const union: string[] = []
	const seen = new Set<string>()
	for (let index = 0; index < Math.max(...sides.map((side) => side.length)); index++)
		for (const side of sides) {
			const slice = side[index]
			if (slice === undefined || seen.has(slice)) continue
			seen.add(slice)
			union.push(slice)
		}
	return union
}
