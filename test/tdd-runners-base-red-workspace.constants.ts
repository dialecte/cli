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

/** The hint a refusal for passing on the base too ends with. */
export const LOT_ACCEPT_HINT_PATTERN = /lot accept <case> <reason>$/

/**
 * A production module reading an input git ignores (`data/values.json`): the lot's tree holds it, a base copy
 * (`git archive`) does not.
 */
export const TOTAL_FILE = 'src/total.ts'
export const TOTAL_TEXT = [
	"import { readFileSync } from 'node:fs'",
	'export function readTotal(): number {',
	"\treturn JSON.parse(readFileSync(new URL('../data/values.json', import.meta.url), 'utf8')).total",
	'}',
	'',
].join('\n')
export const IGNORED_VALUES_FILE = 'data/values.json'
export const IGNORED_VALUES_TEXT = '{ "total": 3 }\n'
export const IGNORING_VALUES_GITIGNORE_TEXT = 'node_modules\ndata/values.json\n'
/** The vitest case `add > one` over the module reading the git-ignored input. */
export const VITEST_TOTAL_TEST_TEXT = [
	"import { readTotal } from './total.ts'",
	"import { describe, expect, it } from 'vitest'",
	"describe('add', () => {",
	"\tit('one', () => {",
	'\t\texpect(readTotal()).toBe(3)',
	'\t})',
	'})',
	'',
].join('\n')

/**
 * A production module wording a missing file's error: the base's words it wrong, the lot's names ENOENT. An
 * assertion over it fails on the base with ENOENT in its message, a real red.
 */
export const MISSING_FILE_MESSAGE_FILE = 'src/message.ts'
export const MISSING_FILE_MESSAGE_BASE_TEXT =
	"export function missingFileMessage(): string {\n\treturn 'file found'\n}\n"
export const MISSING_FILE_MESSAGE_TEXT =
	"export function missingFileMessage(): string {\n\treturn 'ENOENT: no such file or directory'\n}\n"
/** The vitest case `add > one` asserting the message names ENOENT. */
export const VITEST_ENOENT_ASSERTION_TEST_TEXT = [
	"import { missingFileMessage } from './message.ts'",
	"import { describe, expect, it } from 'vitest'",
	"describe('add', () => {",
	"\tit('one', () => {",
	"\t\texpect(missingFileMessage()).toContain('ENOENT')",
	'\t})',
	'})',
	'',
].join('\n')

/** A vitest config written in TypeScript: Vite bundles it into a temporary folder beside its cache. */
export const VITEST_CONFIG_FILE = 'vitest.config.ts'
export const VITEST_CONFIG_TEXT = [
	"import { defineConfig } from 'vitest/config'",
	'export default defineConfig({})',
	'',
].join('\n')

/** `{log}`: an interpreter script appending the folder it runs from to this file, then running python3. */
export const FOLDER_LOGGING_INTERPRETER_TEMPLATE = '#!/bin/sh\npwd >> "{log}"\nexec python3 "$@"\n'

/**
 * The pytest package's configuration naming its project `demo`, and an interpreter in whose import path `demo` is
 * installed editable (a `.dist-info` with an editable `direct_url.json` and an `__editable__` path file, under the
 * git-ignored `.venv`).
 */
export const NAMED_PROJECT_TOML_TEXT =
	'[project]\nname = "demo"\nversion = "0.1"\n\n[tool.pytest.ini_options]\npythonpath = ["."]\ntestpaths = ["tests"]\n'
export const EDITABLE_DIST_FILES = {
	'.venv/site/demo-0.1.dist-info/METADATA': 'Metadata-Version: 2.1\nName: demo\nVersion: 0.1\n',
	'.venv/site/demo-0.1.dist-info/direct_url.json':
		'{"url": "file:///lot", "dir_info": {"editable": true}}\n',
	'.venv/site/demo-0.1.dist-info/RECORD': '__editable__.demo-0.1.pth,,\n',
	'.venv/site/__editable__.demo-0.1.pth': '/lot\n',
}
export const EDITABLE_INTERPRETER_TEXT =
	'#!/bin/sh\nPYTHONPATH="${PYTHONPATH:+$PYTHONPATH:}$(dirname "$0")/../site" exec python3 "$@"\n'

/**
 * A pytest configuration that puts nothing on the import path: the test imports the production module from the
 * folder pytest runs in.
 */
export const NO_PYTHONPATH_TOML_TEXT = '[tool.pytest.ini_options]\ntestpaths = ["tests"]\n'

/**
 * The lot's interpreter putting the lot's own folder (the root, two folders above `.venv/bin`) first on
 * `PYTHONPATH`, then running python3: the lot's production module is importable from any folder.
 */
export const LOT_FIRST_INTERPRETER_TEXT =
	'#!/bin/sh\nPYTHONPATH="$(cd "$(dirname "$0")/../.." && pwd)${PYTHONPATH:+:$PYTHONPATH}" exec python3 "$@"\n'

/** How old a leftover base-run folder is made: an hour before the run. */
export const LEFTOVER_AGE_MS = 3_600_000
