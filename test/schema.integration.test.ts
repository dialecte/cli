import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { readSchemaDialectes, runSchema } from '../src/commands/schema.ts'
import { answerSchema } from '../src/lib/schema/answer-schema.ts'
import { describeDeclarations } from '../src/lib/schema/describe-declarations.ts'
import { describeElement } from '../src/lib/schema/describe-element.ts'
import { GADGET_PACKAGE, WIDGET_PACKAGE } from './installed-test-dialecte.constants.ts'
import { installTestDialecte } from './installed-test-dialecte.ts'
import {
	FIRST_DECLARATION_DOCUMENTATION,
	FIRST_DECLARATION_TYPE_NAME,
	SECOND_DECLARATION_DOCUMENTATION,
	SECOND_DECLARATION_TYPE_NAME,
} from './multi-declared-dialecte.constants.ts'
import {
	installMultiDeclaredDialecte,
	loadMultiDeclaredDialecte,
} from './multi-declared-dialecte.ts'
import { loadCoreTestDialecte } from './real-core.ts'

import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type {
	DeclarationDescription,
	ElementDescription,
	LoadedDialecte,
} from '../src/lib/schema/schema.types.ts'

const DEFAULT_NAMESPACE = 'http://dialecte.dev/XML/DEFAULT'
const EXTENSION_NAMESPACE = 'http://dialecte.dev/XML/DEV-EXT'
const FIRST_DECLARATION_TYPE = `{${DEFAULT_NAMESPACE}}${FIRST_DECLARATION_TYPE_NAME}`
const SECOND_DECLARATION_TYPE = `{${EXTENSION_NAMESPACE}}${SECOND_DECLARATION_TYPE_NAME}`
const ALL_PARENTS = ['AA_1', 'AA_2', 'AA_3', 'AA_4', 'AA_5']
const FIRST_WAY_PARENTS = ['AA_1', 'AA_3', 'AA_4']
const SECOND_WAY_PARENTS = ['AA_2', 'AA_3', 'AA_4']

let dialecte: LoadedDialecte
let multiDeclared: LoadedDialecte

beforeAll(async () => {
	dialecte = await loadCoreTestDialecte()
	multiDeclared = await loadMultiDeclaredDialecte()
})

describe('describeElement (core test dialecte, core readers)', () => {
	it('AA_1 → parents A, required identity aAA_1, children with how often each may appear', () => {
		expect(describeElement({ dialecte, tagName: 'AA_1' })).toEqual({
			packageName: '@dialecte/core-test',
			tag: 'AA_1',
			namespace: DEFAULT_NAMESPACE,
			parents: ['A'],
			children: [
				{ tag: 'AAA_1', min: 1, max: 1 },
				{ tag: 'AAA_2', min: 0, max: 2 },
				{ tag: 'AAA_3', min: 0, max: 3 },
			],
			anyChild: false,
			attributes: [
				{
					name: 'aAA_1',
					required: true,
					identityField: true,
					default: undefined,
					fixed: undefined,
					namespace: undefined,
					type: 'normalizedString',
					enumeration: [],
					patterns: [],
				},
				{
					name: 'bAA_1',
					required: false,
					identityField: false,
					default: undefined,
					fixed: undefined,
					namespace: undefined,
					type: undefined,
					enumeration: [],
					patterns: [],
				},
				{
					name: 'ext:cAA_1',
					required: false,
					identityField: false,
					default: undefined,
					fixed: undefined,
					namespace: EXTENSION_NAMESPACE,
					type: undefined,
					enumeration: [],
					patterns: [],
				},
			],
			text: undefined,
			xsiTypes: [],
			type: undefined,
			documentation: undefined,
			declarations: 1,
			resolved: true,
			declaration: undefined,
		})
	})

	it('a tag the dialecte does not have → undefined', () => {
		expect(describeElement({ dialecte, tagName: 'AA_9' })).toBeUndefined()
	})
})

type ElementFactsCase = {
	description: string
	tagName: string
	parent?: string
	/** What is pinned of the description; undefined when there is none. */
	expected:
		| {
				type: string | undefined
				documentation: string | undefined
				declaration: string | undefined
				declarations: number
				resolved: boolean
				namespace: string
				attributeNames: string[]
				childTags: string[]
				parents: readonly string[]
		  }
		| undefined
}

