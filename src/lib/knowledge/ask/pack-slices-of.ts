import { poolOfListAndSearch } from './ask-pool-of.ts'
import { AskRefusal } from './ask-refusal.ts'
import {
	GOLD_PACK_LIMIT,
	GOLD_RUN_KIND,
	PACK_SEARCH_LIMIT,
	READER_LINE_BUDGET,
} from './ask.constants.ts'
import { standardSliceOf } from './ladder-slices-of.ts'
import { aboutOf } from './parse-subject.ts'
import { readerSlicesOf } from './reader-slices-of.ts'
import { readerUnionOf } from './reader-union-of.ts'
import { runLadder } from './run-ladder.ts'
import { slicesOf } from './slices-of.ts'

import type {
	AskAngle,
	AskSlice,
	PackSlices,
	PackSlicesOfParams,
	PoolSlice,
	ReaderSlices,
} from './ask.types.ts'

/**
 * The slices the round-1 readers of a question are given (the gold run, D25): the ask ladder with no fact read or
 * written and no ask kept, the pool a pack draws from, then reader A's slices in A's order and the A and B slices
 * interleaved, a slice met twice kept once. A question the ladder refuses is read from find's whole-question list.
 */
export function packSlicesOf(params: PackSlicesOfParams): PackSlices {
	const { setup, question, about } = params
	if (setup.standard.kind !== 'documents') return { readerA: [], union: [] }
	const { indexes } = setup.standard
	const files = new Map(indexes.flatMap((index) => index.files).map((file) => [file.fileId, file]))
	const ladder = ladderReadOf({ params })
	const questionAbout = aboutOf({ about }).tag?.tag
	const found = slicesOf({
		question,
		angles: ladder.angles,
		indexes,
		about: ladder.subjectTag ?? questionAbout,
		questionAbout,
		limit: PACK_SEARCH_LIMIT,
	})
	const pool = poolOfListAndSearch({
		listed: ladder.slices,
		found,
		angles: ladder.angles,
		files,
	})
	const pack = readerSlicesOf({
		pool,
		effort: params.effort,
		budget: READER_LINE_BUDGET,
		previous: [],
	})
	if ('skipped' in pack) return { readerA: [], union: [] }
	const readerA = slicesOfLetter({ readers: pack.readers, letter: 'A' })
	const readerB = slicesOfLetter({ readers: pack.readers, letter: 'B' })
	const byId = new Map<string, PoolSlice>(pool.map((slice) => [slice.id, slice]))
	const union = readerUnionOf({
		a: readerA.map((slice) => slice.id),
		b: readerB.map((slice) => slice.id),
	}).flatMap((id) => byId.get(id) ?? [])
	return { readerA: readerA.map(standardSliceOf), union: union.map(standardSliceOf) }
}

/** The ladder's list, angles and first subject tag for the question; none of them when the ladder refuses it. */
function ladderReadOf(params: { params: PackSlicesOfParams }): {
	slices: AskSlice[]
	angles: AskAngle[]
	subjectTag: string | undefined
} {
	const { setup, question, about, effort } = params.params
	try {
		const outcome = runLadder({
			request: {
				question,
				...(about === undefined ? {} : { about }),
				kind: GOLD_RUN_KIND,
				decision: false,
				effort,
				noFacts: true,
				limit: GOLD_PACK_LIMIT,
				noStandard: false,
				personOnly: false,
			},
			setup,
			ask: null,
			lot: null,
		})
		return {
			slices: outcome.slices,
			angles: outcome.angles,
			subjectTag: outcome.subject.tags[0]?.tag,
		}
	} catch (error) {
		if (!(error instanceof AskRefusal)) throw error
		return { slices: [], angles: [], subjectTag: undefined }
	}
}

/** The slices one reader of the round is given (none when the letter has no brief). */
function slicesOfLetter(params: {
	readers: ReaderSlices[]
	letter: ReaderSlices['letter']
}): PoolSlice[] {
	return params.readers.find((reader) => reader.letter === params.letter)?.slices ?? []
}
