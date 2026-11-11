/** What a printed text must not hold, judged by the table's own list of characters. */
import { FORGED_MARK, FORGED_TAILS } from './lot-printed-fields.constants.ts'
import { UNSAFE_CODE_POINTS } from './print-faults.constants.ts'

/** The faults of a printed text: each raw unsafe character (as JSON), and each line that begins with the forged mark or a forged tail. */
export function printFaultsOf(text: string): string[] {
	const unsafe = Array.from(text)
		.filter(function isUnsafe(character) {
			const code = character.codePointAt(0) ?? 0
			return UNSAFE_CODE_POINTS.some(([first, last]) => code >= first && code <= last)
		})
		.map((character) => JSON.stringify(character))
	const forgedLines = text
		.split('\n')
		.filter(
			(line) => line.startsWith(FORGED_MARK) || FORGED_TAILS.some((tail) => line.startsWith(tail)),
		)
	return [...unsafe, ...forgedLines]
}
