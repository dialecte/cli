/** Constants of the review round 1 cases of the ask readers: quotes and ranges, sessions, tiers, files, seams. */
import { SEMANTIC_QUESTION } from './ask-command-workspace.constants.ts'
import { REASK_PACK_QUESTION } from './ask-pack-fixtures.constants.ts'
import { FIRST_CLAUSE_SENTENCE, SECOND_CLAUSE_SENTENCE } from './ask-verdict-fixtures.constants.ts'
import { factDraft } from './fact-fixtures.ts'
import { WIDGET_PACKAGE } from './installed-test-dialecte.constants.ts'
import { DECLARED_FOLDER } from './standard-selection.constants.ts'
import { buildSyntheticStandard } from './synthetic-standard.ts'

import type { FactDraft } from '../src/lib/knowledge/facts/facts.types.ts'

/** A quote ending inside a word of its range (`AA_1` inside `AA_10`), and the range. */
export const QUOTE_ENDING_INSIDE_A_WORD = 'in this clause the element of the attribute AA_1'
export const RANGE_ENDING_INSIDE_A_WORD =
	'in this clause the element of the attribute AA_10 shall hold DD_1 in every case'

/** A quote starting inside a word of its range (`bounded` inside `unbounded`), and the range. */
export const QUOTE_STARTING_INSIDE_A_WORD =
	'bounded example value of the attribute shall be present'
export const RANGE_STARTING_INSIDE_A_WORD =
	'unbounded example value of the attribute shall be present in every case'

/** The session and the body key of an accepted report of round 1, as the verdict keeps them. */
export const SESSION_ROUND_ONE_A = 'session-round-one-a'
export const BODY_HASH_ROUND_ONE_A = 'a'.repeat(64)
export const ANOTHER_BODY_HASH = 'b'.repeat(64)

/** A reader fact the re-ask agrees with (an outside answer of yes), and the marker a round leaves with its key. */
export const REASKED_AGREEING_DRAFT: FactDraft = factDraft({
	question: REASK_PACK_QUESTION,
	subject: {
		package: WIDGET_PACKAGE,
		tags: [{ tag: 'AA_1', parent: null }],
		attributes: [],
		codes: [],
		methods: [],
	},
	kind: 'semantic',
	answer: { verdict: 'yes', value: null, text: 'It holds it.' },
	source: 'outside',
	sources: [{ kind: 'model' }],
})

/** The tier names a report may carry, and a word that is not one. */
export const TIER_STRONG = 'strong'
export const TIER_FAST = 'fast'
export const TIER_STANDARD = 'standard'
export const TIER_UNKNOWN = 'huge'

/** The note of an outside record that says every answer was confirmed, and one that says none was. */
export const NOTE_SAYING_CONFIRMED = 'asks A-0001 answered F-0003 (all confirmed)'
export const NOTE_SAYING_UNCHECKED = 'asks A-0001 needs-readers (all unchecked)'

/** The two lines of the first clause's one paragraph, and a quote that crosses from the first into the second. */
export const PARAGRAPH_FIRST_LINE = 'In this clause the element AA_1 shall hold the child AAA_1 in'
export const PARAGRAPH_SECOND_LINE = 'its content model and in no other place of the file.'
export const QUOTE_ACROSS_THE_LINES =
	'the element AA_1 shall hold the child AAA_1 in its content model'
export const OTHER_QUOTE_ACROSS_THE_LINES =
	'the element AA_1 shall hold the child AAA_1 in its content model and in no'

/** A file whose first clause is one paragraph of two consecutive lines, and the documents holding it. */
export const TWO_LINE_PARAGRAPH_FILE = buildSyntheticStandard({
	blocks: [
		{ kind: 'heading', number: '1', title: 'Overview' },
		{ kind: 'raw', lines: [PARAGRAPH_FIRST_LINE, PARAGRAPH_SECOND_LINE] },
		{ kind: 'blank' },
		{ kind: 'heading', number: '2', title: 'Parts' },
		{ kind: 'raw', lines: [SECOND_CLAUSE_SENTENCE] },
	],
})
export const TWO_LINE_STANDARDS = { [DECLARED_FOLDER]: { 'tag.md': TWO_LINE_PARAGRAPH_FILE } }

/** The documents of the verdict cases after a clause was added: the checksum of the file moved since the ask. */
export const MOVED_TAG_FILE = buildSyntheticStandard({
	blocks: [
		{ kind: 'heading', number: '1', title: 'Overview' },
		{ kind: 'raw', lines: [FIRST_CLAUSE_SENTENCE] },
		{ kind: 'blank' },
		{ kind: 'heading', number: '2', title: 'Parts' },
		{ kind: 'raw', lines: [SECOND_CLAUSE_SENTENCE] },
		{ kind: 'blank' },
		{ kind: 'heading', number: '3', title: 'Added' },
		{ kind: 'raw', lines: [SECOND_CLAUSE_SENTENCE] },
	],
})

