import { join } from 'node:path'

import { temporaryFolder, writeFiles } from '../../../test/scratch-repository.ts'
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

/** A pytest test file the cli never reads as TypeScript: the plugin says whether an error is in an assertion. */
const PYTHON_TEST_PATH = '/package/tests/test_add.py'
const PYTHON_TEST_TEXT = 'this is not typescript ((('

/** The raise of the stub in production code, and the line of the test function that called it. */
const PYTHON_STUB_FRAME = { file: '/package/adder.py', line: 2, column: 1 }
const PYTHON_TEST_FRAME = { file: PYTHON_TEST_PATH, line: 5, column: 1 }

/** Production code is every file outside a tests folder. */
function isPythonProductionFile(path: string): boolean {
	return !path.includes('/tests/')
}

/** The failure of an error pytest reported, its test file at `testPath` (the scratch package's own when given). */
function classifyPytest(params: {
	error: ReportedError
	atImport?: boolean
	testPath?: string
}): ReturnType<typeof classifyFailure> {
	return classifyFailure({
		error: params.error,
		testFile: { path: params.testPath ?? PYTHON_TEST_PATH, text: PYTHON_TEST_TEXT },
		atImport: params.atImport ?? false,
		isProductionFile: isPythonProductionFile,
	})
}

/** A package of one production module `gen`, a test helper `helpers` and a test file; answers the test file's path. */
function pythonPackageTestPath(): string {
	const root = temporaryFolder('dialecte-classify-')
	writeFiles({
		root,
		files: {
			'gen.py': 'def make():\n    return 1\n',
			'pkg/gen.py': 'def make():\n    return 2\n',
			'tests/helpers.py': 'def double(value):\n    return value * 2\n',
			'tests/test_add.py': PYTHON_TEST_TEXT,
		},
	})
	return join(root, 'tests', 'test_add.py')
}

