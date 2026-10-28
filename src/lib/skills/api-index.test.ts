import { PLACEHOLDER_MARKER } from './api-index.constants.ts'
import {
	findQuotedSentences,
	findUndocumentedMethods,
	renderApiIndex,
	renderIntentIndex,
} from './api-index.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { MethodEntry } from '../discover.types.ts'

function entry(params: Partial<MethodEntry> & { path: string }): MethodEntry {
	return {
		summary: 'Does it.',
		intents: ['do it'],
		signature: '() => void',
		example: undefined,
		definedInPackage: true,
		internal: false,
		...params,
		// the same function reached from q and tx shares its declaration
		declaredAt: params.declaredAt ?? params.path.split('.').slice(1).join('.'),
	}
}

const ENTRIES: MethodEntry[] = [
	entry({
		path: 'q.info.of',
		summary: 'Title and state of an element.',
		intents: ['label of an element', 'breadcrumb'],
	}),
	entry({
		path: 'tx.info.of',
		summary: 'Title and state of an element.',
		intents: ['label of an element', 'breadcrumb'],
	}),
	entry({
		path: 'tx.reference.applyUuidRemap',
		summary: 'Repoint references after a copy.',
		intents: ['copy'],
	}),
	entry({
		path: 'q.getTree',
		summary: 'Subtree in document order.',
		intents: ['walk a subtree'],
		definedInPackage: false,
	}),
	entry({ path: 'project.open', summary: 'Open the store.', intents: [] }),
]

describe('renderApiIndex', () => {
	it('methods of this package → one row each, query paths as doc.query, tx copies of reads dropped', () => {
		expect(renderApiIndex(ENTRIES)).toBe(
			[
				'| Method | What it answers | Reach for it to |',
				'|---|---|---|',
				'| `doc.query.info.of` | Title and state of an element. | label of an element; breadcrumb |',
				'| `project.open` | Open the store. | - |',
				'| `tx.reference.applyUuidRemap` | Repoint references after a copy. | copy |',
			].join('\n'),
		)
	})
})

describe('renderApiIndex order', () => {
	const NativeCollator = Intl.Collator

	afterEach(() => {
		Object.defineProperty(Intl, 'Collator', {
			value: NativeCollator,
			writable: true,
			configurable: true,
		})
		vi.resetModules()
	})

	it('runtime locale sorting y before j (Lithuanian) → rows still in English order', async () => {
		// a runtime whose default locale is Lithuanian: a collator built without a locale sorts y before j
		class LithuanianByDefault extends NativeCollator {
			constructor(locales?: Intl.LocalesArgument, options?: Intl.CollatorOptions) {
				super(locales ?? 'lt', options)
			}
		}
		Object.defineProperty(Intl, 'Collator', {
			value: LithuanianByDefault,
			writable: true,
			configurable: true,
		})
		vi.resetModules()
		const { renderApiIndex: renderInLithuania } = await import('./api-index.ts')

		const index = renderInLithuania([
			entry({ path: 'tx.edit.yank', intents: ['remove'] }),
			entry({ path: 'tx.edit.join', intents: ['merge'] }),
		])
		expect(index.indexOf('tx.edit.join')).toBeLessThan(index.indexOf('tx.edit.yank'))
	})
})

describe('renderIntentIndex', () => {
	it('intents → sorted, each with the methods that serve it', () => {
		expect(renderIntentIndex(ENTRIES)).toBe(
			[
				'| When you need to... | Use |',
				'|---|---|',
				'| breadcrumb | `doc.query.info.of` |',
				'| copy | `tx.reference.applyUuidRemap` |',
				'| label of an element | `doc.query.info.of` |',
			].join('\n'),
		)
	})
})

describe('findUndocumentedMethods', () => {
	const testCases: Record<string, { entries: MethodEntry[]; expected: string[] }> = {
		'documented methods → nothing': {
			entries: ENTRIES.filter((method) => method.intents.length > 0),
			expected: [],
		},
		'a summary and an intent still holding the new-verb placeholder → both reported': {
			entries: [
				entry({
					path: 'q.cleanUp.findOrphans',
					summary: `${PLACEHOLDER_MARKER} what it answers, in one sentence.`,
					intents: [`${PLACEHOLDER_MARKER} what a caller is trying to do`],
				}),
			],
			expected: [
				'`doc.query.cleanUp.findOrphans` JSDoc summary is still a placeholder: write it',
				'`doc.query.cleanUp.findOrphans` @intent is still a placeholder: write it',
			],
		},
		'a method of this package without summary → reported': {
			entries: [entry({ path: 'tx.lifecycle.extract.fsd', summary: undefined })],
			expected: ['`tx.lifecycle.extract.fsd` has no JSDoc summary'],
		},
		'any method without intent, on every root → reported': {
			entries: [
				entry({ path: 'q.info.ofEach', intents: [] }),
				entry({ path: 'doc.prepare', intents: [] }),
				entry({ path: 'project.export', intents: [] }),
			],
			expected: [
				'`doc.prepare` has no @intent tag',
				'`doc.query.info.ofEach` has no @intent tag',
				'`project.export` has no @intent tag',
			],
		},
		'the same read reached through doc.query, and the untyped any group → indexed once, any left out':
			{
				entries: [
					entry({ path: 'q.getRoot', summary: undefined }),
					entry({ path: 'doc.query.getRoot', summary: undefined }),
					entry({ path: 'q.any.getTree', summary: undefined, intents: [] }),
				],
				expected: ['`doc.query.getRoot` has no JSDoc summary'],
			},
		'a method of a dependency (core seen from scl) → not this package’s to document': {
			entries: [
				entry({ path: 'q.getTree', summary: undefined, intents: [], definedInPackage: false }),
			],
			expected: [],
		},
	}

	for (const [title, testCase] of Object.entries(testCases)) {
		it(title, () => {
			expect(findUndocumentedMethods(testCase.entries)).toEqual(testCase.expected)
		})
	}
})

