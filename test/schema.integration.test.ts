import { answerSchema } from '../src/lib/schema/answer-schema.ts'
import { describeElement } from '../src/lib/schema/describe-element.ts'
import { loadCoreTestDialecte } from './real-core.ts'

import { beforeAll, describe, expect, it } from 'vitest'

import type { LoadedDialecte } from '../src/lib/schema/schema.types.ts'

const DEFAULT_NAMESPACE = 'http://dialecte.dev/XML/DEFAULT'
const EXTENSION_NAMESPACE = 'http://dialecte.dev/XML/DEV-EXT'

let dialecte: LoadedDialecte

beforeAll(async () => {
	dialecte = await loadCoreTestDialecte()
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
		})
	})

	it('a tag the dialecte does not have → undefined', () => {
		expect(describeElement({ dialecte, tagName: 'AA_9' })).toBeUndefined()
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
