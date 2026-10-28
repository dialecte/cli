import { findMethods, wordsOf } from './find-methods.ts'

import { describe, expect, it } from 'vitest'

import type { ApiJson, ApiMethod } from './api-json.types.ts'

function method(params: Partial<ApiMethod> & { path: string }): ApiMethod {
	return {
		root: 'q',
		otherRoutes: [],
		signature: '() => void',
		summary: undefined,
		intents: [],
		declaredAt: undefined,
		example: undefined,
		...params,
	}
}

const SCL: ApiJson = {
	package: '@dialecte/scl',
	methods: [
		method({
			path: 'doc.query.info.of',
			summary: 'The own title of an SCL element, read from the element itself.',
			intents: ['own title or display name of an element', 'Labels translations of an element'],
		}),
		method({
			path: 'doc.query.reference.buildElementPath',
			summary: 'The path of an element from the root, as names.',
			intents: ['breadcrumb of an element', 'path from the root'],
		}),
		method({
			path: 'tx.reference.applyUuidRemap',
			root: 'tx',
			summary: 'Repoint the uuid references of cloned elements.',
			intents: ['repoint uuid references after a clone'],
		}),
	],
}

const CORE: ApiJson = {
	package: '@dialecte/core',
	methods: [
		method({
			path: 'doc.query.getTree',
			summary: 'Build a full tree structure from an element down.',
			intents: ['read a subtree in document order'],
		}),
		method({
			path: 'doc.query.findAncestors',
			summary: 'Every ancestor of an element, from its parent up.',
			intents: ['build a path from the root'],
		}),
	],
}

const RENAMING: ApiJson[] = [
	{
		package: '@dialecte/core',
		methods: [method({ path: 'doc.query.applyName', intents: ['rename an element'] })],
	},
	{
		package: '@dialecte/scl',
		methods: [
			method({ path: 'doc.query.lifecycle.move', intents: ['rename an element'] }),
			method({ path: 'doc.query.info.retitle', intents: ['rename an element'] }),
		],
	},
]

type TestCase = {
	description: string
	need: string
	indexes?: ApiJson[]
	limit?: number
	expected: { path: string; matchingIntent: string | undefined }[]
}

const testCases: TestCase[] = [
	{
		description: "intent words of info.of's tag → info.of ranked first",
		need: 'display name of an element',
		expected: [
			{ path: 'doc.query.info.of', matchingIntent: 'own title or display name of an element' },
			{ path: 'doc.query.reference.buildElementPath', matchingIntent: undefined },
		],
	},
	{
		description: 'a word in no intent but in a summary → found, ranked below intent matches',
		need: 'own title down',
		expected: [
			{ path: 'doc.query.info.of', matchingIntent: 'own title or display name of an element' },
			{ path: 'doc.query.getTree', matchingIntent: undefined },
		],
	},
	{
		description: 'same score in a dialecte and in core → the dialecte verbs first, each by path',
		need: 'rename',
		indexes: RENAMING,
		expected: [
			{ path: 'doc.query.info.retitle', matchingIntent: 'rename an element' },
			{ path: 'doc.query.lifecycle.move', matchingIntent: 'rename an element' },
			{ path: 'doc.query.applyName', matchingIntent: 'rename an element' },
		],
	},
	{
		description: 'plural need, singular intent → matched (simple stemming)',
		need: 'translation of label',
		expected: [{ path: 'doc.query.info.of', matchingIntent: 'Labels translations of an element' }],
	},
	{
		description: 'a word of the method name only → found with the lowest weight',
		need: 'remap',
		expected: [{ path: 'tx.reference.applyUuidRemap', matchingIntent: undefined }],
	},
	{
		description: 'only stop words or unknown words → nothing',
		need: 'the of an zebra',
		expected: [],
	},
	{
		description: '--limit 1 → the best one only',
		need: 'display name of an element',
		limit: 1,
		expected: [
			{ path: 'doc.query.info.of', matchingIntent: 'own title or display name of an element' },
		],
	},
]

