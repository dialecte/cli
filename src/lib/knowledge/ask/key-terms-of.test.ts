import {
	REPORT_VOCABULARY,
	SUBJECT_ATTRIBUTE_B,
	SUBJECT_CODE_ONLY,
	SUBJECT_TAG_D,
} from '../../../../test/ask-report-fixtures.constants.ts'
import { keyTermsOf } from './key-terms-of.ts'

import { describe, expect, it } from 'vitest'

import type { AskSubjectTerms } from './ask.types.ts'

type TermsRow = { text: string; expected: string[]; subject?: AskSubjectTerms }

describe('keyTermsOf: vocabulary names, numbers, cardinalities, normative verbs and quoted words, in order, once', () => {
	const rows: Record<string, TermsRow> = {
		'tags of the vocabulary, case kept': {
			text: 'D holds DD_1 and AA_1 but not d',
			expected: ['D', 'DD_1', 'AA_1'],
		},
		'a tag inside a longer name is not a term (word-bounded)': {
			text: 'ADD_1 and DD_10 and DD_1x are other names',
			expected: [],
		},
		'an attribute named with @ or followed by =': {
			text: 'the attributes @b and c=on are present',
			expected: ['b', 'c'],
		},
		'an attribute inside quotes, and the quoted word': {
			text: 'the entry a="x" is present',
			expected: ['a', 'x'],
		},
		'the article a is an ordinary word, not the attribute a': {
			text: 'the claim holds a value for D',
			expected: ['D'],
		},
		'an attribute that is an ordinary word, written plain: no term': {
			text: 'the attributes b and c are present',
			expected: [],
		},
		'an enumeration value that is an ordinary word is a term only inside quotes': {
			text: 'D is "enabled", never disabled',
			expected: ['D', 'enabled'],
		},
		'cardinalities and numbers, a range of numbers kept whole': {
			text: 'D occurs 0..1 times, optional, 3 at most, mandatory, unbounded',
			expected: ['D', '0..1', 'optional', '3', 'mandatory', 'unbounded'],
		},
		'normative verbs': {
			text: 'D may hold DD_1 and it should, it shall',
			expected: ['D', 'may', 'DD_1', 'should', 'shall'],
		},
		'a quoted word': {
			text: 'the entry is "visible" here',
			expected: ['visible'],
		},
		'a quoted word that is also a vocabulary value counts once': {
			text: 'the value "enabled" is enabled',
			expected: ['enabled'],
		},
		'order of appearance, no repeat': {
			text: 'DD_1 shall hold D, DD_1 shall too',
			expected: ['DD_1', 'shall', 'D'],
		},
		'the ask subject tag D, written plain, is a key term whatever its length': {
			text: 'the element D is present',
			expected: ['D'],
		},
		'a single capital that is not the ask subject (A, sentence-initial) is no key term': {
			text: 'A holds DD_1',
			expected: ['DD_1'],
		},
		'a single capital that is not the ask subject is a key term as @A': {
			text: 'the entry @A is present',
			expected: ['A'],
		},
		'a single capital that is not the ask subject is a key term as A=': {
			text: 'the entry A=on is present',
			expected: ['A'],
		},
		'a single capital that is not the ask subject is a key term inside quotes': {
			text: 'the entry "A" is present',
			expected: ['A'],
		},
		'an ask subject attribute (b), written plain, is a key term': {
			text: 'the attribute b is present',
			subject: SUBJECT_ATTRIBUTE_B,
			expected: ['b'],
		},
		'without the subject tag D, the same plain D is no key term': {
			text: 'the element D is present',
			subject: SUBJECT_CODE_ONLY,
			expected: [],
		},
		'words of no kind: no term': {
			text: 'the thing is present in its place',
			expected: [],
		},
	}

	for (const [name, row] of Object.entries(rows))
		it(`${name}`, () => {
			expect(
				keyTermsOf({
					text: row.text,
					vocabulary: REPORT_VOCABULARY,
					subject: row.subject ?? SUBJECT_TAG_D,
				}),
			).toEqual(row.expected)
		})
})