describe('classifyFailure on the errors pytest reports', () => {
	it('a NotImplementedError with no message raised inside an assert, the plugin saying so → not-implemented, the test source never read', () => {
		expect(
			classifyPytest({
				error: {
					name: 'NotImplementedError',
					message: '',
					frames: [PYTHON_STUB_FRAME, PYTHON_TEST_FRAME],
					inAssertion: true,
				},
			}),
		).toMatchObject({ kind: 'not-implemented' })
	})

	it('a NotImplementedError carrying the stub message inside an assert, the plugin saying so → not-implemented', () => {
		expect(
			classifyPytest({
				error: {
					name: 'NotImplementedError',
					message: 'not implemented: add',
					frames: [PYTHON_STUB_FRAME, PYTHON_TEST_FRAME],
					inAssertion: true,
				},
			}),
		).toMatchObject({ kind: 'not-implemented' })
	})

	it('a NotImplementedError raised before the assert, the plugin saying it is not in one → not-implemented-outside-assertion', () => {
		expect(
			classifyPytest({
				error: {
					name: 'NotImplementedError',
					message: '',
					frames: [PYTHON_STUB_FRAME, PYTHON_TEST_FRAME],
					inAssertion: false,
				},
			}),
		).toMatchObject({ kind: 'not-implemented-outside-assertion' })
	})

	it('a NotImplementedError raised while the file loads → not-implemented-at-import', () => {
		expect(
			classifyPytest({
				error: { name: 'NotImplementedError', message: '', frames: [PYTHON_STUB_FRAME] },
				atImport: true,
			}),
		).toMatchObject({ kind: 'not-implemented-at-import' })
	})

	it('Failed: DID NOT RAISE from pytest.raises → assertion, its message kept', () => {
		expect(
			classifyPytest({
				error: { name: 'Failed', message: "DID NOT RAISE <class 'ValueError'>", frames: [] },
			}),
		).toMatchObject({ kind: 'assertion', message: "DID NOT RAISE <class 'ValueError'>" })
	})

	it('Failed: DID NOT WARN from pytest.warns → assertion', () => {
		expect(
			classifyPytest({
				error: {
					name: 'Failed',
					message: 'DID NOT WARN. No warnings of type UserWarning',
					frames: [],
				},
			}),
		).toMatchObject({ kind: 'assertion' })
	})

	it('any other Failed (pytest.fail called by the test) → error', () => {
		expect(
			classifyPytest({ error: { name: 'Failed', message: 'the data is missing', frames: [] } }),
		).toMatchObject({ kind: 'error' })
	})

	it("ImportError: cannot import name 'nope' while the file loads → missing-export", () => {
		expect(
			classifyPytest({
				error: {
					name: 'ImportError',
					message: "cannot import name 'nope' from 'adder' (/package/adder.py)",
					frames: [],
				},
				atImport: true,
			}),
		).toMatchObject({ kind: 'missing-export' })
	})

	it("AttributeError: module 'gen' has no attribute 'nope', gen a production module → missing-export", () => {
		expect(
			classifyPytest({
				error: {
					name: 'AttributeError',
					message: "module 'gen' has no attribute 'nope'",
					frames: [],
				},
				testPath: pythonPackageTestPath(),
			}),
		).toMatchObject({ kind: 'missing-export' })
	})

	it("AttributeError: module 'pkg.gen' has no attribute 'nope', pkg.gen resolving to pkg/gen.py in production → missing-export", () => {
		expect(
			classifyPytest({
				error: {
					name: 'AttributeError',
					message: "module 'pkg.gen' has no attribute 'nope'",
					frames: [],
				},
				testPath: pythonPackageTestPath(),
			}),
		).toMatchObject({ kind: 'missing-export' })
	})

	it("AttributeError: module 'other.gen' has no attribute 'nope', no other/gen.py though gen.py and pkg/gen.py exist → error", () => {
		expect(
			classifyPytest({
				error: {
					name: 'AttributeError',
					message: "module 'other.gen' has no attribute 'nope'",
					frames: [],
				},
				testPath: pythonPackageTestPath(),
			}),
		).toMatchObject({ kind: 'error' })
	})

	it("AttributeError: module 'os' has no attribute 'nope', os resolving to no file of the package → error", () => {
		expect(
			classifyPytest({
				error: {
					name: 'AttributeError',
					message: "module 'os' has no attribute 'nope'",
					frames: [],
				},
				testPath: pythonPackageTestPath(),
			}),
		).toMatchObject({ kind: 'error' })
	})

	it("AttributeError: module 'helpers' has no attribute 'nope', helpers a test helper → error", () => {
		expect(
			classifyPytest({
				error: {
					name: 'AttributeError',
					message: "module 'helpers' has no attribute 'nope'",
					frames: [],
				},
				testPath: pythonPackageTestPath(),
			}),
		).toMatchObject({ kind: 'error' })
	})

	it('an IndentationError while the file loads → syntax-error', () => {
		expect(
			classifyPytest({
				error: {
					name: 'IndentationError',
					message: 'unexpected indent (test_add.py, line 3)',
					frames: [],
				},
				atImport: true,
			}),
		).toMatchObject({ kind: 'syntax-error' })
	})

	it('a TabError while the file loads → syntax-error', () => {
		expect(
			classifyPytest({
				error: {
					name: 'TabError',
					message: 'inconsistent use of tabs and spaces in indentation (test_add.py, line 4)',
					frames: [],
				},
				atImport: true,
			}),
		).toMatchObject({ kind: 'syntax-error' })
	})

	it('a ValueError raised by production code inside an assert, the plugin saying so → error-in-production', () => {
		expect(
			classifyPytest({
				error: {
					name: 'ValueError',
					message: 'depth must be positive',
					frames: [PYTHON_STUB_FRAME, PYTHON_TEST_FRAME],
					inAssertion: true,
				},
			}),
		).toMatchObject({ kind: 'error-in-production' })
	})
})
