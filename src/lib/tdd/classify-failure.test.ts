import { classifyFailure } from './classify-failure.ts'

import { describe, expect, it } from 'vitest'

import type { FailureKind, ReportedError } from './tdd.types.ts'

const TEST_PATH = '/package/src/add.test.ts'

const TEST_TEXT = [
	"import { add, mul } from './add.ts'",
	"import { expect, it } from 'vitest'",
	"it('in an assertion', () => { expect(add(1, 2)).toBe(3) })",
	"it('before the assertion', () => { const sum = add(1, 2); expect(sum).toBe(3) })",
	"it('rejects', async () => { await expect(add(1, 2)).resolves.toBe(3) })",
	"it('without a matcher', () => { expect(add(1, 2)) })",
	"it('existing code throws', () => { expect(sum(undefined)).toBe(0) })",
	"it('existing code throws early', () => { const total = sum(undefined); expect(total).toBe(0) })",
	'',
].join('\n')

/** A frame in the test file at `line`, at the column where `call` starts on it. */
function frameAt(params: { line: number; call: string }) {
	const column = TEST_TEXT.split('\n')[params.line - 1].indexOf(params.call) + 1
	return { file: TEST_PATH, line: params.line, column }
}

const STUB_FRAME = { file: '/package/src/add.ts', line: 1, column: 59 }

/** Where existing production code threw. */
const PRODUCTION_FRAME = { file: '/package/src/sum.ts', line: 3, column: 12 }

function isProductionFile(path: string): boolean {
	return !path.includes('.test.') && !path.includes('/node_modules/')
}

type Case = { error: ReportedError; atImport?: boolean; kind: FailureKind; message?: string }

const CASES: Record<string, Case> = {
	'an AssertionError → assertion, its message kept': {
		error: {
			name: 'AssertionError',
			message: 'expected -1 to be 3 // Object.is equality',
			frames: [],
		},
		kind: 'assertion',
		message: 'expected -1 to be 3 // Object.is equality',
	},
	'the stub thrown inside expect(...) → not-implemented': {
		error: {
			name: 'Error',
			message: 'not implemented: add',
			frames: [STUB_FRAME, frameAt({ line: 3, call: 'add(1, 2)' })],
		},
		kind: 'not-implemented',
	},
	'the stub thrown inside an awaited expect(...).resolves → not-implemented': {
		error: {
			name: 'Error',
			message: 'not implemented: add',
			frames: [STUB_FRAME, frameAt({ line: 5, call: 'add(1, 2)' })],
		},
		kind: 'not-implemented',
	},
	'the stub thrown before the assertion → not-implemented-outside-assertion': {
		error: {
			name: 'Error',
			message: 'not implemented: add',
			frames: [STUB_FRAME, frameAt({ line: 4, call: 'add(1, 2)' })],
		},
		kind: 'not-implemented-outside-assertion',
	},
	'the stub thrown while the file loads → not-implemented-at-import': {
		error: { name: 'Error', message: 'not implemented: add', frames: [STUB_FRAME] },
		atImport: true,
		kind: 'not-implemented-at-import',
	},
	'the stub inside an expect(...) without a matcher → not-implemented-outside-assertion': {
		error: {
			name: 'Error',
			message: 'not implemented: add',
			frames: [STUB_FRAME, frameAt({ line: 6, call: 'add(1, 2)' })],
		},
		kind: 'not-implemented-outside-assertion',
	},
	'the stub, its test frame as a browser URL (/@fs/, a query) → not-implemented': {
		error: {
			name: 'Error',
			message: 'not implemented: add',
			frames: [
				STUB_FRAME,
				{
					...frameAt({ line: 3, call: 'add(1, 2)' }),
					file: `http://localhost:63315/@fs${TEST_PATH}?v=8f3a`,
				},
			],
		},
		kind: 'not-implemented',
	},
	'the stub, its test frame at a 0-based column (as chromium reports it) → not-implemented': {
		error: {
			name: 'Error',
			message: 'not implemented: add',
			frames: [
				STUB_FRAME,
				{
					...frameAt({ line: 3, call: 'add(1, 2)' }),
					column: frameAt({ line: 3, call: 'add(1, 2)' }).column - 1,
				},
			],
		},
		kind: 'not-implemented',
	},
	'a TypeError existing production code throws inside expect(...) → error-in-production (a red)': {
		error: {
			name: 'TypeError',
			message: "Cannot read properties of undefined (reading 'length')",
			frames: [PRODUCTION_FRAME, frameAt({ line: 7, call: 'sum(undefined)' })],
		},
		kind: 'error-in-production',
	},
	'any Error existing production code throws inside expect(...) → error-in-production (a red)': {
		error: {
			name: 'RangeError',
			message: 'depth must be positive',
			frames: [PRODUCTION_FRAME, frameAt({ line: 7, call: 'sum(undefined)' })],
		},
		kind: 'error-in-production',
	},
	'the same TypeError thrown before the assertion → type-error': {
		error: {
			name: 'TypeError',
			message: "Cannot read properties of undefined (reading 'length')",
			frames: [PRODUCTION_FRAME, frameAt({ line: 8, call: 'sum(undefined)' })],
		},
		kind: 'type-error',
	},
	'a snapshot that does not match → assertion': {
		error: { name: 'Error', message: 'Snapshot `add > sums 1` mismatched', frames: [] },
		kind: 'assertion',
	},
	'an imported name that is not a function → missing-export': {
		error: { name: 'TypeError', message: 'mul is not a function', frames: [] },
		kind: 'missing-export',
	},
	'an import of an export the module lacks → missing-export': {
		error: {
			name: 'SyntaxError',
			message: "The requested module './add.ts' does not provide an export named 'mul'",
			frames: [],
		},
		atImport: true,
		kind: 'missing-export',
	},
	'a local value that is not a function → type-error': {
		error: { name: 'TypeError', message: 'result.map is not a function', frames: [] },
		kind: 'type-error',
	},
	'a transform failure → syntax-error': {
		error: {
			name: 'Error',
			message: 'Transform failed with 1 error:\n\n[PARSE_ERROR] Expected a semicolon',
			frames: [],
		},
		atImport: true,
		kind: 'syntax-error',
	},
	'a test that ran out of time → timeout': {
		error: {
			name: 'Error',
			message: 'Test timed out in 100ms.\nIf this is a long-running test',
			frames: [],
		},
		kind: 'timeout',
	},
	'any other error → error': {
		error: { name: 'Error', message: 'ENOENT: no such file', frames: [] },
		kind: 'error',
	},
}

describe('classifyFailure', () => {
	for (const [name, testCase] of Object.entries(CASES))
		it(name, () => {
			expect(
				classifyFailure({
					error: testCase.error,
					testFile: { path: TEST_PATH, text: TEST_TEXT },
					atImport: testCase.atImport ?? false,
					isProductionFile,
				}),
			).toMatchObject({
				kind: testCase.kind,
				...(testCase.message && { message: testCase.message }),
			})
		})
})
