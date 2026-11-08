import {
	REPEATED_MINIMUM_COUNT,
	REPEATED_MINIMUM_LENGTH,
	REPEATED_MINIMUM_MEDIAN_GAP,
	TABLE_SEPARATOR_ROW_PATTERN,
} from './standard-index.constants.ts'

import type { StandardRepeatedLine } from './standard-index.types.ts'

/**
 * Repeated-line candidates, information only (nothing is dropped for being one): a trimmed original
 * line of two characters or more, not a table separator row, seen at least the minimum count of times
 * with a median gap at least the minimum (the lower middle gap for an even number of gaps). Sorted by
 * count descending, then by text.
 */
export function findRepeatedLines(params: { lines: string[] }): StandardRepeatedLine[] {
	const occurrences = new Map<string, number[]>()
	for (const [index, original] of params.lines.entries()) {
		const text = original.trim()
		if (text.length < REPEATED_MINIMUM_LENGTH) continue
		const seen = occurrences.get(text)
		if (seen) seen.push(index + 1)
		else occurrences.set(text, [index + 1])
	}
	const repeated: StandardRepeatedLine[] = []
	for (const [text, lineNumbers] of occurrences) {
		if (lineNumbers.length < REPEATED_MINIMUM_COUNT) continue
		if (TABLE_SEPARATOR_ROW_PATTERN.test(text)) continue
		const medianGap = lowerMedianGap(lineNumbers)
		if (medianGap < REPEATED_MINIMUM_MEDIAN_GAP) continue
		repeated.push({ text, count: lineNumbers.length, length: text.length, medianGap })
	}
	return repeated.sort(
		(first, second) =>
			second.count - first.count ||
			(first.text < second.text ? -1 : first.text > second.text ? 1 : 0),
	)
}

function lowerMedianGap(lineNumbers: number[]): number {
	const gaps = lineNumbers
		.slice(1)
		.map((lineNumber, index) => lineNumber - lineNumbers[index])
		.sort((first, second) => first - second)
	return gaps[Math.floor((gaps.length - 1) / 2)]
}
