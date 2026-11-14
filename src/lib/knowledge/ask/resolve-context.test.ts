import { subjectOf } from '../../../../test/ask-fixtures.ts'
import { loadMultiDeclaredDialecte } from '../../../../test/multi-declared-dialecte.ts'
import { resolveContext } from './resolve-context.ts'

import { beforeAll, describe, expect, it } from 'vitest'

import type { LoadedDialecte } from '../../schema/schema.types.ts'
import type { AskSubject, KindSlots } from './ask.types.ts'

const PACKAGE = '@dialecte/core-test'
const OTHER_PACKAGE = '@dialecte/other-test'

let multi: LoadedDialecte
let other: LoadedDialecte

beforeAll(async () => {
	multi = await loadMultiDeclaredDialecte()
	other = { ...multi, packageName: OTHER_PACKAGE }
})

type ContextRow = {
	subject: AskSubject
	slots: KindSlots
	decision?: boolean
	expected: {
		resolved: boolean
		decision: boolean
		tags: { tag: string; parent: string | null; declarations: number; resolved: boolean }[]
	}
}

describe('resolveContext: the parent decides the declaration (D5, cases 6-8, 13, 16e)', () => {
	const rows: Record<string, ContextRow> = {
		'6 --about AA_1/AAA_1: resolved, two declarations': {
			subject: subjectOf({ tags: [{ tag: 'AAA_1', parent: 'AA_1' }] }),
			slots: { tag: 'AAA_1' },
			expected: {
				resolved: true,
				decision: false,
				tags: [{ tag: 'AAA_1', parent: 'AA_1', declarations: 2, resolved: true }],
			},
		},
		'6 a parent named in the question that the definition admits': {
			subject: subjectOf({ tags: [{ tag: 'AAA_1' }, { tag: 'AA_1' }] }),
			slots: { tag: 'AAA_1', parent: 'AA_1' },
			expected: {
				resolved: true,
				decision: false,
				tags: [{ tag: 'AAA_1', parent: 'AA_1', declarations: 2, resolved: true }],
			},
		},
		'a tag whose parent is named in the question, no slot parent: resolved under it (D5)': {
			subject: subjectOf({ tags: [{ tag: 'AAA_1' }, { tag: 'AA_1' }] }),
			slots: { tag: 'AAA_1' },
			expected: {
				resolved: true,
				decision: false,
				tags: [{ tag: 'AAA_1', parent: 'AA_1', declarations: 2, resolved: true }],
			},
		},
		'a tag declared once needs no parent': {
			subject: subjectOf({ tags: [{ tag: 'AA_1' }] }),
			slots: { tag: 'AA_1' },
			expected: {
				resolved: true,
				decision: false,
				tags: [{ tag: 'AA_1', parent: null, declarations: 1, resolved: true }],
			},
		},
		'13 AAA_1 without a parent: unresolved, a decision': {
			subject: subjectOf({ tags: [{ tag: 'AAA_1' }] }),
			slots: { tag: 'AAA_1' },
			expected: {
				resolved: false,
				decision: true,
				tags: [{ tag: 'AAA_1', parent: null, declarations: 2, resolved: false }],
			},
		},
		'two parents of the tag named in the question: unresolved': {
			subject: subjectOf({ tags: [{ tag: 'AAA_1' }, { tag: 'AA_1' }, { tag: 'AA_2' }] }),
			slots: { tag: 'AAA_1' },
			expected: {
				resolved: false,
				decision: true,
				tags: [{ tag: 'AAA_1', parent: null, declarations: 2, resolved: false }],
			},
		},
		'16e parent AA_3 holds both declarations in one namespace: unresolved, a decision': {
			subject: subjectOf({ tags: [{ tag: 'AAA_1', parent: 'AA_3' }] }),
			slots: { tag: 'AAA_1' },
			expected: {
				resolved: false,
				decision: true,
				tags: [{ tag: 'AAA_1', parent: 'AA_3', declarations: 2, resolved: false }],
			},
		},
		'16e parent AA_4 holds both in two namespaces: unresolved, a decision': {
			subject: subjectOf({ tags: [{ tag: 'AAA_1', parent: 'AA_4' }] }),
			slots: { tag: 'AAA_1' },
			expected: {
				resolved: false,
				decision: true,
				tags: [{ tag: 'AAA_1', parent: 'AA_4', declarations: 2, resolved: false }],
			},
		},
		'16e a wildcard parent names no declaration: unresolved, a decision': {
			subject: subjectOf({ tags: [{ tag: 'AAA_1', parent: 'AA_5' }] }),
			slots: { tag: 'AAA_1' },
			expected: {
				resolved: false,
				decision: true,
				tags: [{ tag: 'AAA_1', parent: 'AA_5', declarations: 2, resolved: false }],
			},
		},
		'8 --decision on a resolved question: a decision, still resolved': {
			subject: subjectOf({ tags: [{ tag: 'AAA_1', parent: 'AA_1' }] }),
			slots: { tag: 'AAA_1' },
			decision: true,
			expected: {
				resolved: true,
				decision: true,
				tags: [{ tag: 'AAA_1', parent: 'AA_1', declarations: 2, resolved: true }],
			},
		},
	}
	it.each(Object.entries(rows))('%s', (_name, row) => {
		expect(
			resolveContext({
				subject: row.subject,
				slots: row.slots,
				dialectes: [multi],
				decision: row.decision,
			}),
		).toEqual({
			context: {
				package: PACKAGE,
				resolved: row.expected.resolved,
				decision: row.expected.decision,
				tags: row.expected.tags.map((entry) => expect.objectContaining(entry)),
			},
			dialecte: multi,
		})
	})
})