const TAG_LEVEL_ATTRIBUTES = ['aAAA_1', 'bAAA_1', 'ext:cAAA_1']
const FIRST_WAY = {
	type: FIRST_DECLARATION_TYPE,
	documentation: FIRST_DECLARATION_DOCUMENTATION,
	declaration: '1',
	declarations: 2,
	resolved: true,
	namespace: DEFAULT_NAMESPACE,
	attributeNames: ['aAAA_1'],
	childTags: ['AAAA_1'],
	parents: FIRST_WAY_PARENTS,
}
const SECOND_WAY = {
	type: SECOND_DECLARATION_TYPE,
	documentation: SECOND_DECLARATION_DOCUMENTATION,
	declaration: '2',
	declarations: 2,
	resolved: true,
	namespace: EXTENSION_NAMESPACE,
	attributeNames: ['bAAA_1', 'ext:cAAA_1'],
	childTags: ['AAAA_2'],
	parents: SECOND_WAY_PARENTS,
}
const UNION = {
	type: undefined,
	documentation: undefined,
	declaration: undefined,
	declarations: 2,
	resolved: false,
	namespace: DEFAULT_NAMESPACE,
	attributeNames: TAG_LEVEL_ATTRIBUTES,
	childTags: ['AAAA_1', 'AAAA_2', 'AAAA_3'],
	parents: ALL_PARENTS,
}

const elementFactsCases: ElementFactsCase[] = [
	{
		description: 'DD_1 (declared once, a type) → resolved, its type, no parent given',
		tagName: 'DD_1',
		expected: {
			type: `{${DEFAULT_NAMESPACE}}tDD_1`,
			documentation: undefined,
			declaration: undefined,
			declarations: 1,
			resolved: true,
			namespace: DEFAULT_NAMESPACE,
			attributeNames: ['aDD_1', 'bDD_1', 'ext:cDD_1'],
			childTags: ['DDD_1'],
			parents: ['D'],
		},
	},
	{
		description: 'DD_1 under its parent → the same',
		tagName: 'DD_1',
		parent: 'D',
		expected: {
			type: `{${DEFAULT_NAMESPACE}}tDD_1`,
			documentation: undefined,
			declaration: undefined,
			declarations: 1,
			resolved: true,
			namespace: DEFAULT_NAMESPACE,
			attributeNames: ['aDD_1', 'bDD_1', 'ext:cDD_1'],
			childTags: ['DDD_1'],
			parents: ['D'],
		},
	},
	{
		description: 'Root → its documentation',
		tagName: 'Root',
		expected: {
			type: undefined,
			documentation: 'Root element for test fixture',
			declaration: undefined,
			declarations: 1,
			resolved: true,
			namespace: DEFAULT_NAMESPACE,
			attributeNames: ['ext:root', 'root'],
			childTags: ['A', 'B', 'C', 'D'],
			parents: [],
		},
	},
	{
		description: 'CCCC_1 → its documentation',
		tagName: 'CCCC_1',
		expected: {
			type: undefined,
			documentation: 'Leaf element in C branch',
			declaration: undefined,
			declarations: 1,
			resolved: true,
			namespace: DEFAULT_NAMESPACE,
			attributeNames: ['aCCCC_1', 'bCCCC_1', 'ext:cCCCC_1'],
			childTags: [],
			parents: ['CCC_1', 'CCC_2', 'CCC_3'],
		},
	},
	{
		description: 'AAA_1 declared two ways, no parent → unresolved, the tag level (the union)',
		tagName: 'AAA_1',
		expected: UNION,
	},
	{
		description: 'AAA_1 under AA_1 (holds the first way) → that declaration',
		tagName: 'AAA_1',
		parent: 'AA_1',
		expected: FIRST_WAY,
	},
	{
		description: 'AAA_1 under AA_2 (holds the second way, extension namespace) → that declaration',
		tagName: 'AAA_1',
		parent: 'AA_2',
		expected: SECOND_WAY,
	},
	{
		description: 'AAA_1 under AA_3 (holds both ways) → unresolved',
		tagName: 'AAA_1',
		parent: 'AA_3',
		expected: UNION,
	},
	{
		description: 'AAA_1 under AA_4 (holds it in two namespaces) → unresolved',
		tagName: 'AAA_1',
		parent: 'AA_4',
		expected: UNION,
	},
	{
		description: 'AAA_1 under AA_5 (a wildcard parent that names no declaration) → unresolved',
		tagName: 'AAA_1',
		parent: 'AA_5',
		expected: UNION,
	},
	{
		description: 'AAA_1 under DD_1 (not one of its parents) → no such element there',
		tagName: 'AAA_1',
		parent: 'DD_1',
		expected: undefined,
	},
	{
		description: 'a tag declared once under a tag that is not its parent → no such element there',
		tagName: 'DD_1',
		parent: 'A',
		expected: undefined,
	},
]

