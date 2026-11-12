import { factKeyOf } from './fact-key.ts'

import { describe, expect, it } from 'vitest'

import type { FactKeyParts, FactSubject } from './facts.types.ts'

const SUBJECT: FactSubject = {
	package: 'core-test',
	tags: [
		{ tag: 'D', parent: 'A' },
		{ tag: 'DD_1', parent: 'D' },
	],
	attributes: ['a', 'b'],
	codes: ['c1', 'c2'],
	methods: ['m1', 'm2'],
}

const BASE: FactKeyParts = {
	question: 'Is the attribute a required on D?',
	subject: SUBJECT,
	kind: 'cardinality',
	package: 'core-test',
}

describe('factKeyOf: the shape', () => {
	it('→ 64 lowercase hex characters', () => {
		expect(factKeyOf(BASE)).toMatch(/^[0-9a-f]{64}$/)
	})
})

describe('factKeyOf: the same key', () => {
	it.each<{ name: string; other: FactKeyParts; reference?: FactKeyParts }>([
		{
			name: 'a question in another case',
			other: { ...BASE, question: 'IS THE ATTRIBUTE A REQUIRED ON D?' },
		},
		{
			name: 'a question with other spacing',
			other: { ...BASE, question: '  Is  the attribute\n a   required on D? ' },
		},
		{
			name: 'tags in another order',
			other: { ...BASE, subject: { ...SUBJECT, tags: [...SUBJECT.tags].reverse() } },
		},
		{
			name: 'a duplicated tag',
			other: { ...BASE, subject: { ...SUBJECT, tags: [...SUBJECT.tags, SUBJECT.tags[0]] } },
		},
		{
			name: 'the same tag under two parents, in reverse order',
			other: {
				...BASE,
				subject: {
					...SUBJECT,
					tags: [{ tag: 'D', parent: 'AA_1' }, { tag: 'D', parent: 'A' }, SUBJECT.tags[1]],
				},
			},
			reference: {
				...BASE,
				subject: {
					...SUBJECT,
					tags: [SUBJECT.tags[1], { tag: 'D', parent: 'A' }, { tag: 'D', parent: 'AA_1' }],
				},
			},
		},
		{
			name: 'attributes, codes and methods in another order, one duplicated',
			other: {
				...BASE,
				subject: {
					...SUBJECT,
					attributes: ['b', 'a', 'a'],
					codes: ['c2', 'c1'],
					methods: ['m2', 'm1', 'm1'],
				},
			},
		},
	])('$name → the same key', ({ other, reference }) => {
		expect(factKeyOf(other)).toBe(factKeyOf(reference ?? BASE))
	})

	it('a ligature in the question → the same key as its plain letters', () => {
		expect(factKeyOf({ ...BASE, question: 'Is the \uFB01eld a required?' })).toBe(
			factKeyOf({ ...BASE, question: 'Is the field a required?' }),
		)
	})

	it('a fullwidth digit in the question → the same key as its plain form', () => {
		expect(factKeyOf({ ...BASE, question: 'Is attribute \uFF11 required?' })).toBe(
			factKeyOf({ ...BASE, question: 'Is attribute 1 required?' }),
		)
	})
})

describe('factKeyOf: another key', () => {
	it.each<{ name: string; other: FactKeyParts }>([
		{ name: 'another kind', other: { ...BASE, kind: 'values' } },
		{ name: 'another package', other: { ...BASE, package: 'other-package' } },
		{ name: 'no package', other: { ...BASE, package: null } },
		{
			name: 'another tag',
			other: {
				...BASE,
				subject: { ...SUBJECT, tags: [{ tag: 'DD_2', parent: 'D' }, SUBJECT.tags[0]] },
			},
		},
		{
			name: 'a tag under another parent',
			other: {
				...BASE,
				subject: { ...SUBJECT, tags: [{ tag: 'D', parent: 'AA_1' }, SUBJECT.tags[1]] },
			},
		},
		{
			name: 'a tag under no parent',
			other: {
				...BASE,
				subject: { ...SUBJECT, tags: [{ tag: 'D', parent: null }, SUBJECT.tags[1]] },
			},
		},
		{
			name: 'another attribute',
			other: { ...BASE, subject: { ...SUBJECT, attributes: ['a', 'c'] } },
		},
		{ name: 'another code', other: { ...BASE, subject: { ...SUBJECT, codes: ['c1', 'c3'] } } },
		{ name: 'another method', other: { ...BASE, subject: { ...SUBJECT, methods: ['m1', 'm3'] } } },
		{ name: 'another question', other: { ...BASE, question: 'Is the attribute b required on D?' } },
	])('$name → a different key', ({ other }) => {
		expect(factKeyOf(other)).not.toBe(factKeyOf(BASE))
	})
})
