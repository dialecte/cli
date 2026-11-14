/** Constants of the `ask` command's tests: the questions, the standard folder and the files a lot's ask keeps. */
import { join } from 'node:path'

import { DECLARED_FOLDER } from './standard-selection.constants.ts'
import { buildSyntheticStandard } from './synthetic-standard.ts'

/** The cli's entry in the sources: Node runs it with its type stripping. */
export const CLI_SOURCE = join(import.meta.dirname, '..', 'src', 'cli.ts')

/** A structural question rung 1 answers from the test dialecte's definition. */
export const RUNG_ONE_QUESTION = 'children of AA_1'

/** A semantic question about a tag: no rung answers it, the documents' slices (or the outside route) follow. */
export const SEMANTIC_QUESTION = 'Explain the intent of AA_1'

/** The same question as it is asked in the privacy cases: a word no event may hold. */
export const PRIVATE_WORD = 'intent'

/** The text of the line of the standard file the slices point at: no event may hold it. */
export const SLICE_SENTENCE = 'The AA_1 element holds the parts.'

/** A file whose first clause names the test dialecte's AA_1 element. */
export const TAG_FILE = buildSyntheticStandard({
	blocks: [
		{ kind: 'heading', number: '1', title: 'Overview' },
		{ kind: 'raw', lines: [SLICE_SENTENCE] },
	],
})

/** The root of the documents of the dialecte that declares `Example 0000`: one folder, one file. */
export const DOCUMENT_STANDARDS = { [DECLARED_FOLDER]: { 'tag.md': TAG_FILE } }

/** The folder and the files an ask leaves, below the asks folder. */
export const ASK_FILE = 'ask.json'
export const ASKS_FOLDER = 'asks'
export const EVENTS_FILE = 'events.jsonl'
export const STANDARD_RECORD_FILE = 'standard.json'

/** The state folder's own place of the asks outside a lot. */
export const STATE_ASKS_SEGMENTS = ['dialecte', ASKS_FOLDER] as const

/** The ask ids the cases expect. */
export const FIRST_ASK = 'A-0001'
export const SECOND_ASK = 'A-0002'

/** The lot-less hand-over folder the cases make beside the project. */
export const HANDOVER_FOLDER = 'handover'

/** The words of the event kinds of an ask. */
export const ASK_EVENT_KINDS = ['ask.parsed', 'ask.rung', 'ask.fact', 'ask.state'] as const

/** A folder inside the repository the lot cases build: the refused `--lot` value of case 13c. */
export const WORK_TREE_SUBFOLDER = './src'

/** The members of the `--json` object, sorted. */
export const ASK_JSON_KEYS = [
	'angles',
	'answer',
	'ask',
	'boundary',
	'candidates',
	'conflict',
	'decision',
	'effort',
	'fact',
	'kind',
	'methods',
	'next',
	'question',
	'rung',
	'schema',
	'slices',
	'source',
	'standard',
	'state',
	'subject',
] as const

/** The `next` of an ask that needs readers on the documents, on the outside route, and of one that needs a person. */
export const NEXT_PACK = 'dialecte ask pack A-0001'
export const NEXT_PACK_OUTSIDE = 'dialecte ask pack A-0001 --outside'
export const NEXT_ANSWER = 'dialecte ask answer A-0001'

/** A tag name one character off a tag of the test dialecte. */
export const MISTYPED_TAG = 'AA_11'