describe('describeElement with a parent (AAA_1 declared two ways)', () => {
	for (const testCase of elementFactsCases)
		it(testCase.description, () => {
			const described = describeElement({
				dialecte: multiDeclared,
				tagName: testCase.tagName,
				parent: testCase.parent,
			})
			expect(
				described === undefined
					? undefined
					: {
							type: described.type,
							documentation: described.documentation,
							declaration: described.declaration,
							declarations: described.declarations,
							resolved: described.resolved,
							namespace: described.namespace,
							attributeNames: described.attributes.map((attribute) => attribute.name),
							childTags: described.children.map((child) => child.tag),
							parents: described.parents,
						},
			).toEqual(testCase.expected)
		})
})

describe('describeDeclarations (AAA_1 declared two ways)', () => {
	it('lists each declaration with its key, the parents that hold it and whether it is global', () => {
		expect(
			describeDeclarations({ dialecte: multiDeclared, tagName: 'AAA_1' }).map((declaration) => ({
				id: declaration.id,
				parents: declaration.parents,
				global: declaration.global,
			})),
		).toEqual([
			{ id: '1', parents: ['AA_1', 'AA_3', 'AA_4'], global: false },
			{ id: '2', parents: ['AA_2', 'AA_3', 'AA_4'], global: true },
		])
	})

	it('describes each declaration as an element of that declaration, one of the 2 ways', () => {
		expect(
			describeDeclarations({ dialecte: multiDeclared, tagName: 'AAA_1' }).map(({ element }) => ({
				type: element.type,
				documentation: element.documentation,
				declaration: element.declaration,
				declarations: element.declarations,
				resolved: element.resolved,
				namespace: element.namespace,
				attributeNames: element.attributes.map((attribute) => attribute.name),
				childTags: element.children.map((child) => child.tag),
				parents: element.parents,
			})),
		).toEqual([FIRST_WAY, SECOND_WAY])
	})

	it('a tag declared once → no declaration listed', () => {
		expect(describeDeclarations({ dialecte: multiDeclared, tagName: 'DD_1' })).toEqual([])
	})

	it('a tag the dialecte does not have → no declaration listed', () => {
		expect(describeDeclarations({ dialecte: multiDeclared, tagName: 'AA_9' })).toEqual([])
	})
})

type TestCase = {
	description: string
	tagName: string
	expected: { output: string | RegExp; exitCode: number }
}

const testCases: TestCase[] = [
	{
		description:
			'A → children in order with how often, pattern, enumeration, a namespaced attribute by its prefixed name',
		tagName: 'A',
		expected: {
			output: [
				`A  @dialecte/core-test  {${DEFAULT_NAMESPACE}}`,
				'parents: Root',
				'children, in order:',
				'  AA_1  1..1',
				'  AA_2  0..2',
				'  AA_3  0..3',
				'attributes:',
				'  aA  required  string  pattern ^(?:(?:[A-Z]+))$',
				'  bA  optional  string  one of: x, y, z',
				'  ext:cA  optional',
				'text: none',
				'',
			].join('\n'),
			exitCode: 0,
		},
	},
	{
		description: 'C → the alternatives of an optional choice each 0..1',
		tagName: 'C',
		expected: {
			output: /\n {2}CC_1 {2}0\.\.1\n {2}CC_2 {2}0\.\.1\n {2}CC_3 {2}0\.\.3\n/,
			exitCode: 0,
		},
	},
	{
		description:
			'DD_1 → a child only its variants hold optional and unbounded, the variants listed',
		tagName: 'DD_1',
		expected: {
			output:
				/\n {2}DDD_1 {2}0\.\.\*\n[\s\S]*\nxsi:type: \{http:\/\/dialecte\.dev\/XML\/DEFAULT\}tDD_1A, /,
			exitCode: 0,
		},
	},
	{
		description: 'Root → defaults shown, no parent',
		tagName: 'Root',
		expected: {
			output: /\nparents: none \(the root\)\n[\s\S]*\n {2}root {2}optional {2}default "1"\n/,
			exitCode: 0,
		},
	},
	{
		description: 'unknown tag → closest tag names suggested, exit 1',
		tagName: 'AA_9',
		expected: {
			output:
				'no element "AA_9" in @dialecte/core-test - closest: AA_1, AA_2, AA_3, AAA_1, AAA_2\n',
			exitCode: 1,
		},
	},
]

