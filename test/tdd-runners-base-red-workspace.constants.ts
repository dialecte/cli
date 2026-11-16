/**
 * The files of the scratch packages of the base-red tests: a package whose base commit holds a wrong production
 * module (`add` subtracting), and a working tree holding the corrected production and the corrected test of the
 * case the lot revised. Each test file is a whole document.
 */

/**
 * The bound of a case that runs `tdd red` (and `tdd green`) over a scratch package with a run of the base's tree
 * on top: a guard against a hang, never a measure of speed. Five minutes is far above the seconds a quiet machine
 * takes and the minutes a loaded one takes.
 */
export const BASE_RED_SCENARIO_TIMEOUT = 300_000

/** Why the lot declares its cases revised. */
export const REVISION_REASON = 'the test was corrected before the first review'

/** The cases of the vitest and node files, and of the pytest file. */
export const ADD_CASE = 'src/add.test.ts::add > one'
export const ADD_SECOND_CASE = 'src/add.test.ts::add > two'
export const ADD_PYTEST_CASE = 'tests/test_add.py::test_one'

/** The helper the lot changes in the helper scenario. */
export const EXPECTED_FILE = 'test/expected.ts'
export const EXPECTED_BASE_TEXT = 'export const EXPECTED = -1\n'
export const EXPECTED_REVISED_TEXT = 'export const EXPECTED = 3\n'

/** The production the lot ends with when its test imports an export the base lacks. */
export const ADD_AND_MULTIPLY_TEXT = [
	'export function add(left: number, right: number): number {',
	'\treturn left + right',
	'}',
	'export function multiply(left: number, right: number): number {',
	'\treturn left * right',
	'}',
	'',
].join('\n')

/** The vitest case corrected: it expects the sum. */
export const VITEST_REVISED_TEST_TEXT = [
	"import { add } from './add.ts'",
	"import { describe, expect, it } from 'vitest'",
	"describe('add', () => {",
	"\tit('one', () => {",
	'\t\texpect(add(1, 2)).toBe(3)',
	'\t})',
	'})',
	'',
].join('\n')

/** The vitest case written against a helper. */
export const VITEST_HELPER_TEST_TEXT = [
	"import { add } from './add.ts'",
	"import { EXPECTED } from '../test/expected.ts'",
	"import { describe, expect, it } from 'vitest'",
	"describe('add', () => {",
	"\tit('one', () => {",
	'\t\texpect(add(1, 2)).toBe(EXPECTED)',
	'\t})',
	'})',
	'',
].join('\n')

/** The revised vitest case corrected once more: one more assertion. */
export const VITEST_CORRECTED_TEST_TEXT = [
	"import { add } from './add.ts'",
	"import { describe, expect, it } from 'vitest'",
	"describe('add', () => {",
	"\tit('one', () => {",
	'\t\texpect(add(1, 2)).toBe(3)',
	'\t\texpect(add(2, 2)).toBe(4)',
	'\t})',
	'})',
	'',
].join('\n')

/** A vitest case importing an export only the lot's production has. */
export const VITEST_NEW_EXPORT_TEST_TEXT = [
	"import { multiply } from './add.ts'",
	"import { describe, expect, it } from 'vitest'",
	"describe('add', () => {",
	"\tit('one', () => {",
	'\t\texpect(multiply(2, 3)).toBe(6)',
	'\t})',
	'})',
	'',
].join('\n')

/**
 * Two cases: `add > one` passes on the subtracting `add` and on the sum, `add > two` passes on the sum only.
 */
export const VITEST_TWO_CASES_TEST_TEXT = [
	"import { add } from './add.ts'",
	"import { describe, expect, it } from 'vitest'",
	"describe('add', () => {",
	"\tit('one', () => {",
	'\t\texpect(add(1, 0)).toBe(1)',
	'\t})',
	"\tit('two', () => {",
	'\t\texpect(add(1, 2)).toBe(3)',
	'\t})',
	'})',
	'',
].join('\n')

/** The node case, expecting the sum. */
export const NODE_REVISED_TEST_TEXT = [
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

/** The pytest case, expecting the sum. */
export const PYTEST_REVISED_TEST_TEXT = [
	'from adder import add',
	'',
	'',
	'def test_one():',
	'    assert add(1, 2) == 3',
	'',
].join('\n')

/**
 * `{log}`: a vitest file that appends a line to this file each time it is loaded, then holds one case
 * `add > one` expecting `{expected}` from `add(1, 2)`.
 */
export const LOGGING_VITEST_TEST_TEMPLATE = [
	"import { appendFileSync } from 'node:fs'",
	"import { add } from './add.ts'",
	"import { describe, expect, it } from 'vitest'",
	"appendFileSync('{log}', 'loaded\\n')",
	"describe('add', () => {",
	"\tit('one', () => {",
	'\t\texpect(add(1, 2)).toBe({expected})',
	'\t})',
	'})',
	'',
].join('\n')
