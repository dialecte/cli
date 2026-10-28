import { listMembers } from './list-members.ts'

import { describe, expect, it } from 'vitest'

import type { MethodEntry } from '../discover.types.ts'
import type { Member } from './api-json.types.ts'

function entry(path: string, summary?: string): MethodEntry {
	return {
		path,
		summary,
		intents: summary ? [`use ${path}`] : [],
		signature: '() => void',
		example: undefined,
		definedInPackage: true,
		internal: false,
		declaredAt: undefined,
	}
}

const ENTRIES: MethodEntry[] = [
	entry('q.getTree', 'A subtree.'),
	entry('q.reference.buildElementPath', 'Path of an element.'),
	entry('q.reference.findReferencing', 'Who points at an element.'),
	entry('q.info.of', 'Title.'),
	entry('tx.addChild', 'Add a child.'),
	entry('tx.lifecycle.fork', 'Fork a document.'),
	entry('tx.lifecycle.extract.asd', 'Extract an ASD.'),
	entry('tx.lifecycle.extract.fsd', 'Extract an FSD.'),
	entry('tx.lifecycle.transplant.deep', 'Copy with types.'),
]

const testCases: { description: string; expression: string; expected: Member[] }[] = [
	{
		description: 'doc.query → its core methods and its namespaces, one line each',
		expression: 'doc.query',
		expected: [
			{ kind: 'method', name: 'getTree', summary: 'A subtree.', intents: ['use q.getTree'] },
			{ kind: 'group', name: 'info', methodCount: 1 },
			{ kind: 'group', name: 'reference', methodCount: 2 },
		],
	},
	{
		description: 'doc.query.reference → its verbs with summary and intents',
		expression: 'doc.query.reference',
		expected: [
			{
				kind: 'method',
				name: 'buildElementPath',
				summary: 'Path of an element.',
				intents: ['use q.reference.buildElementPath'],
			},
			{
				kind: 'method',
				name: 'findReferencing',
				summary: 'Who points at an element.',
				intents: ['use q.reference.findReferencing'],
			},
		],
	},
	{
		description: 'tx.lifecycle → its verbs and its nested groups',
		expression: 'tx.lifecycle',
		expected: [
			{
				kind: 'method',
				name: 'fork',
				summary: 'Fork a document.',
				intents: ['use tx.lifecycle.fork'],
			},
			{ kind: 'group', name: 'extract', methodCount: 2 },
			{ kind: 'group', name: 'transplant', methodCount: 1 },
		],
	},
	{
		description: 'a method itself → that method',
		expression: 'tx.addChild',
		expected: [
			{ kind: 'method', name: 'addChild', summary: 'Add a child.', intents: ['use tx.addChild'] },
		],
	},
	{ description: 'an unknown expression → nothing', expression: 'tx.history', expected: [] },
]

describe('listMembers', () => {
	for (const testCase of testCases)
		it(testCase.description, () => {
			expect(listMembers({ entries: ENTRIES, expression: testCase.expression })).toEqual(
				testCase.expected,
			)
		})
})
