import { planFixture } from './plan-fixture.ts'
import { planNode } from './plan-node.ts'
import { plantReferences } from './plant-references.ts'

import { describe, expect, it } from 'vitest'

import type {
	Occurrences,
	SchemaConfig,
	SchemaElementDefinition,
	SchemaIdentityConstraint,
} from '../schema/schema.types.ts'
import type {
	FixtureDialecte,
	FixtureElement,
	FixturePlanResult,
	FixtureReaders,
	RequiredChoice,
} from './fixture.types.ts'

type Shape = {
	children?: Record<string, Occurrences>
	required?: Record<string, { builtin: string }>
	choices?: RequiredChoice[]
	constraints?: SchemaIdentityConstraint[]
}

/** A small dialecte read by stand-in readers: each element's children with their occurrences, its required attributes. */
function shapedDialecte(params: { shapes: Record<string, Shape> }): FixtureDialecte {
	const { shapes } = params
	const tags = Object.keys(shapes)
	function definitionOf(tag: string): SchemaElementDefinition {
		const shape = shapes[tag]
		return {
			tag,
			parents: tags.filter((parent) => tag in (shapes[parent].children ?? {})),
			namespace: { prefix: '', uri: 'urn:shapes' },
			attributes: {
				sequence: Object.keys(shape.required ?? {}),
				details: Object.fromEntries(
					Object.entries(shape.required ?? {}).map(([name, type]) => [name, { type }]),
				),
			},
			children: { sequence: Object.keys(shape.children ?? {}) },
			...(shape.constraints && { constraints: shape.constraints }),
		}
	}
	const config: SchemaConfig = {
		rootElementName: tags[0],
		elements: tags,
		children: Object.fromEntries(tags.map((tag) => [tag, Object.keys(shapes[tag].children ?? {})])),
		definition: Object.fromEntries(tags.map((tag) => [tag, definitionOf(tag)])),
	}
	const readers: FixtureReaders = {
		resolveDefinition: ({ record }) => config.definition[record.tagName],
		getAttributeRules: ({ record, attributeName }) => ({
			isRequired: attributeName in (shapes[record.tagName].required ?? {}),
			isIdentityField: false,
			fixed: undefined,
			default: undefined,
			namespace: undefined,
		}),
		enumeratedValues: () => [],
		valuePatterns: () => [],
		admittedXsiTypes: () => [],
		childOccurrences: ({ definition }) => shapes[definition.tag].children ?? {},
		orderByConfigSequence: ({ parentTagName, children }) =>
			[...children].sort(
				(left, right) =>
					config.children[parentTagName].indexOf(left.tagName) -
					config.children[parentTagName].indexOf(right.tagName),
			),
		requiredChoices: ({ definition }) => shapes[definition.tag].choices ?? [],
	}
	return { packageName: '@acme/shapes', config, readers }
}

function element(params: Partial<FixtureElement> & { tagName: string }): FixtureElement {
	return { attributes: [], children: [], ...params }
}

