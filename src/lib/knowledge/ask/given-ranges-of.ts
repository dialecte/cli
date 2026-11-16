import { sliceQualityOf } from './slice-quality-of.ts'

import type { StandardFileIndex } from '../standard/standard-index.types.ts'
import type { GivenSlice, PackRange, PackReader, PoolSlice } from './ask.types.ts'

/**
 * The ids, in the pool now, of the slices a reader was given (I-8: the next round and the verdict's `anythingLeft`
 * read the same recorded ranges): the pool slices of the same file and lines as a range its pack recorded.
 */
export function givenIdsOf(params: { reader: PackReader; pool: PoolSlice[] }): string[] {
	const { ranges } = params.reader
	return params.pool
		.filter((slice) =>
			ranges.some(
				(range) => range.file === slice.file && range.from === slice.from && range.to === slice.to,
			),
		)
		.map((slice) => slice.id)
}

/** A slice of the pool as a pack records it given (I-6). */
export function packRangeOf(params: { slice: PoolSlice }): PackRange {
	const { slice } = params
	return {
		id: slice.id,
		file: slice.file,
		from: slice.from,
		to: slice.to,
		clause: slice.clause,
		linked: slice.linked,
	}
}

/**
 * A recorded range as a cite is checked against it: the title of the clause holding it (I-3: a clause headed by the
 * subject names it), read in the file's index, and the quality of the blocks its lines touch (I-11).
 */
export function givenSliceOf(params: {
	range: PackRange
	file: StandardFileIndex | undefined
}): GivenSlice {
	const { range, file } = params
	return {
		file: range.file,
		from: range.from,
		to: range.to,
		clause: range.clause,
		title: file === undefined ? null : clauseTitleOf({ file, range }),
		linked: range.linked,
		quality:
			file === undefined || sliceQualityOf({ slice: range, file }) === 'good' ? 'good' : 'poor',
	}
}

/** The title of the clause holding a range: the last heading of that number at or before its first line. */
function clauseTitleOf(params: { file: StandardFileIndex; range: PackRange }): string | null {
	const { range } = params
	if (range.clause === null) return null
	const heading = params.file.headings
		.filter((candidate) => candidate.number === range.clause && candidate.from <= range.from)
		.at(-1)
	return heading?.title ?? null
}