describe('index ordering and identity', () => {
	it('intents → sorted without regard to case', () => {
		const rows = renderIntentIndex([
			entry({ path: 'q.a', intents: ['Zone of a Bay'] }),
			entry({ path: 'q.b', intents: ['add a Bay'] }),
		]).split('\n')

		expect(rows.slice(2)).toEqual([
			'| add a Bay | `doc.query.b` |',
			'| Zone of a Bay | `doc.query.a` |',
		])
	})

	it('a transaction method sharing a read’s name but declared elsewhere → indexed as its own method', () => {
		const rows = renderApiIndex([
			entry({ path: 'q.history.entries', summary: 'Lists the entries.' }),
			entry({
				path: 'tx.history.entries',
				summary: 'Rewrites the entries.',
				declaredAt: 'rewrite.ts:0',
			}),
		])

		expect(rows).toContain('`tx.history.entries`')
	})

	it('@internal methods → out of the index and not required to be documented', () => {
		const internal = entry({ path: 'tx.commit', summary: undefined, intents: [], internal: true })

		expect(renderApiIndex([internal])).not.toContain('tx.commit')
		expect(findUndocumentedMethods([internal])).toEqual([])
	})
})

describe('one row per method, not per route', () => {
	const PERF = {
		summary: 'Times a call.',
		intents: ['time a hot function'],
		declaredAt: 'perf.types.ts:10',
	}
	const ROUTES = [
		entry({ path: 'q.perf.time', ...PERF }),
		entry({ path: 'tx.perf.time', ...PERF }),
		entry({ path: 'doc.perf.time', ...PERF }),
		entry({ path: 'project.perf.time', ...PERF }),
	]

	it('the same method on several roots → one intent row with the canonical path', () => {
		expect(renderIntentIndex(ROUTES).split('\n').slice(2)).toEqual([
			'| time a hot function | `doc.query.perf.time` |',
		])
	})

	it('the same method on several roots → one API row naming the other routes (a read on tx is implied)', () => {
		expect(renderApiIndex(ROUTES).split('\n').slice(2)).toEqual([
			'| `doc.query.perf.time` (also `doc.perf.time`, `project.perf.time`) | Times a call. | time a hot function |',
		])
	})

	it('the same method → documented once, so reported once', () => {
		expect(
			findUndocumentedMethods(ROUTES.map((route) => ({ ...route, summary: undefined }))),
		).toEqual(['`doc.query.perf.time` has no JSDoc summary'])
	})
})

describe('findQuotedSentences', () => {
	const testCases: Record<string, { entries: MethodEntry[]; expected: string[] }> = {
		'summary quoting four words → reported': {
			entries: [entry({ path: 'q.a.b', summary: 'Returns "the name of the bay" as given.' })],
			expected: [
				'`doc.query.a.b` summary quotes a sentence: rephrase it, generated pages republish JSDoc',
			],
		},
		'intent quoting four words in curly quotes → reported': {
			entries: [entry({ path: 'tx.a.b', intents: ['when “a bay holds no device” matters'] })],
			expected: ['`tx.a.b` intent quotes a sentence: rephrase it, generated pages republish JSDoc'],
		},
		'a short quoted token ("name") → not reported': {
			entries: [entry({ path: 'q.a.b', summary: 'Reads the "name" attribute.' })],
			expected: [],
		},
		'quotes inside inline code → not reported': {
			entries: [entry({ path: 'q.a.b', summary: 'Matches `a="one two three four"` exactly.' })],
			expected: [],
		},
	}

	for (const [title, testCase] of Object.entries(testCases)) {
		it(title, () => {
			expect(findQuotedSentences(testCase.entries)).toEqual(testCase.expected)
		})
	}
})
