import type { AskJson } from '../src/commands/ask.types.ts'
/** Constants of the whole ask records the state and note tests write: an ask.json, the outcomes, the times. */
import type { RoundOutcome } from '../src/lib/knowledge/ask/ask.types.ts'

/** The time stamp every record of the fixtures carries. */
export const RECORD_AT = '2026-11-14T10:00:00.000Z'

/** The file the ranges of a hand-written pack name. */
export const RECORD_FILE = 'example-0000/tag'

/** The question, the facts and the person of the records. */
export const RECORD_QUESTION = 'Explain the intent of AA_1'
export const RECORD_PERSON = 'person-a'

/** A whole `ask.json` of an ask that needs readers on the documents; a case replaces what it pins. */
export const BASE_ASK_JSON: AskJson = {
	schema: 1,
	ask: 'A-0001',
	question: RECORD_QUESTION,
	subject: {
		package: null,
		tags: [{ tag: 'AA_1', parent: null }],
		attributes: [],
		codes: [],
		methods: [],
	},
	kind: 'semantic',
	decision: false,
	rung: 3,
	state: 'needs-readers',
	answer: null,
	fact: null,
	source: 'documents',
	boundary: null,
	conflict: null,
	candidates: [],
	methods: [],
	angles: [],
	slices: [],
	effort: { level: 'medium' },
	next: 'dialecte ask pack A-0001',
	standard: {
		configured: true,
		documents: true,
		name: 'Example 0000',
		key: 'example0000',
		folders: ['example-0000'],
		files: { 'example-0000': 'sha256:aa' },
	},
}

/** The outcome a verdict of each state carries. */
export const OUTCOME_OF_STATE: Record<
	'answered' | 'needs-readers' | 'needs-adjudicator' | 'needs-person',
	RoundOutcome
> = {
	answered: {
		state: 'answered',
		agreed: {
			verdict: 'yes',
			value: null,
			answer: 'AA_1 holds AAA_1.',
			cites: [],
			letters: ['A', 'B'],
		},
	},
	'needs-readers': { state: 'next-round', reason: 'disagreement' },
	'needs-adjudicator': { state: 'needs-adjudicator', reason: 'no-agreement' },
	'needs-person': { state: 'needs-person', reason: 'the readers did not agree: a person answers' },
}