describe('planFixture', () => {
	type TestCase = {
		shapes: Record<string, Shape>
		tagName: string
		expected: FixturePlanResult
		only?: boolean
	}

	const testCases: Record<string, TestCase> = {
		'two elements requiring each other → no finite fixture, the loop named': {
			shapes: {
				R: { children: { X: { min: 0, max: 1 } } },
				X: { children: { Y: { min: 1, max: 1 } } },
				Y: { children: { X: { min: 1, max: 1 } } },
			},
			tagName: 'X',
			expected: { problem: 'X requires itself below it (X > Y > X): no finite fixture holds it' },
		},
		'an element on the chain that a required child below it holds again → planned, no loop': {
			shapes: {
				R: { children: { X: { min: 0, max: 1 } } },
				X: { children: { Z: { min: 0, max: 1 } } },
				Z: { children: { X: { min: 1, max: 1 } } },
			},
			tagName: 'Z',
			expected: {
				plan: {
					tagName: 'Z',
					chain: ['R', 'X', 'Z'],
					root: {
						tagName: 'R',
						attributes: [],
						children: [
							{
								tagName: 'X',
								attributes: [],
								children: [
									{
										tagName: 'Z',
										attributes: [],
										children: [{ tagName: 'X', attributes: [], children: [] }],
									},
								],
							},
						],
					},
				},
			},
		},
		'a required child twice → added twice, each its own value': {
			shapes: {
				R: { children: { X: { min: 2, max: undefined } } },
				X: { required: { code: { builtin: 'int' } } },
			},
			tagName: 'R',
			expected: {
				plan: {
					tagName: 'R',
					chain: ['R'],
					root: {
						tagName: 'R',
						attributes: [],
						children: [
							{ tagName: 'X', attributes: [{ name: 'code', value: '0' }], children: [] },
							{ tagName: 'X', attributes: [{ name: 'code', value: '1' }], children: [] },
						],
					},
				},
			},
		},
		'an element no chain of children reaches → said so': {
			shapes: { R: {}, Lonely: {} },
			tagName: 'Lonely',
			expected: { problem: 'no chain of children from R reaches Lonely' },
		},
		'a required attribute no value can be made for → the attribute named': {
			shapes: {
				R: { children: { W: { min: 0, max: 1 } } },
				W: { required: { code: { builtin: 'QName' } } },
			},
			tagName: 'W',
			expected: { problem: 'no value for W@code: the built-in type QName has no sample' },
		},
		'a required choice no child takes → the children of its first branch': {
			shapes: {
				R: {
					children: { S: { min: 0, max: 1 }, T: { min: 0, max: 1 }, U: { min: 0, max: 1 } },
					choices: [
						{
							min: 1,
							branches: [
								{ children: { S: { min: 1, max: 1 } }, choices: [] },
								{ children: { T: { min: 1, max: 1 } }, choices: [] },
							],
						},
					],
				},
				S: {},
				T: {},
				U: {},
			},
			tagName: 'R',
			expected: {
				plan: {
					tagName: 'R',
					chain: ['R'],
					root: element({ tagName: 'R', children: [element({ tagName: 'S' })] }),
				},
			},
		},
		'a required choice the chain already takes → no other branch added': {
			shapes: {
				R: {
					children: { S: { min: 0, max: 1 }, T: { min: 0, max: 1 } },
					choices: [
						{
							min: 1,
							branches: [
								{ children: { S: { min: 1, max: 1 } }, choices: [] },
								{ children: { T: { min: 1, max: 1 } }, choices: [] },
							],
						},
					],
				},
				S: {},
				T: {},
			},
			tagName: 'T',
			expected: {
				plan: {
					tagName: 'T',
					chain: ['R', 'T'],
					root: element({ tagName: 'R', children: [element({ tagName: 'T' })] }),
				},
			},
		},
		'two elements of one required attribute → two different values': {
			shapes: {
				R: { children: { X: { min: 2, max: undefined } } },
				X: { required: { id: { builtin: 'normalizedString' } } },
			},
			tagName: 'R',
			expected: {
				plan: {
					tagName: 'R',
					chain: ['R'],
					root: element({
						tagName: 'R',
						children: [
							element({ tagName: 'X', attributes: [{ name: 'id', value: 'X' }] }),
							element({ tagName: 'X', attributes: [{ name: 'id', value: 'X1' }] }),
						],
					}),
				},
			},
		},
		'a reference a keyref checks → the element of the key planted along its selector, the same value':
			{
				shapes: {
					R: {
						children: { Use: { min: 0, max: 1 }, Types: { min: 0, max: 1 } },
						constraints: [
							{
								kind: 'key',
								name: 'typeKey',
								namespace: 'urn:shapes',
								selector: [{ steps: [{ name: 'Types' }, { name: 'Type' }] }],
								fields: [[{ steps: [], attribute: { name: 'id' } }]],
							},
							{
								kind: 'keyref',
								name: 'useType',
								namespace: 'urn:shapes',
								refer: { name: 'typeKey', namespace: 'urn:shapes' },
								selector: [{ steps: [{ name: 'Use' }] }],
								fields: [[{ steps: [], attribute: { name: 'type' } }]],
							},
						],
					},
					Use: { required: { type: { builtin: 'normalizedString' } } },
					Types: { children: { Type: { min: 0, max: undefined } } },
					Type: {},
				},
				tagName: 'Use',
				expected: {
					plan: {
						tagName: 'Use',
						chain: ['R', 'Use'],
						root: element({
							tagName: 'R',
							children: [
								element({ tagName: 'Use', attributes: [{ name: 'type', value: 'Use' }] }),
								element({
									tagName: 'Types',
									children: [
										element({ tagName: 'Type', attributes: [{ name: 'id', value: 'Use' }] }),
									],
								}),
							],
						}),
					},
				},
			},
		'a keyref an element satisfies on itself (ref of a key on its own id) → it points at itself, finite':
			{
				shapes: {
					R: {
						children: { Node: { min: 0, max: undefined } },
						constraints: [
							{
								kind: 'key',
								name: 'nodeKey',
								namespace: 'urn:shapes',
								selector: [{ steps: [{ name: 'Node' }] }],
								fields: [[{ steps: [], attribute: { name: 'id' } }]],
							},
							{
								kind: 'keyref',
								name: 'nodeRef',
								namespace: 'urn:shapes',
								refer: { name: 'nodeKey', namespace: 'urn:shapes' },
								selector: [{ steps: [{ name: 'Node' }] }],
								fields: [[{ steps: [], attribute: { name: 'ref' } }]],
							},
						],
					},
					Node: {
						required: { id: { builtin: 'normalizedString' }, ref: { builtin: 'normalizedString' } },
					},
				},
				tagName: 'Node',
				expected: {
					plan: {
						tagName: 'Node',
						chain: ['R', 'Node'],
						root: element({
							tagName: 'R',
							children: [
								element({
									tagName: 'Node',
									attributes: [
										{ name: 'id', value: 'Node' },
										{ name: 'ref', value: 'Node' },
									],
								}),
							],
						}),
					},
				},
			},
		'a reference an element already planted can satisfy → it points there, nothing planted': {
			shapes: {
				R: {
					children: { Use: { min: 0, max: 1 }, Types: { min: 1, max: 1 } },
					constraints: [
						{
							kind: 'key',
							name: 'typeKey',
							namespace: 'urn:shapes',
							selector: [{ steps: [{ name: 'Types' }, { name: 'Type' }] }],
							fields: [[{ steps: [], attribute: { name: 'id' } }]],
						},
						{
							kind: 'keyref',
							name: 'useType',
							namespace: 'urn:shapes',
							refer: { name: 'typeKey', namespace: 'urn:shapes' },
							selector: [{ steps: [{ name: 'Use' }] }],
							fields: [[{ steps: [], attribute: { name: 'type' } }]],
						},
					],
				},
				Use: { required: { type: { builtin: 'normalizedString' } } },
				Types: { children: { Type: { min: 1, max: undefined } } },
				Type: { required: { id: { builtin: 'normalizedString' } } },
			},
			tagName: 'Use',
			expected: {
				plan: {
					tagName: 'Use',
					chain: ['R', 'Use'],
					root: element({
						tagName: 'R',
						children: [
							element({ tagName: 'Use', attributes: [{ name: 'type', value: 'Type' }] }),
							element({
								tagName: 'Types',
								children: [
									element({ tagName: 'Type', attributes: [{ name: 'id', value: 'Type' }] }),
								],
							}),
						],
					}),
				},
			},
		},
		'a parent planted for the key brings an element of the key → the reference points at it, no second one':
			{
				shapes: {
					R: {
						children: { Use: { min: 0, max: 1 }, Types: { min: 0, max: 1 } },
						constraints: [
							{
								kind: 'key',
								name: 'typeKey',
								namespace: 'urn:shapes',
								selector: [{ steps: [{ name: 'Types' }, { name: 'Type' }] }],
								fields: [[{ steps: [], attribute: { name: 'id' } }]],
							},
							{
								kind: 'keyref',
								name: 'useType',
								namespace: 'urn:shapes',
								refer: { name: 'typeKey', namespace: 'urn:shapes' },
								selector: [{ steps: [{ name: 'Use' }] }],
								fields: [[{ steps: [], attribute: { name: 'type' } }]],
							},
						],
					},
					Use: { required: { type: { builtin: 'normalizedString' } } },
					Types: { children: { Type: { min: 1, max: undefined } } },
					Type: { required: { id: { builtin: 'normalizedString' } } },
				},
				tagName: 'Use',
				expected: {
					plan: {
						tagName: 'Use',
						chain: ['R', 'Use'],
						root: element({
							tagName: 'R',
							children: [
								element({ tagName: 'Use', attributes: [{ name: 'type', value: 'Type' }] }),
								element({
									tagName: 'Types',
									children: [
										element({ tagName: 'Type', attributes: [{ name: 'id', value: 'Type' }] }),
									],
								}),
							],
						}),
					},
				},
			},
		'a reused value a unique constraint already holds → refused, the next element of the key taken':
			{
				shapes: {
					R: {
						children: { Node: { min: 2, max: undefined } },
						constraints: [
							{
								kind: 'key',
								name: 'k',
								namespace: 'urn:shapes',
								selector: [{ steps: [{ name: 'Node' }] }],
								fields: [[{ steps: [], attribute: { name: 'id' } }]],
							},
							{
								kind: 'unique',
								name: 'u',
								namespace: 'urn:shapes',
								selector: [{ steps: [{ name: 'Node' }] }],
								fields: [[{ steps: [], attribute: { name: 'a' } }]],
							},
							{
								kind: 'keyref',
								name: 'r',
								namespace: 'urn:shapes',
								refer: { name: 'k', namespace: 'urn:shapes' },
								selector: [{ steps: [{ name: 'Node' }] }],
								fields: [[{ steps: [], attribute: { name: 'a' } }]],
							},
						],
					},
					Node: {
						required: { id: { builtin: 'normalizedString' }, a: { builtin: 'normalizedString' } },
					},
				},
				tagName: 'R',
				expected: {
					plan: {
						tagName: 'R',
						chain: ['R'],
						root: element({
							tagName: 'R',
							children: [
								element({
									tagName: 'Node',
									attributes: [
										{ name: 'id', value: 'Node' },
										{ name: 'a', value: 'Node' },
									],
								}),
								element({
									tagName: 'Node',
									attributes: [
										{ name: 'id', value: 'Node2' },
										{ name: 'a', value: 'Node2' },
									],
								}),
							],
						}),
					},
				},
			},
		'a keyref whose key is declared on another element → the keyref named': {
			shapes: {
				R: {
					children: { Use: { min: 0, max: 1 } },
					constraints: [
						{
							kind: 'keyref',
							name: 'useType',
							namespace: 'urn:shapes',
							refer: { name: 'elsewhere', namespace: 'urn:shapes' },
							selector: [{ steps: [{ name: 'Use' }] }],
							fields: [[{ steps: [], attribute: { name: 'type' } }]],
						},
					],
				},
				Use: { required: { type: { builtin: 'normalizedString' } } },
			},
			tagName: 'Use',
			expected: {
				problem:
					'keyref useType refers to elsewhere, not declared on R: the fixture cannot point it',
			},
		},
	}

	const entries = Object.entries(testCases)
	const focused = entries.filter(([, testCase]) => testCase.only)
	for (const [description, testCase] of focused.length ? focused : entries)
		it(description, () => {
			expect(
				planFixture({
					dialecte: shapedDialecte({ shapes: testCase.shapes }),
					tagName: testCase.tagName,
				}),
			).toEqual(testCase.expected)
		})
})

