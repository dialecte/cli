/**
 * The files of the scratch node packages of the node runner tests: a package of `node:test` files over a small
 * production module. Each test file is a whole document.
 */

/**
 * The bound of a case that runs `node --test` over a scratch package once (a scratch git repository, one node
 * process per test file): a guard against a hang, never a measure of speed. A run takes about a second on a quiet
 * machine and several at a load of 30-80 with other suites running; two minutes is far above both.
 */
export const NODE_RUN_CASE_TIMEOUT = 120_000

/**
 * The bound of a case that runs `tdd red`, `tdd green` or `tdd status` over a scratch node package (up to four
 * `node --test` runs and a few git commands): a guard against a hang, never a measure of speed. Such a case takes
 * a few seconds on a quiet machine and a minute at a load of 30-80; five minutes is far above both.
 */
export const TDD_RUNNERS_SCENARIO_TIMEOUT = 300_000

/** The package: an ES module package with no dependency, the cli's node reporter being the only tool a run needs. */
export const NODE_PACKAGE_FILES = {
	'package.json': `${JSON.stringify({ name: 'demo', type: 'module' }, null, '\t')}\n`,
	'.gitignore': 'node_modules\n',
}

export const ADD_FILE = 'src/add.ts'
export const ADD_TEST_FILE = 'src/add.test.ts'

/** `add` as the implement station finds it, as it ends up, and as an existing wrong code has it. */
export const ADD_STUB_TEXT =
	"export function add(left: number, right: number): number {\n\tthrow new Error('not implemented: add')\n}\n"
export const ADD_IMPLEMENTED_TEXT =
	'export function add(left: number, right: number): number {\n\treturn left + right\n}\n'
export const ADD_SUBTRACTING_TEXT =
	'export function add(left: number, right: number): number {\n\treturn left - right\n}\n'

/** One case, `add > one`, asserting through `assert.equal`. */
export const ADD_ONE_TEST_TEXT = [
	"import assert from 'node:assert'",
	"import { describe, it } from 'node:test'",
	"import { add } from './add.ts'",
	"describe('add', () => {",
	"\tit('one', () => {",
	'\t\tassert.equal(add(1, 2), 3)',
	'\t})',
	'})',
	'',
].join('\n')

/** Two cases, `add > one` and `add > two`, each asserting through `assert.equal`. */
export const ADD_TWO_TEST_TEXT = [
	"import assert from 'node:assert'",
	"import { describe, it } from 'node:test'",
	"import { add } from './add.ts'",
	"describe('add', () => {",
	"\tit('one', () => {",
	'\t\tassert.equal(add(1, 2), 3)',
	'\t})',
	"\tit('two', () => {",
	'\t\tassert.equal(add(2, 2), 4)',
	'\t})',
	'})',
	'',
].join('\n')

/** The stub's result kept in a constant before it is asserted. */
export const ADD_OUTSIDE_TEST_TEXT = [
	"import assert from 'node:assert'",
	"import { describe, it } from 'node:test'",
	"import { add } from './add.ts'",
	"describe('add', () => {",
	"\tit('one', () => {",
	'\t\tconst result = add(1, 2)',
	'\t\tassert.equal(result, 3)',
	'\t})',
	'})',
	'',
].join('\n')

/** An import of an export `add.ts` does not have. */
export const ADD_MISSING_EXPORT_TEST_TEXT = [
	"import assert from 'node:assert'",
	"import { describe, it } from 'node:test'",
	"import { multiply } from './add.ts'",
	"describe('add', () => {",
	"\tit('one', () => {",
	'\t\tassert.equal(multiply(1, 2), 2)',
	'\t})',
	'})',
	'',
].join('\n')

/** A describe whose callback throws before it registers its case. */
export const THROWING_DESCRIBE_TEST_TEXT = [
	"import { describe, it } from 'node:test'",
	"describe('add', () => {",
	"\tthrow new Error('describe blew')",
	"\tit('one', () => {})",
	'})',
	'',
].join('\n')

