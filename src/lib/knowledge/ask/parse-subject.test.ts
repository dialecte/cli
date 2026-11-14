import { EXAMPLE_CODE, EXAMPLE_METHOD } from '../../../../test/ask-fixtures.constants.ts'
import { subjectOf, vocabularyOf } from '../../../../test/ask-fixtures.ts'
import { loadMultiDeclaredDialecte } from '../../../../test/multi-declared-dialecte.ts'
import { parseSubject } from './parse-subject.ts'

import { beforeAll, describe, expect, it } from 'vitest'

import type { AskSubject, AskVocabulary, ParseSubjectParams } from './ask.types.ts'

let vocabulary: AskVocabulary

beforeAll(async () => {
	const dialecte = await loadMultiDeclaredDialecte()
	vocabulary = vocabularyOf({ dialecte })
})

type ParseRow = {
	question: string
	about?: string
	code?: string
	method?: string
	/** The vocabulary of the case when it is not the dialecte's. */
	vocabulary?: AskVocabulary
	expected: AskSubject
}

const PLAIN_WORDS: AskVocabulary = {
	tags: ['A', 'D', 'DD', 'AA_1'],
	attributes: ['a', 'name'],
	values: [],
	codes: [],
	methods: [],
}

function paramsOf(row: Omit<ParseRow, 'expected'>): ParseSubjectParams {
	return {
		question: row.question,
		vocabulary: row.vocabulary ?? vocabulary,
		about: row.about,
		code: row.code,
		method: row.method,
	}
}

describe('parseSubject: names found in the question (D3, cases 1-3)', () => {
	const rows: Record<string, ParseRow> = {
		'a non-prose tag is a tag subject, parent null': {
			question: 'what are the children of AA_1',
			expected: subjectOf({ tags: [{ tag: 'AA_1' }] }),
		},
		'two tags keep the order of the question': {
			question: 'children of AAA_1 under AA_1',
			expected: subjectOf({ tags: [{ tag: 'AAA_1' }, { tag: 'AA_1' }] }),
		},
		'an attribute spelled with @': {
			question: 'is @aAAA_1 required',
			expected: subjectOf({ attributes: ['aAAA_1'] }),
		},
		'an attribute spelled with =': {
			question: 'when aAAA_1= is empty',
			expected: subjectOf({ attributes: ['aAAA_1'] }),
		},
		'a bare non-prose attribute name': {
			question: 'is aAAA_1 required',
			expected: subjectOf({ attributes: ['aAAA_1'] }),
		},
		'Tag@attribute is a tag and an attribute': {
			question: 'is AAA_1@aAAA_1 required',
			expected: subjectOf({ tags: [{ tag: 'AAA_1' }], attributes: ['aAAA_1'] }),
		},
		'a catalogue code': {
			question: `what does ${EXAMPLE_CODE} mean`,
			expected: subjectOf({ codes: [EXAMPLE_CODE] }),
		},
		'a method name': {
			question: `how does ${EXAMPLE_METHOD} behave`,
			expected: subjectOf({ methods: [EXAMPLE_METHOD] }),
		},
		'no name of the vocabulary': {
			question: 'how do I start',
			expected: subjectOf({}),
		},
	}
	it.each(Object.entries(rows))('%s', (_name, row) => {
		expect(parseSubject(paramsOf(row))).toEqual(row.expected)
	})
})

describe('parseSubject: ordinary words are not subjects (13b)', () => {
	const rows: Record<string, ParseRow> = {
		'a and name used as words, no --about': {
			question: 'what is the name of a thing',
			vocabulary: PLAIN_WORDS,
			expected: subjectOf({}),
		},
		'the same question with --about @name': {
			question: 'what is the name of a thing',
			about: '@name',
			vocabulary: PLAIN_WORDS,
			expected: subjectOf({ attributes: ['name'] }),
		},
		'name= is an attribute subject': {
			question: 'when name= is empty',
			vocabulary: PLAIN_WORDS,
			expected: subjectOf({ attributes: ['name'] }),
		},
		'@name is an attribute subject': {
			question: 'is @name required',
			vocabulary: PLAIN_WORDS,
			expected: subjectOf({ attributes: ['name'] }),
		},
		'DD@name is a tag and an attribute': {
			question: 'is DD@name required',
			vocabulary: PLAIN_WORDS,
			expected: subjectOf({ tags: [{ tag: 'DD' }], attributes: ['name'] }),
		},
		'a 1-letter capital tag is not a subject from the text': {
			question: 'what is D',
			vocabulary: PLAIN_WORDS,
			expected: subjectOf({}),
		},
		'a sentence-initial A is not the tag A': {
			question: 'A thing holds what',
			vocabulary: PLAIN_WORDS,
			expected: subjectOf({}),
		},
		'DD (two capitals) is a subject': {
			question: 'what is DD',
			vocabulary: PLAIN_WORDS,
			expected: subjectOf({ tags: [{ tag: 'DD' }] }),
		},
		'D and DD together: only DD': {
			question: 'what holds D and DD',
			vocabulary: PLAIN_WORDS,
			expected: subjectOf({ tags: [{ tag: 'DD' }] }),
		},
	}
	it.each(Object.entries(rows))('%s', (_name, row) => {
		expect(parseSubject(paramsOf(row))).toEqual(row.expected)
	})
})