describe('plantReferences round guard', () => {
	it('references still changing when the walks run out → the guard named, no plan', () => {
		const dialecte = shapedDialecte({
			shapes: {
				R: {
					children: { Use: { min: 1, max: 1 }, Types: { min: 0, max: 1 } },
					constraints: [
						{
							kind: 'key',
							name: 'typeKey',
							namespace: 'urn:shapes',
							selector: [{ steps: [{ name: 'Types' }, { name: 'Type' }] }],
							fields: [[{ steps: [], attribute: { name: 'id' } }]],
						},
						{
							kind: 'keyref',
							name: 'useType',
							namespace: 'urn:shapes',
							refer: { name: 'typeKey', namespace: 'urn:shapes' },
							selector: [{ steps: [{ name: 'Use' }] }],
							fields: [[{ steps: [], attribute: { name: 'type' } }]],
						},
					],
				},
				Use: { required: { type: { builtin: 'normalizedString' } } },
				Types: { children: { Type: { min: 0, max: undefined } } },
				Type: {},
			},
		})
		const context = { dialecte, used: new Set<string>() }
		const root = planNode({ context, tagName: 'R', chainBelow: [], requiredAbove: [] })
		if ('problem' in root) throw new Error(root.problem)

		expect(plantReferences({ context, root, roundLimit: 1 })).toEqual({
			problem:
				'the references still ask for new elements after 1 walk(s) of the plan: no finite fixture satisfies them',
		})
		expect(plantReferences({ context, root, roundLimit: 1 })).toBeUndefined()
	})
})
