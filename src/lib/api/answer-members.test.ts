import { answerMembers } from './answer-members.ts'

import { describe, expect, it } from 'vitest'

import type { MethodEntry } from '../discover.types.ts'

function entry(path: string, summary?: string): MethodEntry {
	return {
		path,
		summary,
		intents: [],
		signature: '() => void',
		example: undefined,
		definedInPackage: true,
		internal: false,
		declaredAt: undefined,
	}
}

const ENTRIES = [
	entry('tx.lifecycle.fork', 'Fork a document.'),
	entry('tx.lifecycle.extract.asd', 'Extract an ASD.'),
	entry('tx.lifecycle.extract.fsd'),
	entry('tx.reference.applyUuidRemap', 'Repoint references.'),
	entry('tx.history.undo', `Undo the last transaction. ${'Then more detail. '.repeat(3)}`),
	entry('tx.history.redo', `Redo ${'the transaction undone last, '.repeat(6)}and so on.`),
]

const testCases: {
	description: string
	expression: string
	json?: boolean
	expected: { output: string; exitCode: number }
}[] = [
	{
		description: 'a group → one line per method with its summary, then the nested groups',
		expression: 'tx.lifecycle',
		expected: {
			output: ['tx.lifecycle', '  fork()  Fork a document.', '  extract.  2 methods', ''].join(
				'\n',
			),
			exitCode: 0,
		},
	},
	{
		description: 'a method without JSDoc → its name alone',
		expression: 'tx.lifecycle.extract',
		expected: {
			output: ['tx.lifecycle.extract', '  asd()  Extract an ASD.', '  fsd()', ''].join('\n'),
			exitCode: 0,
		},
	},
	{
		description: 'a long summary → its first sentence, cut at 120 characters',
		expression: 'tx.history',
		expected: {
			output: [
				'tx.history',
				`  redo()  Redo ${'the transaction undone last, '.repeat(6)}`.slice(
					0,
					2 + 'redo()  '.length + 119,
				) + '…',
				'  undo()  Undo the last transaction.',
				'',
			].join('\n'),
			exitCode: 0,
		},
	},
	{
		description: 'nothing there → exit 1, the closest members one level up',
		expression: 'tx.lifecycl',
		expected: { output: 'nothing at tx.lifecycl - under tx: lifecycle\n', exitCode: 1 },
	},
	{
		description: '--json → the members as JSON',
		expression: 'tx.reference',
		json: true,
		expected: {
			output: `${JSON.stringify(
				{
					expression: 'tx.reference',
					members: [
						{ kind: 'method', name: 'applyUuidRemap', summary: 'Repoint references.', intents: [] },
					],
				},
				null,
				'\t',
			)}\n`,
			exitCode: 0,
		},
	},
]

describe('answerMembers', () => {
	for (const testCase of testCases)
		it(testCase.description, () => {
			expect(
				answerMembers({
					entries: ENTRIES,
					expression: testCase.expression,
					json: testCase.json ?? false,
				}),
			).toEqual(testCase.expected)
		})
})
