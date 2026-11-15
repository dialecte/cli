import ts from 'typescript'

/** The spy calls of the test frameworks, as written (`vi.spyOn(target, 'method')`). */
export const SPY_CALLEES: readonly string[] = ['vi.spyOn', 'jest.spyOn']

/** The spy function a test may import by name from vitest. */
export const SPY_FUNCTION = 'spyOn'

/** A `transaction-spy` message: `{spied}` the target path and its method (`tx.addChild`). */
export const TRANSACTION_SPY_MESSAGE =
	'a spy on {spied} tests how the code writes: assert the outcome (error key, staged operations, documents)'

/** An `act-repeats-call` message for two or more call sites: `{unit}` the callee, `{count}` the call sites. */
export const ACT_REPEATS_CALL_MESSAGE =
	"`{unit}` called {count} times in one act: a verb's test makes the one call"

/** An `act-repeats-call` message for one call site in a loop body: `{unit}` the callee. */
export const ACT_CALL_IN_LOOP_MESSAGE =
	"`{unit}` called in a loop body in one act: a verb's test makes the one call"

/** The calls whose value is a captured state of the document or of a transaction (`act-snapshot`). */
export const SNAPSHOT_CALLEES: readonly string[] = [
	'getSnapshot',
	'getDocumentInfo',
	'getStagedOperations',
]

/** The deep copy a captured state may go through before it is compared (`structuredClone(info)`). */
export const CLONE_FUNCTION = 'structuredClone'

/** The assertion every matcher chain starts from: `expect(value)`, `expect.soft(value)`. */
export const EXPECT_CALLEES: readonly string[] = ['expect', 'expect.soft']

/** The matchers whose argument is the expected side of an equality. */
export const EQUALITY_MATCHERS: readonly string[] = ['toBe', 'toEqual', 'toStrictEqual']

/** The matchers that order two values. */
export const ORDER_MATCHERS: readonly string[] = [
	'toBeGreaterThanOrEqual',
	'toBeLessThanOrEqual',
	'toBeGreaterThan',
	'toBeLessThan',
]

/** The calls that take a regular expression as the pattern a value must match. */
export const PATTERN_MATCHERS: readonly string[] = ['toMatch', 'stringMatching']

/** The method of a regular expression that tests a value against it (`/re/.test(value)`). */
export const PATTERN_TEST_METHOD = 'test'

/** Eight hexadecimal digits in a character class (`[0-9a-f]{8}`, `[a-f0-9]{8}`, any case). */
export const UUID_BLOCK_PATTERN = /\[(?:0-9a-f|a-f0-9)\]\{8\}/i

/** A group of four hexadecimal digits after a dash and before the next one, the dash not consumed. */
export const UUID_GROUP_PATTERN = /-\[(?:0-9a-f|a-f0-9)\]\{4\}(?=-)/gi

/** How many dashed groups of four make a uuid shape. */
export const UUID_GROUP_COUNT = 2

/** The clock reads called by their path: `Date.now()`, `performance.now()`. */
export const CLOCK_CALLEES: readonly string[] = ['Date.now', 'performance.now']

/** The clock read made by construction: `new Date()` with no argument. */
export const CLOCK_CONSTRUCTOR = 'Date'

/** The operators that order two values in a comparison. */
export const COMPARISON_OPERATORS: readonly ts.SyntaxKind[] = [
	ts.SyntaxKind.LessThanToken,
	ts.SyntaxKind.LessThanEqualsToken,
	ts.SyntaxKind.GreaterThanToken,
	ts.SyntaxKind.GreaterThanEqualsToken,
]

/** How many asserted clock bindings make a time bracket. */
export const TIME_BRACKET_SIZE = 2

/** The `act-snapshot` message. */
export const ACT_SNAPSHOT_MESSAGE =
	'a captured state compared later: the behaviour is the call\'s outcome; "unchanged" is a case of its own only where it is the behaviour'

/** The `act-format-check` message for a uuid shape in a pattern. */
export const UUID_FORMAT_MESSAGE =
	"a uuid shape checked in a pattern: the format is the generator's own test; assert what the behaviour does with the id"

/** The `act-format-check` message for a time bracket. */
export const TIME_BRACKET_MESSAGE =
	"a time bracket asserted around the call: the clock is the timestamp writer's own test; assert what the behaviour does with the time"
