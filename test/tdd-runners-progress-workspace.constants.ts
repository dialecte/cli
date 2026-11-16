/**
 * The files of the scratch mixed packages of the progress tests: a vitest file, a `node:test` file and a pytest file
 * in one package, each over a production stub of its own. Each test file is a whole document.
 */
import { ADD_FILE, ADD_STUB_TEXT } from './tdd-runners-node-workspace.constants.ts'
import {
	ADDER_FILE,
	ADDER_STUB_TEXT,
	PYTHON_PACKAGE_FILES,
} from './tdd-runners-python-workspace.constants.ts'

/**
 * The bound of a case that runs `tdd red` then `tdd green` over a scratch mixed package (a vitest run, a `node --test`
 * run and a pytest run each time): a guard against a hang, never a measure of speed. Five minutes is far above the
 * seconds a quiet machine takes and the minutes a loaded one takes.
 */
export const PROGRESS_SCENARIO_TIMEOUT = 300_000

export const SUM_FILE = 'src/sum.ts'
export const SUM_TEST_FILE = 'src/sum.test.ts'

/** `sum` as the implement station finds it, and as it ends up. */
export const SUM_STUB_TEXT =
	"export function sum(left: number, right: number): number {\n\tthrow new Error('not implemented: sum')\n}\n"
export const SUM_IMPLEMENTED_TEXT =
	'export function sum(left: number, right: number): number {\n\treturn left + right\n}\n'

/** One vitest case, `sum > one`. */
export const SUM_VITEST_TEST_TEXT = [
	"import { describe, expect, it } from 'vitest'",
	"import { sum } from './sum.ts'",
	"describe('sum', () => {",
	"\tit('one', () => {",
	'\t\texpect(sum(1, 2)).toBe(3)',
	'\t})',
	'})',
	'',
].join('\n')

/** A vitest config that throws when vitest loads it: a vitest run answers a failure. */
export const THROWING_VITEST_CONFIG_TEXT = [
	"throw new Error('config refused')",
	'export default {}',
	'',
].join('\n')

/** The python package's configuration files, with the vitest package's `package.json` kept. */
export const PYTHON_CONFIG_FILES = {
	'pyproject.toml': PYTHON_PACKAGE_FILES['pyproject.toml'],
	'.gitignore': `node_modules\n${PYTHON_PACKAGE_FILES['.gitignore']}`,
}

/** The three production stubs of a mixed package. */
export const MIXED_STUB_FILES = {
	[SUM_FILE]: SUM_STUB_TEXT,
	[ADD_FILE]: ADD_STUB_TEXT,
	[ADDER_FILE]: ADDER_STUB_TEXT,
}