describe('findMethods', () => {
	for (const testCase of testCases)
		it(testCase.description, () => {
			const found = findMethods({
				indexes: testCase.indexes ?? [CORE, SCL],
				need: testCase.need,
				limit: testCase.limit ?? 10,
			})
			expect(
				found.map((result) => ({
					path: result.method.path,
					matchingIntent: result.matchingIntent,
				})),
			).toEqual(testCase.expected)
		})
})

/** Real scl verbs that compete for copy and naming needs, as their api.json ships them. */
const SCL_VERBS: ApiJson = {
	package: '@dialecte/scl',
	methods: [
		method({
			path: 'doc.query.dataflow.subscribersOf',
			root: 'q',
			summary:
				'Query extension: what subscribes to a control block. Its registrations (the `IEDName` and `ClientLN` it holds), each with how precisely it names its subscriber; the ExtRefs naming it, by uuid or by names; and the dataflows of those ExtRefs, specified or not.',
			intents: [
				'who subscribes to a GOOSE/SV/report control block',
				'IEDName and ClientLN registrations of a control block',
				'ExtRefs naming a control block',
			],
		}),
		method({
			path: 'doc.query.info.of',
			root: 'q',
			summary:
				"The own title of an SCL element, read from the element itself - its attributes or text, a named child for a few tags, the signal name for a signal - never from its ancestors (a Bay's title is its `name`, not its path from the root, which is `reference.buildElementPath`), its state, and its `<Labels>` when asked (`withLabels: true`, one more read per element).",
			intents: [
				'own title or display name of an element',
				'display name of a Bay/IED/LNode/ExtRef',
				'state of an LNode or signal (locked, mapped, connected, implemented)',
				'Labels translations of an element',
			],
		}),
		method({
			path: 'doc.query.info.ofEach',
			root: 'q',
			summary:
				"`of` for several elements, in the order given: each one's own title (not its path from the root, which is `reference.buildElementPath`) and state, with the document-wide facts a state needs (the kinds of the IEDs, the LNs by uuid) read once for the whole call.",
			intents: [
				'own titles or display names of many elements in one call',
				'states of many LNodes or signals',
				'instead of calling info.of in a loop',
			],
		}),
		method({
			path: 'doc.query.lifecycle.classifyIeds',
			root: 'q',
			summary:
				"Classify every IED, in document order, as a real device's IED (`implemented`) or one written to specify a device (`specification`). An IED is implemented when an ICD or IID file is among its own source files (`IEDSourceFiles`, a reference in the document header does not count), or when the document itself is an ICD file; any other IED is a specification IED.",
			intents: [
				'which IEDs are real devices and which are specification IEDs',
				'is an IED implemented (ICD/IID source)',
				'S-IED or real IED instead of reading manufacturer',
			],
		}),
		method({
			path: 'doc.query.reference.buildElementPath',
			root: 'q',
			summary:
				'The path of an element from the document root, as reference paths write it (`S1/V1/B1/CE1`, `IED1/LD0/XCBR1.Pos`), with the element each segment names. `null` when the element has no segment of its own (a transparent container such as `AccessPoint`).',
			intents: [
				'path or label of an element from the root like Substation/VoltageLevel/Bay',
				'breadcrumb path of a Bay/LNode/DO',
				'full name path instead of walking ancestors',
				'inverse of resolveElementPath',
			],
		}),
		method({
			path: 'doc.query.reference.getProvenance',
			root: 'q',
			summary:
				'Query extension: returns every source-file reference in the document, each resolved to the element that carries it \u2014 the function/application/ied it was instantiated from, or the header for document-level source files. Consumers use it to show which templates (and versions) a document was built from and to decide whether a file is compatible with a given scenario.',
			intents: [
				'which templates (FSD/ASD/SSD) a document was built from',
				'source files and versions of a document',
				'template origin of a Function/Application/IED',
			],
		}),
		method({
			path: 'tx.dataModel.importTypes',
			root: 'tx',
			summary:
				'Import the type closure of `records` into the target `DataTypeTemplates`, content-addressed: an equal type is reused, a free id is kept, a taken id is forked.',
			intents: [
				'copy data types (LNodeType/DOType/DAType/EnumType) into another document',
				'import a type closure with dedup and id collision handling',
				'merge DataTypeTemplates',
			],
		}),
		method({
			path: 'tx.identity.restoreClonedUuids',
			root: 'tx',
			summary:
				"For a fork only: give each element the fork cloned the `uuid` of its source element back, so the forked revision keeps the source's identities. Never for a clone or copy inside one document, where two elements would then share a `uuid`.",
			intents: [
				'keep source uuids on a fork',
				'restore element uuids after forking a document',
				'fork a revision with the same identities',
			],
		}),
		method({
			path: 'tx.lifecycle.transplant.deep',
			root: 'tx',
			summary:
				'Import an element subtree into a target document together with its type closure (the data types its LN / LNode use), returning the root it wrote into, the type id remap and the clone mappings.',
			intents: [
				'copy a subtree (IED, Bay, Function) from another document with its data types',
				'import an IED from an ICD',
				'clone an element across documents',
			],
		}),
		method({
			path: 'tx.reference.applyTypeIdRemap',
			root: 'tx',
			summary:
				'Mechanically rewrite every type-id reference attribute (`lnType`, `DO.type`, `SDO.type`, `DA.type`, `BDA.type`) in `records` whose current value appears in `idRemap`. Registry-driven via `TYPE_ID_REF_ATTRIBUTES` (no hardcoded tag list). Counterpart of `tx.reference.applyUuidRemap` (the uuid-ref remap), but for the id-string type-reference system.',
			intents: [
				'rename data type ids and repoint lnType/type references',
				'rewrite type references after an id change',
			],
		}),
		method({
			path: 'tx.reference.applyUuidRemap',
			root: 'tx',
			summary:
				"Repoint the uuid references of cloned elements onto the clone's fresh identities and recompute their path attributes. Counterpart of `tx.reference.applyTypeIdRemap` for the uuid reference system (`UUID_REFERENCE_PAIRS`).",
			intents: [
				'repoint uuid references after a clone',
				'make references inside copied elements point at the copies',
				'rewrite refs from source to target uuids',
			],
		}),
	],
}