describe('answerSchema (core test dialecte, core readers)', () => {
	for (const testCase of testCases)
		it(testCase.description, () => {
			const result = answerSchema({
				loaded: { dialectes: [dialecte], skipped: [] },
				tagName: testCase.tagName,
				json: false,
			})
			if (typeof testCase.expected.output === 'string')
				expect(result.output).toBe(testCase.expected.output)
			else expect(result.output).toMatch(testCase.expected.output)
			expect(result.exitCode).toBe(testCase.expected.exitCode)
		})

	it('no dialecte installed, one skipped → says so with the reason, exit 1', () => {
		expect(
			answerSchema({
				loaded: {
					dialectes: [],
					skipped: [{ packageName: '@acme/widget', reason: 'no entry file' }],
				},
				tagName: 'A',
				json: false,
			}),
		).toEqual({
			output: 'no installed dialecte holds "A" (skipped @acme/widget: no entry file)\n',
			exitCode: 1,
		})
	})

	it('--json → the description as JSON', () => {
		const result = answerSchema({
			loaded: { dialectes: [dialecte], skipped: [] },
			tagName: 'A',
			json: true,
		})
		expect(JSON.parse(result.output).elements[0]).toMatchObject({ tag: 'A', parents: ['Root'] })
	})
})

function headerOf(params: { tag: string; namespace: string; packageName?: string }): string {
	return `${params.tag}  ${params.packageName ?? '@dialecte/core-test'}  {${params.namespace}}`
}

const FIRST_WAY_BLOCK = [
	headerOf({ tag: 'AAA_1', namespace: DEFAULT_NAMESPACE }),
	`documentation: ${FIRST_DECLARATION_DOCUMENTATION}`,
	`type: ${FIRST_DECLARATION_TYPE}`,
	`parents: ${FIRST_WAY_PARENTS.join(', ')}`,
	'',
].join('\n')
const SECOND_WAY_BLOCK = [
	headerOf({ tag: 'AAA_1', namespace: EXTENSION_NAMESPACE }),
	`documentation: ${SECOND_DECLARATION_DOCUMENTATION}`,
	`type: ${SECOND_DECLARATION_TYPE}`,
	`parents: ${SECOND_WAY_PARENTS.join(', ')}`,
	'',
].join('\n')

type DeclaredWaysCase = {
	description: string
	tagName: string
	under?: string
	expected: {
		/** The answer begins with this text. */
		startsWith?: string
		contains?: string[]
		absent?: string[]
		exitCode: number
	}
}