/** A case that outlives its own timeout. */
export const SLOW_TEST_TEXT = [
	"import { describe, it } from 'node:test'",
	"describe('add', () => {",
	"\tit('slow', { timeout: 10 }, async () => {",
	'\t\tawait new Promise((resolve) => setTimeout(resolve, 600))',
	'\t})',
	'})',
	'',
].join('\n')

/** A failing assertion on plain values, a passing case, a skip and a todo. */
export const MIXED_TEST_TEXT = [
	"import assert from 'node:assert'",
	"import { describe, it } from 'node:test'",
	"describe('add', () => {",
	"\tit('one', () => {",
	'\t\tassert.equal(1, 2)',
	'\t})',
	"\tit('two', () => {",
	'\t\tassert.equal(1, 1)',
	'\t})',
	"\tit.skip('three', () => {})",
	"\tit.todo('four')",
	'})',
	'',
].join('\n')

/** Cases of skips only. */
export const SKIPS_ONLY_TEST_TEXT = [
	"import { describe, it } from 'node:test'",
	"describe('add', () => {",
	"\tit.skip('one', () => {})",
	"\tit.skip('two', () => {})",
	'})',
	'',
].join('\n')

/** One stub case and one skip. */
export const ADD_ONE_AND_SKIP_TEST_TEXT = [
	"import assert from 'node:assert'",
	"import { describe, it } from 'node:test'",
	"import { add } from './add.ts'",
	"describe('add', () => {",
	"\tit('one', () => {",
	'\t\tassert.equal(add(1, 2), 3)',
	'\t})',
	"\tit.skip('later', () => {",
	'\t\tassert.equal(add(2, 2), 4)',
	'\t})',
	'})',
	'',
].join('\n')

/** Two cases made by one loop line. */
export const LOOP_TEST_TEXT = [
	"import assert from 'node:assert'",
	"import { it } from 'node:test'",
	"import { add } from './add.ts'",
	'for (const number of [1, 2]) it(`row ${number}`, () => assert.equal(add(number, number), 99))',
	'',
].join('\n')

/** The same loop, passing: for a run that reports the cases of a loop. */
export const PASSING_LOOP_TEST_TEXT = [
	"import { it } from 'node:test'",
	'for (const number of [1, 2]) it(`row ${number}`, () => {})',
	'',
].join('\n')

/** Cases two describes deep. */
export const NESTED_TEST_TEXT = [
	"import { describe, it } from 'node:test'",
	"describe('outer', () => {",
	"\tdescribe('inner', () => {",
	"\t\tit('deep', () => {})",
	'\t})',
	'})',
	'',
].join('\n')

/** Stub cases asserted through the test context (`t.assert`) and through a named binding of `node:assert/strict`. */
export const OTHER_ASSERTIONS_TEST_TEXT = [
	"import { deepStrictEqual } from 'node:assert/strict'",
	"import { describe, it } from 'node:test'",
	"import { add } from './add.ts'",
	"describe('add', () => {",
	"\tit('through the test context', (t) => {",
	'\t\tt.assert.equal(add(1, 2), 3)',
	'\t})',
	"\tit('through a named binding', () => {",
	'\t\tdeepStrictEqual(add(1, 2), 3)',
	'\t})',
	'})',
	'',
].join('\n')

/** Where the files of the run tests live. */
export const MIXED_TEST_FILE = 'src/mixed.test.ts'
export const SKIPS_ONLY_TEST_FILE = 'src/skips.test.ts'
export const LOOP_TEST_FILE = 'src/loop.test.ts'
export const NESTED_TEST_FILE = 'src/nested.test.ts'
export const SLOW_TEST_FILE = 'src/slow.test.ts'
export const THROWING_TEST_FILE = 'src/throwing.test.ts'
export const MISSING_TEST_FILE = 'src/not-there.test.ts'