/** What an earlier, crashed run recorded: a person's unchecked fact on the ask's question, a readers' standard fact. */
export const EARLIER_FACT_TEXT = 'AA_1 holds AAA_1.'
export const EARLIER_PERSON_DRAFT: FactDraft = factDraft({
	question: SEMANTIC_QUESTION,
	kind: 'semantic',
	source: 'person',
	answer: { verdict: 'person', value: null, text: EARLIER_FACT_TEXT },
	by: { rung: 6, person: 'person-a' },
	sources: [],
	evidence: [],
	unchecked: true,
})
export const EARLIER_STANDARD_DRAFT: FactDraft = factDraft({
	question: SEMANTIC_QUESTION,
	kind: 'semantic',
	answer: { verdict: 'yes', value: null, text: EARLIER_FACT_TEXT },
	by: { rung: 4, readers: 2, rounds: 1, adjudicator: false, person: null, tiers: [] },
})

/** The unchecked fact a re-ask re-asks: an outside answer of `no`, and a person's unchecked answer. */
export const REASKED_TEXT = 'It does not hold it.'
const REASKED_SUBJECT = {
	package: WIDGET_PACKAGE,
	tags: [{ tag: 'AA_1', parent: null }],
	attributes: [],
	codes: [],
	methods: [],
}
export const REASKED_OUTSIDE_DRAFT: FactDraft = factDraft({
	question: REASK_PACK_QUESTION,
	subject: REASKED_SUBJECT,
	kind: 'semantic',
	answer: { verdict: 'no', value: null, text: REASKED_TEXT },
	source: 'outside',
	sources: [{ kind: 'model' }],
})
export const REASKED_PERSON_DRAFT: FactDraft = factDraft({
	question: REASK_PACK_QUESTION,
	subject: REASKED_SUBJECT,
	kind: 'semantic',
	answer: { verdict: 'person', value: null, text: REASKED_TEXT },
	source: 'person',
	by: { rung: 6, person: 'person-a' },
	sources: [],
	evidence: [],
	unchecked: true,
})

/** The text of a stub report file that closes a round for a reader who gave none, and the lines of a verdict kept. */
export const STUB_REPORT_TEXT = '{ "reader": "{letter}" }'

/** The two clauses of the documents whose one block is poor: a run of one-character lines and filler make 30% noise. */
export const POOR_BLOCK_FILE = buildSyntheticStandard({
	blocks: [
		{ kind: 'heading', number: '1', title: 'Overview' },
		{ kind: 'raw', lines: [FIRST_CLAUSE_SENTENCE] },
		{ kind: 'blank' },
		{ kind: 'heading', number: '2', title: 'Parts' },
		{ kind: 'raw', lines: [SECOND_CLAUSE_SENTENCE] },
		{ kind: 'blank' },
		{ kind: 'oneCharacterRun', count: 25 },
		{ kind: 'filler', count: 45 },
	],
})
export const POOR_BLOCK_STANDARDS = { [DECLARED_FOLDER]: { 'tag.md': POOR_BLOCK_FILE } }

/**
 * A clause headed by the subject whose sentence never repeats the tag (the heading names it): a claim about its
 * child quotes the sentence only. Two quotes of it, the longer and a shorter one, for two readers.
 */
export const HEADED_SENTENCE =
	'The child AAA_1 shall be held once in the content model of its parent element.'
export const HEADED_QUOTE_LONG = HEADED_SENTENCE
export const HEADED_QUOTE_SHORT = 'The child AAA_1 shall be held once in the content model'
export const HEADED_CLAIM_TEXT = 'AAA_1 shall be held once'
export const HEADED_FILE = buildSyntheticStandard({
	blocks: [
		{ kind: 'heading', number: '1', title: 'AA_1' },
		{ kind: 'raw', lines: [HEADED_SENTENCE] },
	],
})
export const HEADED_STANDARDS = { [DECLARED_FOLDER]: { 'tag.md': HEADED_FILE } }

/** What a lot question must carry for the person (I-5): the readers' answer is among it. */
export const HEADED_ANSWER_TEXT = 'AAA_1 is held once.'

/** The start time (ms) of another run of this process and a day before it: a pid reused by another process. */
export const A_DAY_MS = 24 * 60 * 60 * 1000

/** A claim held longer than the cap (10 minutes) by a live process, however short its stale limit. */
export const OVER_MAX_HELD_MS = 11 * 60 * 1000

/** How far from the process's real start a recorded start may be and still be the same process. */
export const START_TOLERANCE_MS = 5000

/** The label of a missing reader, and the refused word it is recorded with. */
export const MISSING_REFUSED = 'missing'

/** How long another process holds a claim before it releases it, and the wait limit a case gives the hook. */
export const HOLD_MS = 300
export const SHORT_WAIT_LIMIT_MS = 150

/** The program of the process that releases a claim: it removes the file named by its first argument after a while. */
export const RELEASE_CLAIM_PROGRAM =
	"setTimeout(function release() { try { require('node:fs').unlinkSync(process.argv[1]) } catch {} }, Number(process.argv[2]))"

/** The error a forced crash throws. */
export const FORCED_CRASH = 'forced crash after the fact'

/** The words the refusals of a claim held by a live process say, and the file the ask's own claim lives in. */
export const IN_PROGRESS_WORDS = /in progress/iu
export const ASK_CLAIM_FILE = 'ask.claim'

/** The marker file of an answer: the ask's own (a person's answer) and a round's (a verdict). */
export const ANSWERING_FILE = 'answering.json'

/** The refusal of a verdict missing a report file names this stub, per letter, and the text it holds. */
export const STUB_FILE_PATTERN = 'reader-{letter}.report.json'

/** The id of the lot question the first ask of a lot raises, and the station the hook cases name. */
export const FIRST_QUESTION = 'q1'
export const HOOK_STATION = 'ask'
