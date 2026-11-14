import { findInStandard } from '../standard/find-in-standard.ts'
import { AskRefusal } from './ask-refusal.ts'
import { GOLD_RUN_EFFORT, GOLD_RUN_KIND } from './ask.constants.ts'
import { aboutOf } from './parse-subject.ts'
import { runLadder } from './run-ladder.ts'

import type { StandardSlice } from '../standard/standard-search.types.ts'
import type { AskSlice, LadderSlicesOfParams } from './ask.types.ts'

/**
 * The slices the ask ladder hands the readers for a question (the gold run, D21): kind forced `semantic`, no fact
 * read or written, no ask kept; the merged list (direct slices, then linked ones) as `find` answers slices. For a
 * question the ladder refuses, find's own list for the whole question (D27: never below find alone).
 */
export function ladderSlicesOf(params: LadderSlicesOfParams): StandardSlice[] {
	const { setup, question, about, limit } = params
	try {
		const outcome = runLadder({
			request: {
				question,
				...(about === undefined ? {} : { about }),
				kind: GOLD_RUN_KIND,
				decision: false,
				effort: GOLD_RUN_EFFORT,
				noFacts: true,
				limit,
				noStandard: false,
				personOnly: false,
			},
			setup,
			ask: null,
			lot: null,
		})
		return outcome.slices.map(standardSliceOf)
	} catch (error) {
		if (!(error instanceof AskRefusal)) throw error
		// the query the ladder's whole-question find runs, so a refused item scores as find alone does
		return findInStandard({
			indexes: setup.standard.kind === 'documents' ? setup.standard.indexes : [],
			query: question,
			about: aboutOf({ about }).tag?.tag,
			limit,
		})
	}
}

/** An ask's slice as `find` gives one: no title, no matched terms (the scoring reads only its file and lines). */
function standardSliceOf(slice: AskSlice): StandardSlice {
	return {
		file: slice.file,
		from: slice.from,
		to: slice.to,
		clause: slice.clause,
		title: null,
		score: slice.score,
		terms: [],
		linked: slice.linked,
	}
}
