import type { StandardFileIndex, StandardLogicalLine } from './standard-index.types.ts'

/** The logical lines of a file overlapping the original lines `from` to `to`, whole, in file order. */
export function logicalLinesIn(params: {
	file: StandardFileIndex
	from: number
	to: number
}): StandardLogicalLine[] {
	const { file, from, to } = params
	return file.logicalLines.filter((line) => line.to >= from && line.from <= to)
}
