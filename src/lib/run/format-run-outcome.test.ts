import { formatRunOutcome } from './format-run-outcome.ts'

import { describe, expect, it } from 'vitest'

import type { RunOutcome } from './run.types.ts'

describe('formatRunOutcome', () => {
	type TestCase = { outcome: RunOutcome; expected: string; only?: boolean }

	const testCases: Record<string, TestCase> = {
		'failed with a structured error → code, key, path, detail, then the operations': {
			outcome: {
				ok: false,
				error: {
					message: 'Value is already used within its scope',
					code: 'D3005',
					key: 'UNIQUE_CONSTRAINT_VIOLATION',
					detail: 'aAA_2 6 is taken',
					ref: { tagName: 'AA_2', id: 'x' },
					path: '/Root/A/AA_2[2]',
					meta: { value: '6' },
				},
				diagnostics: [],
				operations: { A: { created: 0, updated: 1, deleted: 0 } },
			},
			expected: [
				'failed: D3005 UNIQUE_CONSTRAINT_VIOLATION at /Root/A/AA_2[2]',
				'  aAA_2 6 is taken',
				'  meta {"value":"6"}',
				'  explain: dialecte explain D3005',
				'operations: A +0 ~1 -0',
				'diagnostics: none',
			].join('\n'),
		},
		'prepared, expectations failed, a diagnostic → each on its own lines': {
			outcome: {
				ok: false,
				diagnostics: [
					{
						code: 'unresolved-reference',
						severity: 'warning',
						source: 'scl',
						message: 'A reference names an element the file does not hold',
						ref: { tagName: 'FunctionRef', id: 'f1' },
					},
				],
				operations: {
					A: { created: 0, updated: 1, deleted: 0 },
					AA_2: { created: 1, updated: 0, deleted: 0 },
				},
				prepared: { label: 'add part', report: { added: 1 } },
				expectations: {
					passed: 1,
					failed: [
						{
							expectation: { tag: 'AA_2', count: 3 },
							actualCount: 2,
							message: 'expected 3 AA_2, found 2',
						},
					],
				},
			},
			expected: [
				'failed: expectations not met',
				'operations: A +0 ~1 -0, AA_2 +1 ~0 -0',
				'diagnostics: 1',
				'  warning scl/unresolved-reference on FunctionRef#f1: A reference names an element the file does not hold',
				'prepared: add part - staged, nothing committed',
				'  report {"added":1}',
				'expectations: 1 passed, 1 failed',
				'  ✗ expected 3 AA_2, found 2',
			].join('\n'),
		},
		'plain error, an export and a result → message, size, result': {
			outcome: {
				ok: false,
				error: { message: 'the script gave up' },
				diagnostics: [],
				operations: {},
				export: { bytes: 120 },
				result: 'abc',
			},
			expected: [
				'failed: the script gave up',
				'operations: none',
				'diagnostics: none',
				'export: 120 bytes',
				'result: "abc"',
			].join('\n'),
		},
		'no path, a result that was not JSON → the reason for each': {
			outcome: {
				ok: false,
				error: {
					message: 'Root element cannot be deleted',
					code: 'D3003',
					key: 'PROTECTED_ROOT',
					detail: 'Cannot delete root element',
					pathNote: 'the error names no element',
				},
				diagnostics: [],
				operations: {},
				prepared: {
					label: null,
					report: '[object Object]',
					reportNote: 'not JSON (cycle), given as text',
				},
				result: '12',
				resultNote: 'not JSON (BigInt), given as text',
			},
			expected: [
				'failed: D3003 PROTECTED_ROOT (the error names no element)',
				'  Cannot delete root element',
				'  explain: dialecte explain D3003',
				'operations: none',
				'diagnostics: none',
				'prepared: unlabelled transaction - staged, nothing committed',
				'  report "[object Object]" - not JSON (cycle), given as text',
				'result: "12" - not JSON (BigInt), given as text',
			].join('\n'),
		},
	}

	for (const [description, testCase] of Object.entries(testCases)) {
		const declare = testCase.only ? it.only : it
		declare(description, () => {
			expect(formatRunOutcome({ outcome: testCase.outcome })).toBe(testCase.expected)
		})
	}
})
