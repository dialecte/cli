import { POLARITY_WINDOW } from './ask.constants.ts'
import { tokensOf } from './tokens-of.ts'

import type { CueCountParams } from './ask.types.ts'

/**
 * How many cues a text holds within 8 words of an anchor (every cue when no anchor is in the text). Cues are
 * matched longest first as the list orders them, a matched cue's words never counting again.
 */
export function cueCountOf(params: CueCountParams): number {
	const tokens = tokensOf({ text: params.text })
	const anchorWords = new Set(params.anchors.flatMap((anchor) => tokensOf({ text: anchor })))
	const anchorIndexes = tokens.flatMap((token, index) => (anchorWords.has(token) ? [index] : []))
	let count = 0
	let index = 0
	while (index < tokens.length) {
		const cue = params.cues.find((words) =>
			words.every((word, step) => tokens[index + step] === word),
		)
		if (cue === undefined) {
			index += 1
			continue
		}
		const last = index + cue.length - 1
		if (
			anchorIndexes.length === 0 ||
			anchorIndexes.some((anchor) => distanceOf({ anchor, first: index, last }) <= POLARITY_WINDOW)
		)
			count += 1
		index = last + 1
	}
	return count
}

/** Words between an anchor and the nearest word of a cue (0 when the anchor is inside it). */
function distanceOf(params: { anchor: number; first: number; last: number }): number {
	if (params.anchor < params.first) return params.first - params.anchor
	if (params.anchor > params.last) return params.anchor - params.last
	return 0
}
