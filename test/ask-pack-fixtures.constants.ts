/** Constants of the reader pack's tests: the quality, the slices, the briefs and the command's files. */
import { SLICE_SENTENCE } from './ask-command-workspace.constants.ts'
import { DECLARED_FOLDER } from './standard-selection.constants.ts'
import { buildSyntheticStandard } from './synthetic-standard.ts'

import type { AskAngle, RangeLine } from '../src/lib/knowledge/ask/ask.types.ts'
import type { QualityBlockOf } from './ask-pack-fixtures.types.ts'

/** The blocks of a file whose first thousand lines are good, the next thousand poor, the last five hundred unreadable. */
export const QUALITY_BLOCKS: QualityBlockOf[] = [
	{ from: 1, to: 1000, verdict: 'good' },
	{ from: 1001, to: 2000, verdict: 'poor' },
	{ from: 2001, to: 2500, verdict: 'unreadable' },
]

/** The angles of the pool cases: three families, in the order the families are listed. */
export const POOL_ANGLES: AskAngle[] = [
	{ id: 'a1', family: 'parents', terms: ['AA_1'] },
	{ id: 'a2', family: 'children', terms: ['AAA_1'] },
	{ id: 'a3', family: 'tables', terms: ['AA_1'] },
]

/** The size of each slice of the reader cases, and the budget that takes four of six. */
export const SLICE_COUNTED = 40
export const FOUR_SLICES_BUDGET = 160
export const ALL_SLICES_BUDGET = 1500

/** The question, subject and angle every brief case is made for. */
export const BRIEF_QUESTION = 'Explain the intent of AA_1'
export const BRIEF_NONCE_A = 'nonce-of-reader-a'
export const BRIEF_FILE = 'example-0000/tag'

/** The lines of the good slice (12-13) and of the poor one (40-41) of a brief. */
export const BRIEF_GOOD_LINES: RangeLine[] = [
	{ from: 12, to: 12, kind: 'prose', text: 'The AA_1 element holds the parts.' },
	{ from: 13, to: 13, kind: 'prose', text: 'Each part is listed once.' },
]
export const BRIEF_POOR_LINES: RangeLine[] = [
	{ from: 40, to: 40, kind: 'prose', text: 'The AA_1 parts keep their order.' },
	{ from: 41, to: 41, kind: 'prose', text: 'No part is repeated.' },
]

/** The public name of the outside brief (synthetic). */
export const OUTSIDE_NAME = 'Example 0000'

/** The second sentence of the pack standard: a second clause naming the same tag. */
export const PACK_SECOND_SENTENCE = 'The AA_1 parts are listed again in the second clause.'

/**
 * One file, two clauses that name the test dialecte's AA_1 element: the ask finds two slices, and the pack's wider
 * search finds nothing beyond that list (the pack test "reader A is given exactly the ask's list" proves it).
 */
export const PACK_TAG_FILE = buildSyntheticStandard({
	blocks: [
		{ kind: 'heading', number: '1', title: 'Overview' },
		{ kind: 'raw', lines: [SLICE_SENTENCE] },
		{ kind: 'blank' },
		{ kind: 'heading', number: '2', title: 'Parts' },
		{ kind: 'raw', lines: [PACK_SECOND_SENTENCE] },
	],
})

/** The same file after a third clause was added: its sha256 moved since the ask. */
export const PACK_TAG_FILE_MOVED = buildSyntheticStandard({
	blocks: [
		{ kind: 'heading', number: '1', title: 'Overview' },
		{ kind: 'raw', lines: [SLICE_SENTENCE] },
		{ kind: 'blank' },
		{ kind: 'heading', number: '2', title: 'Parts' },
		{ kind: 'raw', lines: [PACK_SECOND_SENTENCE] },
		{ kind: 'blank' },
		{ kind: 'heading', number: '3', title: 'Added' },
		{ kind: 'raw', lines: [PACK_SECOND_SENTENCE] },
	],
})

/** The root of the documents of the pack cases. */
export const PACK_STANDARDS = { [DECLARED_FOLDER]: { 'tag.md': PACK_TAG_FILE } }

/** The file id the ask's manifest names the pack file by. */
export const PACK_FILE_ID = `${DECLARED_FOLDER}/tag`

/** The names the pack leaves in an ask folder. */
export const REQUEST_FILE = 'request.json'
export const ROUNDS_FOLDER = 'rounds'
export const PACK_FILE = 'pack.json'
export const VERDICT_FILE = 'verdict.json'
export const OUT_FOLDER = 'briefs-out'

/** A semantic question whose first word is the verb `pack`: asked whole as one argument, never dispatched. */
export const PACK_LIKE_QUESTION = 'pack the intent of AA_1'

/** The id of the first ask, the round names and the readers' letters. */
export const ROUND_ONE = 'round-1'
export const ROUND_TWO = 'round-2'
export const READER_FILES = {
	A: ['reader-A.json', 'reader-A.md'],
	B: ['reader-B.json', 'reader-B.md'],
	C: ['reader-C.json', 'reader-C.md'],
} as const

/** A nonce no pack issued, and the time stamp of a round-1 record written by hand. */
export const HAND_WRITTEN_AT = '2026-11-14T10:00:00.000Z'
export const HAND_WRITTEN_NONCES = {
	A: 'hand-written-nonce-a',
	B: 'hand-written-nonce-b',
	C: 'hand-written-nonce-c',
} as const
export const HAND_WRITTEN_NONCE_LIST: string[] = Object.values(HAND_WRITTEN_NONCES)

/** The folder of an ask nobody made. */
export const UNKNOWN_ASK = 'A-9999'

/** The first effort of an ask that wants three readers. */
export const HIGH_EFFORT = 'high'

/** The question of the unchecked fact a re-ask is made for: about the test dialecte's AA_1 element. */
export const REASK_PACK_QUESTION = 'Explain the parts listed by AA_1'
