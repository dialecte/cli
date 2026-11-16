import type { NodeTestError } from '../src/lib/tdd/tdd-node-reporter.types.ts'

/** The folder the runs of the event streams started in. */
export const RUN_ROOT = '/work/demo'

/** The absolute paths of the test files of the event streams. */
export const FILE_A = '/work/demo/src/a.test.ts'
export const FILE_B = '/work/demo/src/b.test.ts'

/** What node wraps a failed test's own error in: the real error is `cause`. */
function wrapped(params: Pick<NodeTestError, 'cause' | 'failureType'>): NodeTestError {
	return { code: 'ERR_TEST_FAILURE', ...params }
}

/** An `assert.equal(1, 2)` failure: a V8 stack, the innermost frame first (a `fn (url:L:C)` frame, a bare `url:L:C` one). */
export const ASSERTION_ERROR: NodeTestError = wrapped({
	failureType: 'testCodeFailure',
	cause: {
		name: 'AssertionError',
		message: '1 == 2',
		stack: [
			'AssertionError [ERR_ASSERTION]: 1 == 2',
			'    at TestContext.<anonymous> (file:///work/demo/src/a.test.ts:4:28)',
			'    at file:///work/demo/src/helper.ts:9:3',
		].join('\n'),
	},
})

/** The stub thrown from production code called inside an assertion: its own frame, then the test's. */
export const STUB_ERROR: NodeTestError = wrapped({
	failureType: 'testCodeFailure',
	cause: {
		name: 'Error',
		message: 'not implemented: add',
		stack: [
			'Error: not implemented: add',
			'    at add (file:///work/demo/src/add.ts:2:9)',
			'    at TestContext.<anonymous> (file:///work/demo/src/a.test.ts:5:30)',
		].join('\n'),
	},
})

/** A test that ran out of time: node gives the message as a string cause. */
export const TIMEOUT_ERROR: NodeTestError = wrapped({
	failureType: 'testTimeoutFailure',
	cause: 'test timed out after 10ms',
})

/** What node reports for the test a file itself is when the file fails to load. */
export const FILE_FAILED_ERROR: NodeTestError = wrapped({
	failureType: 'testCodeFailure',
	cause: 'test failed',
})

/** A suite whose callback threw: the thrown error is the cause. */
export const DESCRIBE_THROWN_ERROR: NodeTestError = wrapped({
	failureType: 'testCodeFailure',
	cause: {
		name: 'Error',
		message: 'describe blew',
		stack:
			'Error: describe blew\n    at SuiteContext.<anonymous> (file:///work/demo/src/a.test.ts:2:32)',
	},
})

/** A suite failing only because a case under it failed. */
export const SUBTESTS_FAILED_ERROR: NodeTestError = wrapped({
	failureType: 'subtestsFailed',
	cause: '1 subtest failed',
})

/** The chunks node prints on stderr when a file imports an export its module lacks. */
export const MISSING_EXPORT_STDERR = [
	"file:///work/demo/src/b.test.ts:1\nimport { nope } from './x.ts'\n         ^^^^\n",
	"SyntaxError: The requested module './x.ts' does not provide an export named 'nope'\n",
	'    at #asyncInstantiate (node:internal/modules/esm/module_job:463:21)\n',
]