describe('parseSubject: enumeration values (D3, case 3)', () => {
	const rows: Record<string, ParseRow> = {
		'attr=value': {
			question: 'what if bAAA_1=p',
			expected: subjectOf({ attributes: ['bAAA_1'], values: ['p'] }),
		},
		'attr="value"': {
			question: 'what if bAAA_1="q" is set',
			expected: subjectOf({ attributes: ['bAAA_1'], values: ['q'] }),
		},
		'within 3 words after its attribute': {
			question: 'bAAA_1 may be p',
			expected: subjectOf({ attributes: ['bAAA_1'], values: ['p'] }),
		},
		'beyond 3 words after its attribute: a word': {
			question: 'bAAA_1 and then something else is p',
			expected: subjectOf({ attributes: ['bAAA_1'] }),
		},
		'4 words after its attribute: a word': {
			question: 'bAAA_1 may then be p',
			expected: subjectOf({ attributes: ['bAAA_1'] }),
		},
		'a value before its attribute: a word': {
			question: 'p is the value of bAAA_1',
			expected: subjectOf({ attributes: ['bAAA_1'] }),
		},
		'attr=word that is not an enumeration value: not a value': {
			question: 'what if bAAA_1=zz',
			expected: subjectOf({ attributes: ['bAAA_1'] }),
		},
		'no attribute named: a word': {
			question: 'is p a letter',
			expected: subjectOf({}),
		},
	}
	it.each(Object.entries(rows))('%s', (_name, row) => {
		expect(parseSubject(paramsOf(row))).toEqual(row.expected)
	})
})

describe('parseSubject: a name both a tag and an attribute is a tag (D3)', () => {
	it('the tag only', () => {
		expect(
			parseSubject({
				question: 'what is AB_1',
				vocabulary: { tags: ['AB_1'], attributes: ['AB_1'], values: [], codes: [], methods: [] },
			}),
		).toEqual(subjectOf({ tags: [{ tag: 'AB_1' }] }))
	})
})

describe('parseSubject: --about @attr keeps the tags of the text', () => {
	it('replaces the attributes only', () => {
		expect(
			parseSubject({
				question: 'children of AA_1 and @aAAA_1',
				vocabulary,
				about: '@bA',
			}),
		).toEqual(subjectOf({ tags: [{ tag: 'AA_1' }], attributes: ['bA'] }))
	})
})

describe('parseSubject: --about, --code, --method replace the parse (case 4)', () => {
	const rows: Record<string, { row: Omit<ParseRow, 'expected'>; expected: Partial<AskSubject> }> = {
		'--about Parent/Tag gives the tag its parent': {
			row: { question: 'hello', about: 'AA_1/AAA_1' },
			expected: { tags: [{ tag: 'AAA_1', parent: 'AA_1' }] },
		},
		'--about replaces the tags of the text': {
			row: { question: 'children of DD_1', about: 'AA_1' },
			expected: { tags: [{ tag: 'AA_1', parent: null }] },
		},
		'--about Parent/Tag@attr gives tag and attribute': {
			row: { question: 'hello', about: 'AA_1/AAA_1@aAAA_1' },
			expected: { tags: [{ tag: 'AAA_1', parent: 'AA_1' }], attributes: ['aAAA_1'] },
		},
		'--about @attr replaces the attributes of the text': {
			row: { question: 'is @aAAA_1 required', about: '@bA' },
			expected: { attributes: ['bA'] },
		},
		'--code replaces the codes of the text, known or not': {
			row: { question: `what does ${EXAMPLE_CODE} mean`, code: 'EX0002' },
			expected: { codes: ['EX0002'] },
		},
		'--method replaces the methods of the text, known or not': {
			row: { question: `how does ${EXAMPLE_METHOD} behave`, method: 'x.y' },
			expected: { methods: ['x.y'] },
		},
		'an unknown --about tag is kept, not refused here': {
			row: { question: 'hello', about: 'ZZ_9' },
			expected: { tags: [{ tag: 'ZZ_9', parent: null }] },
		},
	}
	it.each(Object.entries(rows))('%s', (_name, { row, expected }) => {
		expect(parseSubject(paramsOf(row))).toMatchObject(expected)
	})
})
