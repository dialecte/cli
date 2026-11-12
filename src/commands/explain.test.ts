import { join } from 'node:path'

import { RUN_FIXTURES } from '../../test/run/run-environment.constants.ts'
import { testProjectDirectory } from '../../test/run/run-environment.ts'
import { explainCommand } from './explain.ts'

import { describe, expect, it } from 'vitest'

async function invoke(
	argv: string[],
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
	const stdout: string[] = []
	const stderr: string[] = []
	const exitCode = await explainCommand({
		argv,
		cwd: testProjectDirectory(),
		output: { stdout: (text) => stdout.push(text), stderr: (text) => stderr.push(text) },
	})
	return { exitCode, stdout: stdout.join('\n'), stderr: stderr.join('\n') }
}

const CATALOGUES = join(RUN_FIXTURES, 'catalogues.constants.ts')

describe('dialecte explain', () => {
	type TestCase = {
		argv: string[]
		expected: (result: { exitCode: number; stdout: string; stderr: string }) => void
		only?: boolean
	}

	const testCases: Record<string, TestCase> = {
		'a core code → its key, message, when it is raised, the fix, the docs page': {
			argv: ['D3009', '--package', '@dialecte/core/test'],
			expected({ exitCode, stdout }) {
				expect(exitCode).toBe(0)
				expect(stdout.split('\n')[0]).toBe('D3009 XSI_TYPE_REQUIRED - error (core)')
				expect(stdout).toContain(
					'  The element is declared with an abstract type: name a type with xsi:type',
				)
				expect(stdout).toMatch(
					/\n {2}when: .+\n {2}fix: .+\n {2}docs: https:\/\/dialecte\.github\.io\/core\/api\/transaction#addchild/,
				)
			},
		},
		'no --package, a project without a dialecte → the core catalogue alone': {
			argv: ['D4004'],
			expected({ exitCode, stdout }) {
				expect(exitCode).toBe(0)
				expect(stdout.split('\n')[0]).toBe('D4004 CONCURRENT_TRANSACTION - error (core)')
			},
		},
		'a key → the same entry': {
			argv: ['xsi_type_required', '--package', '@dialecte/core/test'],
			expected({ exitCode, stdout }) {
				expect(exitCode).toBe(0)
				expect(stdout.split('\n')[0]).toBe('D3009 XSI_TYPE_REQUIRED - error (core)')
			},
		},
		"a dialecte's diagnostic code → its source, severity, family and explanation": {
			argv: ['unresolved-reference', '--package', CATALOGUES],
			expected({ exitCode, stdout }) {
				expect(exitCode).toBe(0)
				expect(stdout).toBe(
					[
						'unresolved-reference - warning reference diagnostic (widget, WIDGET_IMPORT_DIAGNOSTICS)',
						'  A reference names an element the file does not hold',
						'  when: The path a reference holds names no element of the file',
						'  fix: Import the file that holds the element',
						'  docs: https://example.test/widget/references',
					].join('\n'),
				)
			},
		},
		"a dialecte's error code, --json → the entry as data": {
			argv: ['W1001', '--package', CATALOGUES, '--json'],
			expected({ exitCode, stdout }) {
				expect(exitCode).toBe(0)
				expect(JSON.parse(stdout)).toEqual([
					{
						kind: 'error',
						catalogue: 'WIDGET_ERRORS',
						code: 'W1001',
						key: 'NAME_TAKEN',
						message: 'The name is already taken',
						explanation: { when: 'A sibling holds the name', fix: 'Pick another name' },
					},
				])
			},
		},
		'an unknown code → exit 1, the catalogues searched named': {
			argv: ['Z9999', '--package', CATALOGUES],
			expected({ exitCode, stdout }) {
				expect(exitCode).toBe(1)
				expect(stdout).toBe(
					'no code "Z9999" in the catalogues of core, WIDGET_ERRORS, WIDGET_IMPORT_DIAGNOSTICS',
				)
			},
		},
		'no code → exit 2 with the usage': {
			argv: ['--json'],
			expected({ exitCode, stderr }) {
				expect(exitCode).toBe(2)
				expect(stderr).toContain('usage: dialecte explain')
			},
		},
	}

	for (const [description, testCase] of Object.entries(testCases)) {
		const declare = testCase.only ? it.only : it
		declare(description, async () => {
			const result = await invoke(testCase.argv)
			testCase.expected(result)
		})
	}
})
