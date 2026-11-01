import { parseInvocation } from './parse-invocation.ts'

import { describe, expect, it } from 'vitest'

import type { Invocation } from './parse-invocation.types.ts'

const COMMAND_NAMES = ['coverage', 'skills']

describe('parseInvocation', () => {
	const testCases: Record<string, { argv: string[]; expected: Invocation }> = {
		'no command → help': { argv: [], expected: { kind: 'help' } },
		'--help as the command → help': { argv: ['--help'], expected: { kind: 'help' } },
		'--help after a command and its options → help, nothing runs': {
			argv: ['skills', 'sync', '--copy', '--help'],
			expected: { kind: 'help' },
		},
		'-h after a command → help, nothing runs': {
			argv: ['coverage', '-h'],
			expected: { kind: 'help' },
		},
		'--help after an unknown command → help': {
			argv: ['nope', '--help'],
			expected: { kind: 'help' },
		},
		"-h after -- → the command's own word: run, -- and -h passed on": {
			argv: ['coverage', '--', '-h'],
			expected: { kind: 'run', command: 'coverage', argv: ['--', '-h'] },
		},
		'-h before -- → help, nothing runs': {
			argv: ['coverage', '-h', '--', 'x'],
			expected: { kind: 'help' },
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
