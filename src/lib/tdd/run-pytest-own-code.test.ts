/**
 * The cli's pytest plugin reports each test module's own code: module-level statements and those of a test class body
 * (scoped by the class), imports once per binding by what they resolve to, never the test functions; given base texts,
 * the same reading of those texts.
 */
import {
	ADDER_FILE,
	ADDER_IMPLEMENTED_TEXT,
	PYTHON_RUN_CASE_TIMEOUT,
} from '../../../test/tdd-runners-python-workspace.constants.ts'
import { createPythonPackage } from '../../../test/tdd-runners-python-workspace.ts'
import { runPytestCases } from './run-pytest-cases.ts'

import { describe, expect, it } from 'vitest'

import type { ReportedModule } from './tdd.types.ts'

const OWN_CODE_FILE = 'tests/test_own.py'

/** A test file holding an import of two names, a module-level const and helper, test functions and a test class. */
const OWN_CODE_TEXT = [
	'import os',
	'from adder import add as plus, add',
	'',
	'LIMIT = 3',
	'',
	'',
	'def helper(value):',
	'    return value + 1',
	'',
	'',
	'def test_one():',
	'    assert plus(1, 2) == LIMIT',
	'',
	'',
	'class TestAdd:',
	'    SIDE = 2',
	'',
	'    def test_two(self):',
	'        assert add(self.SIDE, 1) == helper(2)',
	'',
].join('\n')

/** The same file at the base: SIDE at module level, no helper. */
const OWN_CODE_BASE_TEXT = [
	'import os',
	'',
	'SIDE = 2',
	'',
	'',
	'def test_one():',
	'    assert os.sep',
	'',
].join('\n')

/** The hash of the statement of `text` among `statements`. */
function hashOf(params: {
	statements: ReportedModule['ownCode']
	text: string
}): string | undefined {
	return params.statements?.find((statement) => statement.text === params.text)?.hash
}

/** The report's entry of the own-code file. */
function ownModuleOf(modules: ReportedModule[] | { failure: string }): ReportedModule | undefined {
	return 'failure' in modules
		? undefined
		: modules.find((module) => module.file.endsWith(OWN_CODE_FILE))
}

describe('the pytest plugin reports own code', { timeout: PYTHON_RUN_CASE_TIMEOUT }, () => {
	it('a module-level import, const and helper, test functions and a test class → one statement per binding and statement, the class const in it, no test function', async () => {
		const root = createPythonPackage({
			written: { [ADDER_FILE]: ADDER_IMPLEMENTED_TEXT, [OWN_CODE_FILE]: OWN_CODE_TEXT },
		})

		const modules = await runPytestCases({ root, files: [OWN_CODE_FILE], filter: 'all' })
		const module = ownModuleOf(modules)

		expect(module?.ownCode?.map((statement) => statement.text)).toEqual([
			'import os',
			'from adder import add as plus, add',
			'from adder import add as plus, add',
			'LIMIT = 3',
			'def helper(value):\n    return value + 1',
			'SIDE = 2',
		])
		expect(module?.ownCode?.every((statement) => /^[0-9a-f]{64}$/.test(statement.hash))).toBe(true)
	})

	it('the base text of the file given → its own code read the same way, a statement in another scope hashed apart', async () => {
		const root = createPythonPackage({
			written: { [ADDER_FILE]: ADDER_IMPLEMENTED_TEXT, [OWN_CODE_FILE]: OWN_CODE_TEXT },
		})

		const modules = await runPytestCases({
			root,
			files: [OWN_CODE_FILE],
			filter: 'all',
			baseTexts: { [OWN_CODE_FILE]: OWN_CODE_BASE_TEXT },
		})
		const module = ownModuleOf(modules)

		expect(module?.baseOwnCode?.map((statement) => statement.text)).toEqual([
			'import os',
			'SIDE = 2',
		])
		expect(hashOf({ statements: module?.baseOwnCode, text: 'import os' })).toBe(
			hashOf({ statements: module?.ownCode, text: 'import os' }),
		)
		expect(hashOf({ statements: module?.baseOwnCode, text: 'SIDE = 2' })).not.toBe(
			hashOf({ statements: module?.ownCode, text: 'SIDE = 2' }),
		)
	})
})