const declaredWaysCases: DeclaredWaysCase[] = [
	{
		description:
			'AAA_1 without --under → a header naming the count and how to pick, then each declaration with its parents',
		tagName: 'AAA_1',
		expected: {
			startsWith: [
				'AAA_1 is declared 2 ways - pick one with --under <Parent>',
				'declaration 1',
				FIRST_WAY_BLOCK,
			].join('\n'),
			contains: [`\ndeclaration 2  global\n${SECOND_WAY_BLOCK}`],
			exitCode: 0,
		},
	},
	{
		description: '--under AA_1 → only the declaration it holds, said to be one of 2 ways',
		tagName: 'AAA_1',
		under: 'AA_1',
		expected: {
			startsWith: `AAA_1 under AA_1: declaration 1, one of 2 ways\n${FIRST_WAY_BLOCK}`,
			contains: ['\n  aAAA_1  required\n'],
			absent: ['declaration 2', 'bAAA_1', 'pick one with --under'],
			exitCode: 0,
		},
	},
	{
		description: '--under AA_2 → the other declaration, in the extension namespace',
		tagName: 'AAA_1',
		under: 'AA_2',
		expected: {
			startsWith: `AAA_1 under AA_2: declaration 2, one of 2 ways\n${SECOND_WAY_BLOCK}`,
			absent: ['declaration 1', 'aAAA_1'],
			exitCode: 0,
		},
	},
	{
		description: '--under AA_3 (holds every way) → each declaration, the parent does not decide',
		tagName: 'AAA_1',
		under: 'AA_3',
		expected: {
			startsWith: 'AAA_1 under AA_3: declarations 1 and 2 of 2, the parent does not decide\n',
			contains: [
				`\ndeclaration 1\n${FIRST_WAY_BLOCK}`,
				`\ndeclaration 2  global\n${SECOND_WAY_BLOCK}`,
			],
			exitCode: 0,
		},
	},
	{
		description:
			'--under AA_5 (a wildcard parent, names no declaration) → every declaration, the parent does not decide',
		tagName: 'AAA_1',
		under: 'AA_5',
		expected: {
			startsWith: 'AAA_1 under AA_5: declarations 1 and 2 of 2, the parent does not decide\n',
			contains: [
				`\ndeclaration 1\n${FIRST_WAY_BLOCK}`,
				`\ndeclaration 2  global\n${SECOND_WAY_BLOCK}`,
			],
			exitCode: 0,
		},
	},
	{
		description: '--under DD_1 (not a parent of AAA_1) → names the parents, exit 1',
		tagName: 'AAA_1',
		under: 'DD_1',
		expected: {
			startsWith: 'no AAA_1 under DD_1 - its parents: AA_1, AA_2, AA_3, AA_4, AA_5\n',
			absent: ['declaration 1'],
			exitCode: 1,
		},
	},
	{
		description: 'a tag declared once with --under a parent → the plain block, no "one of" line',
		tagName: 'DD_1',
		under: 'D',
		expected: {
			startsWith: [
				headerOf({ tag: 'DD_1', namespace: DEFAULT_NAMESPACE }),
				`type: {${DEFAULT_NAMESPACE}}tDD_1`,
				'parents: D',
				'',
			].join('\n'),
			absent: ['one of', 'declared'],
			exitCode: 0,
		},
	},
	{
		description:
			'a tag declared once with --under a tag that is not its parent → names the parents, exit 1',
		tagName: 'DD_1',
		under: 'A',
		expected: { startsWith: 'no DD_1 under A - its parents: D\n', exitCode: 1 },
	},
	{
		description: 'text prints the documentation of an element declared once',
		tagName: 'Root',
		expected: {
			startsWith: [
				headerOf({ tag: 'Root', namespace: DEFAULT_NAMESPACE }),
				'documentation: Root element for test fixture',
				'parents: none (the root)',
				'',
			].join('\n'),
			exitCode: 0,
		},
	},
	{
		description: 'text prints the type of an element declared once, none for a tag without one',
		tagName: 'DD_1',
		expected: {
			startsWith: [
				headerOf({ tag: 'DD_1', namespace: DEFAULT_NAMESPACE }),
				`type: {${DEFAULT_NAMESPACE}}tDD_1`,
				'parents: D',
				'',
			].join('\n'),
			exitCode: 0,
		},
	},
]

