import { EXAMPLE_CODE } from '../../../../test/ask-fixtures.constants.ts'
import { subjectOf } from '../../../../test/ask-fixtures.ts'
import { kindOf } from './kind-of.ts'

import { describe, expect, it } from 'vitest'

import type { AskKind, AskSubject, KindAnswer, KindSlots } from './ask.types.ts'

type KindRow = {
	question: string
	subject: AskSubject
	kind: AskKind
	slots: KindSlots
}

const AA_1 = subjectOf({ tags: [{ tag: 'AA_1' }] })
const AAA_1_UNDER_AA_1 = subjectOf({ tags: [{ tag: 'AAA_1' }, { tag: 'AA_1' }] })
const B_A = subjectOf({ attributes: ['bA'] })
const DD_1 = subjectOf({ tags: [{ tag: 'DD_1' }] })

describe('kindOf: the shapes of the kind table (D4, case 5)', () => {
	const rows: Record<string, KindRow> = {
		'children of <T>': {
			question: 'children of AA_1',
			subject: AA_1,
			kind: 'children',
			slots: { tag: 'AA_1' },
		},
		'children of <T>?': {
			question: 'children of AA_1?',
			subject: AA_1,
			kind: 'children',
			slots: { tag: 'AA_1' },
		},
		'children of <T> under <P>': {
			question: 'children of AAA_1 under AA_1',
			subject: AAA_1_UNDER_AA_1,
			kind: 'children',
			slots: { tag: 'AAA_1', parent: 'AA_1' },
		},
		'children of <T> in <P>': {
			question: 'children of AAA_1 in AA_1',
			subject: AAA_1_UNDER_AA_1,
			kind: 'children',
			slots: { tag: 'AAA_1', parent: 'AA_1' },
		},
		'what may <T> hold': {
			question: 'what may AA_1 hold',
			subject: AA_1,
			kind: 'children',
			slots: { tag: 'AA_1' },
		},
		'what can <T> hold?': {
			question: 'what can AA_1 hold?',
			subject: AA_1,
			kind: 'children',
			slots: { tag: 'AA_1' },
		},
		'which children may <T> hold': {
			question: 'which children may AA_1 hold',
			subject: AA_1,
			kind: 'children',
			slots: { tag: 'AA_1' },
		},
		'which children can <T> hold?': {
			question: 'which children can AA_1 hold?',
			subject: AA_1,
			kind: 'children',
			slots: { tag: 'AA_1' },
		},
		'the fixed words in any case': {
			question: 'Children Of AA_1',
			subject: AA_1,
			kind: 'children',
			slots: { tag: 'AA_1' },
		},
		'parents of <T>': {
			question: 'parents of AA_1',
			subject: AA_1,
			kind: 'parents',
			slots: { tag: 'AA_1' },
		},
		'where may <T> appear': {
			question: 'where may AA_1 appear',
			subject: AA_1,
			kind: 'parents',
			slots: { tag: 'AA_1' },
		},
		'where can <T> appear?': {
			question: 'where can AA_1 appear?',
			subject: AA_1,
			kind: 'parents',
			slots: { tag: 'AA_1' },
		},
		'which elements may hold <T>': {
			question: 'which elements may hold AA_1',
			subject: AA_1,
			kind: 'parents',
			slots: { tag: 'AA_1' },
		},
		'which elements can hold <T>': {
			question: 'which elements can hold AA_1',
			subject: AA_1,
			kind: 'parents',
			slots: { tag: 'AA_1' },
		},
		'trailing spaces after the shape': {
			question: 'children of AA_1  ',
			subject: AA_1,
			kind: 'children',
			slots: { tag: 'AA_1' },
		},
		'values of <T>@<a>': {
			question: 'values of A@bA',
			subject: subjectOf({ tags: [{ tag: 'A' }], attributes: ['bA'] }),
			kind: 'values',
			slots: { tag: 'A', attribute: 'bA' },
		},
		'required attributes of <T>': {
			question: 'required attributes of AA_1',
			subject: AA_1,
			kind: 'required',
			slots: { tag: 'AA_1' },
		},
		'is <A> required': {
			question: 'is aAA_1 required',
			subject: subjectOf({ attributes: ['aAA_1'] }),
			kind: 'required',
			slots: { attribute: 'aAA_1' },
		},
		'is <A> required?': {
			question: 'is aAA_1 required?',
			subject: subjectOf({ attributes: ['aAA_1'] }),
			kind: 'required',
			slots: { attribute: 'aAA_1' },
		},
		'is <A> required on <T>': {
			question: 'is aAA_1 required on AA_1',
			subject: subjectOf({ tags: [{ tag: 'AA_1' }], attributes: ['aAA_1'] }),
			kind: 'required',
			slots: { tag: 'AA_1', attribute: 'aAA_1' },
		},
		'values of <A>': {
			question: 'values of bA',
			subject: B_A,
			kind: 'values',
			slots: { attribute: 'bA' },
		},
		'values of <A> on <T>': {
			question: 'values of bA on A',
			subject: subjectOf({ tags: [{ tag: 'A' }], attributes: ['bA'] }),
			kind: 'values',
			slots: { tag: 'A', attribute: 'bA' },
		},
		'what values may <A> take': {
			question: 'what values may bA take',
			subject: B_A,
			kind: 'values',
			slots: { attribute: 'bA' },
		},
		'what values can <A> take?': {
			question: 'what values can bA take?',
			subject: B_A,
			kind: 'values',
			slots: { attribute: 'bA' },
		},
		'default of <A>': {
			question: 'default of bA',
			subject: B_A,
			kind: 'default',
			slots: { attribute: 'bA' },
		},
		'what is the default of <A>': {
			question: 'what is the default of bA',
			subject: B_A,
			kind: 'default',
			slots: { attribute: 'bA' },
		},
		'fixed value of <A>': {
			question: 'fixed value of bA',
			subject: B_A,
			kind: 'fixed',
			slots: { attribute: 'bA' },
		},
		'type of <T>': {
			question: 'type of DD_1',
			subject: DD_1,
			kind: 'type',
			slots: { tag: 'DD_1' },
		},
		'type of <A>': {
			question: 'type of bA',
			subject: B_A,
			kind: 'type',
			slots: { attribute: 'bA' },
		},
		'variants of <T>': {
			question: 'variants of DD_1',
			subject: DD_1,
			kind: 'variants',
			slots: { tag: 'DD_1' },
		},
		'xsi:type variants of <T>': {
			question: 'xsi:type variants of DD_1',
			subject: DD_1,
			kind: 'variants',
			slots: { tag: 'DD_1' },
		},
		'documentation of <T>': {
			question: 'documentation of AAA_1',
			subject: subjectOf({ tags: [{ tag: 'AAA_1' }] }),
			kind: 'documentation',
			slots: { tag: 'AAA_1' },
		},
		'<C> alone': {
			question: EXAMPLE_CODE,
			subject: subjectOf({ codes: [EXAMPLE_CODE] }),
			kind: 'code',
			slots: { code: EXAMPLE_CODE },
		},
		'what does <C> mean': {
			question: `what does ${EXAMPLE_CODE} mean`,
			subject: subjectOf({ codes: [EXAMPLE_CODE] }),
			kind: 'code',
			slots: { code: EXAMPLE_CODE },
		},
		'explain <C>': {
			question: `explain ${EXAMPLE_CODE}`,
			subject: subjectOf({ codes: [EXAMPLE_CODE] }),
			kind: 'code',
			slots: { code: EXAMPLE_CODE },
		},
		'which method <rest>': {
			question: 'which method creates an element',
			subject: subjectOf({}),
			kind: 'method',
			slots: { rest: 'creates an element' },
		},
		'which function <rest>': {
			question: 'which function adds a child?',
			subject: subjectOf({}),
			kind: 'method',
			slots: { rest: 'adds a child' },
		},
	}
	it.each(Object.entries(rows))('%s', (_name, row) => {
		expect(kindOf({ question: row.question, subject: row.subject })).toEqual({
			kind: row.kind,
			slots: row.slots,
		})
	})
})