describe('resolveContext: two dialectes holding the tag (14)', () => {
	const subject = subjectOf({ tags: [{ tag: 'AA_1' }] })

	it('the folder is one of them: that one', () => {
		expect(
			resolveContext({
				subject,
				slots: { tag: 'AA_1' },
				dialectes: [multi, other],
				ownPackage: OTHER_PACKAGE,
			}),
		).toMatchObject({ context: { package: OTHER_PACKAGE }, dialecte: other })
	})

	it('--package names one: that one', () => {
		expect(
			resolveContext({
				subject,
				slots: { tag: 'AA_1' },
				dialectes: [multi, other],
				packageName: PACKAGE,
				ownPackage: OTHER_PACKAGE,
			}),
		).toMatchObject({ context: { package: PACKAGE }, dialecte: multi })
	})

	it('neither: refused, naming both and --package', () => {
		expect(resolveContext({ subject, slots: { tag: 'AA_1' }, dialectes: [multi, other] })).toEqual({
			refused: expect.stringMatching(
				new RegExp(`(?=.*${PACKAGE})(?=.*${OTHER_PACKAGE})(?=.*--package)`, 's'),
			),
		})
	})

	it('the folder is a dialecte that does not hold the tag: refused', () => {
		expect(
			resolveContext({
				subject,
				slots: { tag: 'AA_1' },
				dialectes: [multi, other],
				ownPackage: '@dialecte/elsewhere',
			}),
		).toEqual({ refused: expect.stringContaining('--package') })
	})
})

describe('resolveContext: an unknown tag (14)', () => {
	it('is refused with the closest names', () => {
		expect(
			resolveContext({
				subject: subjectOf({ tags: [{ tag: 'AA_9' }] }),
				slots: { tag: 'AA_9' },
				dialectes: [multi],
			}),
		).toEqual({ refused: expect.stringMatching(/AA_9.*AA_1|AA_1.*AA_9/s) })
	})
})

describe('resolveContext: a parent or attribute the dialecte refuses (D5b)', () => {
	const rows: Record<string, { subject: AskSubject; slots: KindSlots; pattern: RegExp }> = {
		'an unknown --about attribute: the closest names': {
			subject: subjectOf({ tags: [{ tag: 'AA_1' }], attributes: ['aAA_9'] }),
			slots: { tag: 'AA_1', attribute: 'aAA_9' },
			pattern: /aAA_9.*aAA_1|aAA_1.*aAA_9/s,
		},
		'a subject parent the tag does not admit: its parents named': {
			subject: subjectOf({ tags: [{ tag: 'AAA_1', parent: 'D' }] }),
			slots: { tag: 'AAA_1' },
			pattern: /(?=.*AA_1)(?=.*AA_2)(?=.*AA_3)(?=.*\bD\b)/s,
		},
		'a slot parent the tag does not admit: its parents named': {
			subject: subjectOf({ tags: [{ tag: 'AAA_1' }] }),
			slots: { tag: 'AAA_1', parent: 'D' },
			pattern: /(?=.*AA_1)(?=.*AA_2)(?=.*AA_3)(?=.*\bD\b)/s,
		},
	}
	it.each(Object.entries(rows))('%s', (_name, { subject, slots, pattern }) => {
		expect(resolveContext({ subject, slots, dialectes: [multi] })).toEqual({
			refused: expect.stringMatching(pattern),
		})
	})
})
