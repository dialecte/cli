import {
	findStaleGeneratedKinds,
	findUnclosedGeneratedBlocks,
	renderCoreMethods,
	renderExtensionsTable,
	renderHooksTable,
	replaceGeneratedBlocks,
} from './generated-blocks.ts'

import { describe, expect, it } from 'vitest'

const METHOD_PATHS = [
	'q.getTree',
	'q.getAttributes',
	'q.any.getChild',
	'q.perf.start',
	'q.history.getSortedHitems',
	'q.reference.findRefsPointingTo',
	'tx.getTree',
	'tx.getAttributes',
	'tx.addChild',
	'tx.progress.plan',
	'tx.history.getSortedHitems',
	'tx.history.addEntry',
	'tx.reference.findRefsPointingTo',
	'tx.reference.applyUuidRemap',
	'tx.lifecycle.transplant.deep',
	'doc.transaction',
	'project.open',
]

describe('renderExtensionsTable', () => {
	it('extension groups → one row per namespace, writes listed once, core groups left out', () => {
		expect(renderExtensionsTable(METHOD_PATHS)).toBe(
			[
				'| Namespace | On `doc.query.<ns>` | On `tx.<ns>` (writes) |',
				'|---|---|---|',
				'| `history` | `getSortedHitems` | `addEntry` |',
				'| `lifecycle` | - | `transplant.deep` |',
				'| `reference` | `findRefsPointingTo` | `applyUuidRemap` |',
			].join('\n'),
		)
	})

	it('no extension group → a sentence instead of an empty table', () => {
		expect(renderExtensionsTable(['q.getTree', 'tx.addChild'])).toBe(
			'This package registers no extension.',
		)
	})
})

describe('renderCoreMethods', () => {
	it('ungrouped methods → query methods, then transaction-only methods', () => {
		expect(renderCoreMethods(METHOD_PATHS)).toBe(
			[
				'- Query (`doc.query`, also on `tx`): `getAttributes`, `getTree`',
				'- Transaction only (`tx`): `addChild`',
				'- Document: `transaction`',
				'- Project: `open`',
			].join('\n'),
		)
	})
})

describe('renderHooksTable', () => {
	it('hook folders → one row each, concern files listed', () => {
		expect(
			renderHooksTable({
				'after-created': ['private-wrapper.ts', 'ref-paths.ts'],
				io: ['io-hooks.ts'],
			}),
		).toBe(
			[
				'| Folder | Concern files |',
				'|---|---|',
				'| `after-created/` | `private-wrapper.ts`, `ref-paths.ts` |',
				'| `io/` | `io-hooks.ts` |',
			].join('\n'),
		)
	})

	it('no hook folder → a sentence instead of an empty table', () => {
		expect(renderHooksTable({})).toBe('This package has no hooks.')
	})
})

describe('replaceGeneratedBlocks', () => {
	const START = '<!-- dialecte-skills:generated extensions -->'
	const END = '<!-- /dialecte-skills:generated -->'

	const testCases = {
		'stale block → content replaced, markers kept': {
			markdown: `# Map\n${START}\nold table\n${END}\nafter`,
			expected: { markdown: `# Map\n${START}\nNEW\n${END}\nafter`, unknownKinds: [] },
		},
		'no block → unchanged': {
			markdown: '# Map',
			expected: { markdown: '# Map', unknownKinds: [] },
		},
		'start and end marker on one line → content written between them': {
			markdown: `${START}${END}\nafter`,
			expected: { markdown: `${START}\nNEW\n${END}\nafter`, unknownKinds: [] },
		},
		'block of an unknown kind → left as is and reported': {
			markdown: `<!-- dialecte-skills:generated verbs -->\nx\n${END}`,
			expected: {
				markdown: `<!-- dialecte-skills:generated verbs -->\nx\n${END}`,
				unknownKinds: ['verbs'],
			},
		},
	}

	for (const [title, testCase] of Object.entries(testCases)) {
		it(title, () => {
			expect(
				replaceGeneratedBlocks({ markdown: testCase.markdown, blocks: { extensions: 'NEW' } }),
			).toEqual(testCase.expected)
		})
	}
})

describe('findStaleGeneratedKinds', () => {
	const RENDERED = ['| Namespace | Reads |', '|---|---|', '| `history` | `getSortedHitems` |'].join(
		'\n',
	)
	const FORMATTED = [
		'',
		'| Namespace | Reads              |',
		'| --------- | ------------------ |',
		'| `history` | `getSortedHitems`  |',
		'',
	].join('\n')

	const testCases = {
		'block as rendered → fresh': { content: RENDERED, expected: [] },
		'block re-padded by the formatter → fresh': { content: FORMATTED, expected: [] },
		'block with another verb → stale': {
			content: RENDERED.replace('getSortedHitems', 'getLatestHitem'),
			expected: ['extensions'],
		},
	}

	for (const [title, testCase] of Object.entries(testCases)) {
		it(title, () => {
			const markdown = `<!-- dialecte-skills:generated extensions -->\n${testCase.content}\n<!-- /dialecte-skills:generated -->`
			expect(findStaleGeneratedKinds({ markdown, blocks: { extensions: RENDERED } })).toEqual(
				testCase.expected,
			)
		})
	}

	it('start and end marker on one line → stale (nothing generated yet)', () => {
		const markdown =
			'<!-- dialecte-skills:generated extensions --><!-- /dialecte-skills:generated -->'
		expect(findStaleGeneratedKinds({ markdown, blocks: { extensions: RENDERED } })).toEqual([
			'extensions',
		])
	})
})

describe('findUnclosedGeneratedBlocks', () => {
	const END = '<!-- /dialecte-skills:generated -->'
	const testCases = {
		'every block closed → none': {
			markdown: `<!-- dialecte-skills:generated hooks -->\nx\n${END}`,
			expected: [],
		},
		'a start marker without its end → reported (it would swallow the next block)': {
			markdown: `<!-- dialecte-skills:generated hooks -->\nx\n<!-- dialecte-skills:generated extensions -->\ny\n${END}`,
			expected: ['hooks'],
		},
	}

	for (const [title, testCase] of Object.entries(testCases)) {
		it(title, () => {
			expect(findUnclosedGeneratedBlocks(testCase.markdown)).toEqual(testCase.expected)
		})
	}
})

describe('findStaleGeneratedKinds, emphasis rewritten by a formatter', () => {
	const RENDERED = [
		'| Function | What it answers |',
		'|---|---|',
		'| `of` | The *scope* and **key** of it. |',
	].join('\n')

	function staleKindsOf(content: string): string[] {
		const markdown = `<!-- dialecte-skills:generated api -->\n${content}\n<!-- /dialecte-skills:generated -->`
		return findStaleGeneratedKinds({ markdown, blocks: { api: RENDERED } })
	}

	it('rendered *scope* and **key**, page _scope_ and __key__ → fresh', () => {
		expect(
			staleKindsOf(RENDERED.replace('*scope*', '_scope_').replace('**key**', '__key__')),
		).toEqual([])
	})

	it('rendered *scope*, page _scope_ only → fresh', () => {
		expect(staleKindsOf(RENDERED.replace('*scope*', '_scope_'))).toEqual([])
	})

	it('a real word change under rewritten emphasis (scope vs scopes) → stale', () => {
		expect(staleKindsOf(RENDERED.replace('*scope*', '_scopes_'))).toEqual(['api'])
	})
})
