import { normaliseText } from './normalise-text.ts'
import { LOWER_CASE_START_PATTERN, SPLIT_WORD_END_PATTERN } from './standard-index.constants.ts'

import type { StandardClassifiedLine, StandardLogicalLine } from './standard-index.types.ts'

/**
 * Joins consecutive prose lines into one logical line; a blank line ends it, and every other kind is a
 * logical line of its own that ends it too. Dropped lines belong to no logical line and are passed over.
 * A word split by a hyphen at a line end, the next line starting in lower case, is joined without the
 * hyphen and the space. Each logical line's text is normalised.
 */
export function joinLogicalLines(params: {
	lines: StandardClassifiedLine[]
	noise: boolean[]
}): StandardLogicalLine[] {
	const logicalLines: StandardLogicalLine[] = []
	let paragraph: StandardClassifiedLine[] = []
	for (const [index, line] of params.lines.entries()) {
		if (params.noise[index]) continue
		if (line.kind === 'prose') {
			paragraph.push(line)
			continue
		}
		if (paragraph.length > 0) logicalLines.push(paragraphOf(paragraph))
		paragraph = []
		if (line.kind !== 'blank')
			logicalLines.push({
				from: line.line,
				to: line.line,
				kind: line.kind,
				text: normaliseText(line.content),
			})
	}
	if (paragraph.length > 0) logicalLines.push(paragraphOf(paragraph))
	return logicalLines
}

function paragraphOf(lines: StandardClassifiedLine[]): StandardLogicalLine {
	const pieces = [lines[0].content]
	for (const [index, line] of lines.entries()) {
		if (index === 0) continue
		const previous = pieces[pieces.length - 1]
		if (SPLIT_WORD_END_PATTERN.test(previous) && LOWER_CASE_START_PATTERN.test(line.content))
			pieces[pieces.length - 1] = `${previous.slice(0, -1)}${line.content}`
		else pieces.push(line.content)
	}
	const text = pieces.join(' ')
	return {
		from: lines[0].line,
		to: lines[lines.length - 1].line,
		kind: 'prose',
		text: normaliseText(text),
	}
}