describe('answerSchema (a tag declared two ways, type and documentation)', () => {
	for (const testCase of declaredWaysCases)
		it(testCase.description, () => {
			const result = answerSchema({
				loaded: { dialectes: [multiDeclared], skipped: [] },
				tagName: testCase.tagName,
				under: testCase.under,
				json: false,
			})
			expect(result.exitCode).toBe(testCase.expected.exitCode)
			if (testCase.expected.startsWith !== undefined)
				expect(result.output.slice(0, testCase.expected.startsWith.length)).toBe(
					testCase.expected.startsWith,
				)
			for (const text of testCase.expected.contains ?? []) expect(result.output).toContain(text)
			for (const text of testCase.expected.absent ?? []) expect(result.output).not.toContain(text)
		})

	it('--json, a tag declared once → type, documentation, declarations and resolved, no ways', () => {
		const result = answerSchema({
			loaded: { dialectes: [multiDeclared], skipped: [] },
			tagName: 'Root',
			json: true,
		})
		const [element] = JSON.parse(result.output).elements
		expect(element).toMatchObject({
			tag: 'Root',
			documentation: 'Root element for test fixture',
			declarations: 1,
			resolved: true,
		})
		expect(element).not.toHaveProperty('ways')
	})

	it('--json, a tag declared two ways without --under → unresolved, with the ways', () => {
		const result = answerSchema({
			loaded: { dialectes: [multiDeclared], skipped: [] },
			tagName: 'AAA_1',
			json: true,
		})
		const [element] = JSON.parse(result.output).elements
		expect(element).toMatchObject({ tag: 'AAA_1', declarations: 2, resolved: false })
		expect(
			element.ways.map((way: DeclarationDescription) => ({
				id: way.id,
				parents: way.parents,
				global: way.global,
				type: way.element.type,
			})),
		).toEqual([
			{ id: '1', parents: FIRST_WAY_PARENTS, global: false, type: FIRST_DECLARATION_TYPE },
			{ id: '2', parents: SECOND_WAY_PARENTS, global: true, type: SECOND_DECLARATION_TYPE },
		])
	})

	it('--json, DD_1 → its type', () => {
		const result = answerSchema({
			loaded: { dialectes: [multiDeclared], skipped: [] },
			tagName: 'DD_1',
			json: true,
		})
		expect(JSON.parse(result.output).elements[0]).toMatchObject({
			tag: 'DD_1',
			type: `{${DEFAULT_NAMESPACE}}tDD_1`,
			declarations: 1,
			resolved: true,
		})
	})

	it('--json --under AA_1 → the resolved declaration, its type and documentation, no ways', () => {
		const result = answerSchema({
			loaded: { dialectes: [multiDeclared], skipped: [] },
			tagName: 'AAA_1',
			under: 'AA_1',
			json: true,
		})
		const [element] = JSON.parse(result.output).elements
		expect(element).toMatchObject({
			tag: 'AAA_1',
			type: FIRST_DECLARATION_TYPE,
			documentation: FIRST_DECLARATION_DOCUMENTATION,
			declaration: '1',
			declarations: 2,
			resolved: true,
		})
		expect(element).not.toHaveProperty('ways')
	})

	it('--json --under AA_5 (a wildcard parent) → unresolved, with every declaration', () => {
		const result = answerSchema({
			loaded: { dialectes: [multiDeclared], skipped: [] },
			tagName: 'AAA_1',
			under: 'AA_5',
			json: true,
		})
		const [element] = JSON.parse(result.output).elements
		expect(element).toMatchObject({ resolved: false, declarations: 2 })
		expect(element.ways.map((way: DeclarationDescription) => way.id)).toEqual(['1', '2'])
	})

	it('--json --under AA_3 (holds every way) → unresolved, with the declarations it holds', () => {
		const result = answerSchema({
			loaded: { dialectes: [multiDeclared], skipped: [] },
			tagName: 'AAA_1',
			under: 'AA_3',
			json: true,
		})
		const [element] = JSON.parse(result.output).elements
		expect(element).toMatchObject({ resolved: false, declarations: 2 })
		expect(element.ways.map((way: DeclarationDescription) => way.id)).toEqual(['1', '2'])
	})

	it('--json --under DD_1 (not a parent) → no element, exit 1', () => {
		const result = answerSchema({
			loaded: { dialectes: [multiDeclared], skipped: [] },
			tagName: 'AAA_1',
			under: 'DD_1',
			json: true,
		})
		expect({ elements: JSON.parse(result.output).elements, exitCode: result.exitCode }).toEqual({
			elements: [],
			exitCode: 1,
		})
	})
})

