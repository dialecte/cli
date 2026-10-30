/**
 * Text as a terminal lays it out: control sequences (colours, cursor moves), carriage returns and the
 * other control characters (a backspace, a bell, a C1 control) removed, tabs expanded to their stops,
 * each character counted by the cells it takes - wide ones and emoji two (a flag's two regional
 * indicators together, a character followed by the emoji selector U+FE0F), combining marks and the
 * zero-width joiner none. A live region's line fitted this way takes exactly one row.
 */
import { stripVTControlCharacters } from 'node:util'

import {
	EMOJI_PRESENTATION_SELECTOR,
	REGIONAL_INDICATOR_RANGE,
	TAB_STOP,
	WIDE_CHARACTER_RANGES,
	ZERO_WIDTH_RANGES,
} from './progress.constants.ts'

/** The plain text of `text`, cut so that it takes at most `cells` cells. */
export function fitToCells(params: { text: string; cells: number }): string {
	const characters = [...stripVTControlCharacters(params.text)].filter(
		(character) => character === '\t' || !isControl(character),
	)
	let fitted = ''
	let used = 0
	let regionalPending = false
	for (const [index, character] of characters.entries()) {
		if (character === '\t') {
			const stop = (Math.floor(used / TAB_STOP) + 1) * TAB_STOP
			if (stop > params.cells) break
			fitted += ' '.repeat(stop - used)
			used = stop
			regionalPending = false
			continue
		}
		const code = character.codePointAt(0) ?? 0
		const regional = code >= REGIONAL_INDICATOR_RANGE[0] && code <= REGIONAL_INDICATOR_RANGE[1]
		// the second indicator of a flag shares the two cells of the first
		const width =
			regional && regionalPending
				? 0
				: regional
					? 2
					: cellsOf({ character, next: characters[index + 1] })
		regionalPending = regional && !regionalPending
		if (used + width > params.cells) break
		fitted += character
		used += width
	}
	return fitted
}

/** C0 controls (a tab is expanded before), DEL and C1 controls: they move the cursor or ring. */
function isControl(character: string): boolean {
	const code = character.codePointAt(0) ?? 0
	return code < 0x20 || (code >= 0x7f && code <= 0x9f)
}

/** The cells a character takes: 0, 1 or 2 (a narrow one the emoji selector follows takes 2). */
function cellsOf(params: { character: string; next: string | undefined }): number {
	const code = params.character.codePointAt(0) ?? 0
	if (ZERO_WIDTH_RANGES.some(([from, to]) => code >= from && code <= to)) return 0
	if (WIDE_CHARACTER_RANGES.some(([from, to]) => code >= from && code <= to)) return 2
	return params.next?.codePointAt(0) === EMOJI_PRESENTATION_SELECTOR ? 2 : 1
}
