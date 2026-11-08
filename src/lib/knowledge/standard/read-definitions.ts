import { normaliseText } from './normalise-text.ts'

import type { StandardClassifiedLine, StandardDefinition } from './standard-index.types.ts'

/**
 * The definitions of the terms clause: the term written after the number, else the next non-blank
 * line; each runs to the line before the next definition, else to the end of the terms clause (the line
 * before the next top-level heading candidate, else the file's last line).
 */
export function readDefinitions(params: {
	lines: StandardClassifiedLine[]
	noise: boolean[]
}): StandardDefinition[] {
	const { lines, noise } = params
	const definitions: StandardDefinition[] = []
	for (const [index, line] of lines.entries()) {
		if (!line.definition || noise[index]) continue
		definitions.push({
			term: normaliseText(line.definition.term) || termBelow({ lines, noise, index }),
			number: line.definition.number,
			from: line.line,
			to: endOf({ lines, index }),
		})
	}
	return definitions
}

function termBelow(params: {
	lines: StandardClassifiedLine[]
	noise: boolean[]
	index: number
}): string {
	const { lines, noise, index } = params
	for (let next = index + 1; next < lines.length; next++)
		if (lines[next].kind !== 'blank' && !noise[next]) return normaliseText(lines[next].content)
	return ''
}

function endOf(params: { lines: StandardClassifiedLine[]; index: number }): number {
	const { lines, index } = params
	for (let next = index + 1; next < lines.length; next++)
		if (lines[next].definition || lines[next].candidate?.depth === 1) return lines[next].line - 1
	return lines.length
}