describe('dialecte schema <Tag> --under <Parent> (command line, installed dialecte)', () => {
	let cwd: string

	beforeEach(async () => {
		cwd = mkdtempSync(join(tmpdir(), 'dialecte-cli-schema-under-'))
		writeFileSync(join(cwd, 'package.json'), '{}')
		await installMultiDeclaredDialecte({ cwd })
	})

	afterEach(() => {
		rmSync(cwd, { recursive: true, force: true })
	})

	it('readSchemaDialectes returns the --under parent and keeps it out of the tag', async () => {
		const read = await readSchemaDialectes({ argv: ['AAA_1', '--under', 'AA_1'], cwd })

		expect(read).toMatchObject({ kind: 'dialectes', tagName: 'AAA_1', under: 'AA_1' })
	})

	it('runSchema AAA_1 --under AA_1 → the one declaration, as answerSchema does', async () => {
		const result = await runSchema({ argv: ['AAA_1', '--under', 'AA_1'], cwd })
		const expectedStart = [
			'AAA_1 under AA_1: declaration 1, one of 2 ways',
			headerOf({ tag: 'AAA_1', namespace: DEFAULT_NAMESPACE, packageName: WIDGET_PACKAGE }),
			`documentation: ${FIRST_DECLARATION_DOCUMENTATION}`,
			`type: ${FIRST_DECLARATION_TYPE}`,
			`parents: ${FIRST_WAY_PARENTS.join(', ')}`,
			'',
		].join('\n')
		expect(result.exitCode).toBe(0)
		expect(result.output.slice(0, expectedStart.length)).toBe(expectedStart)
		expect(result.output).not.toContain('declaration 2')
	})

	it('--under given without a value → usage, exit 2 (readSchemaDialectes)', async () => {
		const read = await readSchemaDialectes({ argv: ['AAA_1', '--under'], cwd })
		expect(read.kind === 'output' ? read.output.exitCode : read.kind).toBe(2)
		expect(read.kind === 'output' ? read.output.output : '').toContain('--under')
	})

	it('--under given without a value → usage, exit 2 (runSchema)', async () => {
		const result = await runSchema({ argv: ['AAA_1', '--under'], cwd })
		expect(result.exitCode).toBe(2)
		expect(result.output).toContain('usage: dialecte schema')
	})

	it('--under "" (an empty value) → usage, exit 2 (runSchema)', async () => {
		const result = await runSchema({ argv: ['AAA_1', '--under', ''], cwd })
		expect(result.exitCode).toBe(2)
		expect(result.output).toContain('usage: dialecte schema')
	})
})

describe('dialecte schema AAA_1 --under AA_1 (two installed dialectes)', () => {
	let cwd: string

	beforeEach(async () => {
		cwd = mkdtempSync(join(tmpdir(), 'dialecte-cli-schema-two-'))
		writeFileSync(join(cwd, 'package.json'), '{}')
		await installMultiDeclaredDialecte({ cwd })
		installTestDialecte({ cwd, packageName: GADGET_PACKAGE })
	})

	afterEach(() => {
		rmSync(cwd, { recursive: true, force: true })
	})

	it('both dialectes answer: the multi-declared one its declaration, the plain one its single way', async () => {
		const result = await runSchema({ argv: ['AAA_1', '--under', 'AA_1', '--json'], cwd })
		const { elements } = JSON.parse(result.output)
		expect({
			exitCode: result.exitCode,
			answers: elements
				.map((element: ElementDescription) => ({
					packageName: element.packageName,
					declaration: element.declaration,
					declarations: element.declarations,
					resolved: element.resolved,
				}))
				.sort((first: { packageName: string }, second: { packageName: string }) =>
					first.packageName < second.packageName ? -1 : 1,
				),
		}).toEqual({
			exitCode: 0,
			answers: [
				{ packageName: GADGET_PACKAGE, declaration: undefined, declarations: 1, resolved: true },
				{ packageName: WIDGET_PACKAGE, declaration: '1', declarations: 2, resolved: true },
			],
		})
	})

	it('--package <the plain one> → only it answers', async () => {
		const result = await runSchema({
			argv: ['AAA_1', '--under', 'AA_1', '--package', GADGET_PACKAGE, '--json'],
			cwd,
		})
		const { elements } = JSON.parse(result.output)
		expect(elements.map((element: ElementDescription) => element.packageName)).toEqual([
			GADGET_PACKAGE,
		])
	})
})
