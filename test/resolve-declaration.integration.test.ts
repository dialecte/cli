import { resolveDeclaration } from '../src/lib/schema/resolve-declaration.ts'
import { loadMultiDeclaredDialecte } from './multi-declared-dialecte.ts'

import { beforeAll, describe, expect, it } from 'vitest'

import type { DeclarationResolution, LoadedDialecte } from '../src/lib/schema/schema.types.ts'

let dialecte: LoadedDialecte

beforeAll(async () => {
	dialecte = await loadMultiDeclaredDialecte()
})

type RuleCase = {
	description: string
	tagName: string
	parent: string | undefined
	expected: DeclarationResolution | undefined
}

const ONCE: DeclarationResolution = { declarations: 1, resolved: true, id: undefined }
const OPEN: DeclarationResolution = { declarations: 2, resolved: false, id: undefined }

const ruleCases: RuleCase[] = [
	{ description: 'declared once, no parent', tagName: 'DD_1', parent: undefined, expected: ONCE },
	{ description: 'declared once, under its parent', tagName: 'DD_1', parent: 'D', expected: ONCE },
	{ description: 'the root, declared once', tagName: 'Root', parent: undefined, expected: ONCE },
	{
		description: 'declared once, held by a parent',
		tagName: 'AAA_2',
		parent: 'AA_1',
		expected: ONCE,
	},
	{
		description: 'declared two ways, no parent → unresolved',
		tagName: 'AAA_1',
		parent: undefined,
		expected: OPEN,
	},
	{
		description: 'declared two ways, the parent holds one in one namespace → that one',
		tagName: 'AAA_1',
		parent: 'AA_1',
		expected: { declarations: 2, resolved: true, id: '1' },
	},
	{
		description: 'declared two ways, the parent holds the other in its namespace → that one',
		tagName: 'AAA_1',
		parent: 'AA_2',
		expected: { declarations: 2, resolved: true, id: '2' },
	},
	{
		description: 'declared two ways, the parent holds both in one namespace → unresolved',
		tagName: 'AAA_1',
		parent: 'AA_3',
		expected: OPEN,
	},
	{
		description: 'declared two ways, the parent holds it in two namespaces → unresolved',
		tagName: 'AAA_1',
		parent: 'AA_4',
		expected: OPEN,
	},
	{
		description: 'declared two ways, a parent that does not name it → unresolved',
		tagName: 'AAA_1',
		parent: 'DD_1',
		expected: OPEN,
	},
	{
		description: 'declared two ways, a wildcard parent that names no declaration → unresolved',
		tagName: 'AAA_1',
		parent: 'AA_5',
		expected: OPEN,
	},
	{ description: 'a tag the definition lacks', tagName: 'AA_9', parent: 'A', expected: undefined },
]

describe('resolveDeclaration (core test dialecte, AAA_1 declared two ways)', () => {
	for (const testCase of ruleCases)
		it(testCase.description, () => {
			expect(
				resolveDeclaration({
					definition: dialecte.config.definition,
					tagName: testCase.tagName,
					parent: testCase.parent,
				}),
			).toEqual(testCase.expected)
		})
})

describe('resolveDeclaration agrees with core resolveDefinition (the pin)', () => {
	for (const testCase of ruleCases.filter((candidate) => candidate.expected !== undefined))
		it(`${testCase.tagName} under ${testCase.parent ?? 'no parent'}: ${testCase.description}`, () => {
			const tagLevel = dialecte.config.definition[testCase.tagName]
			const applied = dialecte.readers.resolveDefinition({
				dialecteConfig: dialecte.config,
				record: {
					tagName: testCase.tagName,
					parent:
						testCase.parent === undefined
							? null
							: { id: `${testCase.parent}-1`, tagName: testCase.parent },
					attributes: [],
				},
			})
			// resolved to a declaration <=> core's attributes are that declaration's own object; else the tag level's
			const expectedId = testCase.expected?.id
			const expectedAttributes =
				expectedId === undefined
					? tagLevel.attributes
					: tagLevel.declarations?.[expectedId]?.attributes
			expect(applied?.attributes).toBe(expectedAttributes)
			expect(
				resolveDeclaration({
					definition: dialecte.config.definition,
					tagName: testCase.tagName,
					parent: testCase.parent,
				}),
			).toEqual(testCase.expected)
		})
})