describe('findMethods, real scl verbs', () => {
	it('two summary words vs one intent word → the intent match first', () => {
		const found = findMethods({
			indexes: [
				{
					package: '@dialecte/scl',
					methods: [
						method({
							path: 'doc.query.a.summaryOnly',
							summary: 'Moves a subtree and its anchors.',
						}),
						method({ path: 'doc.query.b.intentOnly', intents: ['move a subtree'] }),
					],
				},
			],
			need: 'subtree anchors',
			limit: 5,
		})
		expect(found.map((result) => result.method.path)).toEqual([
			'doc.query.b.intentOnly',
			'doc.query.a.summaryOnly',
		])
	})

	it('"copied an IED keeping references" → applyUuidRemap in the top 3', () => {
		const found = findMethods({
			indexes: [SCL_VERBS],
			need: 'copied an IED keeping references',
			limit: 3,
		})
		expect(found.map((result) => result.method.path)).toContain('tx.reference.applyUuidRemap')
	})

	it('"name and description of an element" → info.of first', () => {
		const [first] = findMethods({
			indexes: [SCL_VERBS],
			need: 'name and description of an element',
			limit: 3,
		})
		expect(first?.method.path).toBe('doc.query.info.of')
	})
})

describe('wordsOf', () => {
	const testCases: Record<string, string[]> = {
		'copied copies copying copy': ['copy', 'copy', 'copy', 'copy'],
		'ids references reference': ['id', 'referenc', 'referenc'],
		'class string of the element': ['class', 'string'],
		'naming named name': ['naming', 'named', 'nam'],
	}
	for (const [text, expected] of Object.entries(testCases))
		it(`${text} → ${expected.join(' ')}`, () => expect(wordsOf(text)).toEqual(expected))
})