describe('kindOf: a question that is not a whole shape is semantic (15)', () => {
	const rows: Record<string, { question: string; subject: AskSubject }> = {
		'starts like a shape and goes on': { question: 'children of AA_1 and why', subject: AA_1 },
		'a shape with no subject in its slot': {
			question: 'children of the thing',
			subject: subjectOf({}),
		},
		'a tag where the shape wants an attribute': { question: 'default of AA_1', subject: AA_1 },
		'no shape at all': { question: 'why is AA_1 here', subject: AA_1 },
		'a code inside a longer question': {
			question: `why does ${EXAMPLE_CODE} fire on save`,
			subject: subjectOf({ codes: [EXAMPLE_CODE] }),
		},
	}
	it.each(Object.entries(rows))('%s', (_name, { question, subject }) => {
		expect(kindOf({ question, subject })).toEqual({ kind: 'semantic', slots: {} })
	})
})

describe('kindOf: --kind forces the kind, its slots from the subject', () => {
	const rows: Record<string, { subject: AskSubject; kind: AskKind; expected: KindAnswer }> = {
		'children with a tag': {
			subject: AA_1,
			kind: 'children',
			expected: { kind: 'children', slots: { tag: 'AA_1' } },
		},
		'children with a tag and its parent': {
			subject: subjectOf({ tags: [{ tag: 'AAA_1', parent: 'AA_1' }] }),
			kind: 'children',
			expected: { kind: 'children', slots: { tag: 'AAA_1', parent: 'AA_1' } },
		},
		'values with an attribute': {
			subject: B_A,
			kind: 'values',
			expected: { kind: 'values', slots: { attribute: 'bA' } },
		},
		'code with a code': {
			subject: subjectOf({ codes: [EXAMPLE_CODE] }),
			kind: 'code',
			expected: { kind: 'code', slots: { code: EXAMPLE_CODE } },
		},
		'semantic needs no slot': {
			subject: subjectOf({}),
			kind: 'semantic',
			expected: { kind: 'semantic', slots: {} },
		},
		'children without a tag': {
			subject: subjectOf({}),
			kind: 'children',
			expected: { refused: expect.stringMatching(/(?=.*tag)(?=.*--about)/s) },
		},
		'default without an attribute': {
			subject: AA_1,
			kind: 'default',
			expected: { refused: expect.stringMatching(/(?=.*attribute)(?=.*--about)/s) },
		},
		'code without a code': {
			subject: AA_1,
			kind: 'code',
			expected: { refused: expect.stringMatching(/(?=.*code)(?=.*--code)/s) },
		},
	}
	it.each(Object.entries(rows))('%s', (_name, { subject, kind, expected }) => {
		expect(kindOf({ question: 'anything at all', subject, kind })).toEqual(expected)
	})
})
