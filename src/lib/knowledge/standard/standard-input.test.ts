import { standardFilesOf } from './standard-files-of.ts'
import { standardFoldersOf } from './standard-folders-of.ts'

import { describe, expect, it } from 'vitest'

import type { StandardEntry, StandardNamesAnswer } from './standard-input.types.ts'

function file(name: string): StandardEntry {
	return { name, kind: 'file' }
}

function folder(name: string): StandardEntry {
	return { name, kind: 'folder' }
}

/** The answer with the collision's names put in order, so a case does not depend on which came first. */
function orderedAnswer(answer: StandardNamesAnswer): unknown {
	return answer.kind === 'collision'
		? { kind: 'collision', names: [...answer.names].sort() }
		: answer
}

describe('standardFilesOf: the files of a standard folder', () => {
	const testCases: Record<string, { entries: StandardEntry[]; expected: StandardNamesAnswer }> = {
		'x.md and X.md → a collision naming both': {
			entries: [file('x.md'), file('X.md'), file('y.md')],
			expected: { kind: 'collision', names: ['X.md', 'x.md'] },
		},
		'hidden files, non-.md files and folders → skipped': {
			entries: [file('.hidden.md'), file('notes.txt'), folder('nested.md'), file('one.md')],
			expected: { kind: 'kept', kept: [{ id: 'alpha/one', name: 'one.md' }] },
		},
		'a file written in capitals → its id lowercased, .md removed': {
			entries: [file('Part-One.md')],
			expected: { kind: 'kept', kept: [{ id: 'alpha/part-one', name: 'Part-One.md' }] },
		},
		'a clean set → the kept ids in id order': {
			entries: [file('two.md'), file('one.md')],
			expected: {
				kind: 'kept',
				kept: [
					{ id: 'alpha/one', name: 'one.md' },
					{ id: 'alpha/two', name: 'two.md' },
				],
			},
		},
	}

	for (const [title, testCase] of Object.entries(testCases))
		it(title, () => {
			expect(
				orderedAnswer(standardFilesOf({ standardId: 'alpha', entries: testCase.entries })),
			).toEqual(testCase.expected)
		})
})

describe('standardFoldersOf: the standard folders of a root', () => {
	const testCases: Record<string, { entries: StandardEntry[]; expected: StandardNamesAnswer }> = {
		'Alpha and alpha → a collision naming both': {
			entries: [folder('Alpha'), folder('alpha'), folder('beta')],
			expected: { kind: 'collision', names: ['Alpha', 'alpha'] },
		},
		'hidden folders and files → skipped': {
			entries: [folder('.hidden'), file('notes.md'), folder('alpha')],
			expected: { kind: 'kept', kept: [{ id: 'alpha', name: 'alpha' }] },
		},
		'a folder written in capitals → its id lowercased': {
			entries: [folder('Alpha')],
			expected: { kind: 'kept', kept: [{ id: 'alpha', name: 'Alpha' }] },
		},
		'a clean set → the kept ids in id order': {
			entries: [folder('beta'), folder('alpha')],
			expected: {
				kind: 'kept',
				kept: [
					{ id: 'alpha', name: 'alpha' },
					{ id: 'beta', name: 'beta' },
				],
			},
		},
	}

	for (const [title, testCase] of Object.entries(testCases))
		it(title, () => {
			expect(orderedAnswer(standardFoldersOf({ entries: testCase.entries }))).toEqual(
				testCase.expected,
			)
		})
})
