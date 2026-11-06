import { parseInvocation } from './parse-invocation.ts'

import { describe, expect, it } from 'vitest'

import type { Invocation } from './parse-invocation.types.ts'

const COMMAND_NAMES = ['coverage', 'skills']

describe('parseInvocation', () => {
	const testCases: Record<string, { argv: string[]; expected: Invocation }> = {
		'no command → the global help': { argv: [], expected: { kind: 'help', json: false } },
		'--help as the command → the global help': {
			argv: ['--help'],
			expected: { kind: 'help', json: false },
		},
		'--help --json → the global help as json': {
			argv: ['--help', '--json'],
			expected: { kind: 'help', json: true },
		},
		'--json --help → the global help as json, whatever the order': {
			argv: ['--json', '--help'],
			expected: { kind: 'help', json: true },
		},
		'--json after -- → a word of nobody: not asked': {
			argv: ['--help', '--', '--json'],
			expected: { kind: 'help', json: false },
		},
		"--help after a command and its options → that command's help, nothing runs": {
			argv: ['skills', 'sync', '--copy', '--help'],
			expected: { kind: 'help', command: 'skills', json: false },
		},
		"-h after a command → that command's help, nothing runs": {
			argv: ['coverage', '-h'],
			expected: { kind: 'help', command: 'coverage', json: false },
		},
		'--help after an unknown command → the global help': {
			argv: ['nope', '--help'],
			expected: { kind: 'help', json: false },
		},
		"-h after -- → the command's own word: run, -- and -h passed on": {
			argv: ['coverage', '--', '-h'],
			expected: { kind: 'run', command: 'coverage', argv: ['--', '-h'] },
		},
		"-h before -- → that command's help, nothing runs": {
			argv: ['coverage', '-h', '--', 'x'],
			expected: { kind: 'help', command: 'coverage', json: false },
		},
		'unknown command → unknown': {
			argv: ['nope', 'x'],
			expected: { kind: 'unknown', command: 'nope' },
		},
		'known command → run with the rest of the arguments': {
			argv: ['skills', 'check', '--workspace', '..'],
			expected: { kind: 'run', command: 'skills', argv: ['check', '--workspace', '..'] },
		},
	}

	for (const [title, testCase] of Object.entries(testCases)) {
		it(title, () => {
			expect(parseInvocation({ argv: testCase.argv, commandNames: COMMAND_NAMES })).toEqual(
				testCase.expected,
			)
		})
	}
})
