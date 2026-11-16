import type { PackRange, ReaderMiss, ReaderMissOfParams } from './ask.types.ts'

/**
 * Whether a person's cite lies inside a slice a reader was given, and the first round it was given in (section 8:
 * a reader miss). Given means wholly inside one of the ranges a pack recorded given (I-6, L-1), in the same file.
 */
export function readerMissOf(params: ReaderMissOfParams): ReaderMiss {
	const { cite } = params
	function holds(range: PackRange): boolean {
		return range.file === cite.file && range.from <= cite.from && cite.to <= range.to
	}
	const rounds = params.packs
		.filter((pack) => pack.readers.some((reader) => reader.ranges.some(holds)))
		.map((pack) => pack.round)
	if (rounds.length === 0) return { given: false, round: null }
	return { given: true, round: Math.min(...rounds) }
}
