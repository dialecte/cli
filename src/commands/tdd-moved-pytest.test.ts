/**
 * A moved pytest case is refused: no own code is recorded for Python files, so the subset rule cannot compare its new
 * file; the line says what to do instead.
 */
import { renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { writeFiles } from '../../test/scratch-repository.ts'
import {
	ADD_ONE_PYTEST_TEXT,
	ADD_PYTEST_FILE,
	ADDER_FILE,
	ADDER_IMPLEMENTED_TEXT,
	ADDER_STUB_TEXT,
} from '../../test/tdd-runners-python-workspace.constants.ts'
import { createPythonPackage } from '../../test/tdd-runners-python-workspace.ts'
import { HELPER_SCENARIO_TIMEOUT } from '../../test/test-timing.constants.ts'
import { runTdd } from './tdd.ts'

import { describe, expect, it } from 'vitest'

const NOW = new Date('2026-11-17T12:00:00.000Z')

function tdd(params: { cwd: string; argv: string[] }) {
	return runTdd({ cwd: params.cwd, argv: params.argv, now: () => NOW })
}

describe('a moved pytest case', { timeout: HELPER_SCENARIO_TIMEOUT }, () => {
	it('proven red then green, its file renamed with a moved entry → refused: prove it red again, or accept it', async () => {
		const root = createPythonPackage({
			written: { [ADDER_FILE]: ADDER_STUB_TEXT, [ADD_PYTEST_FILE]: ADD_ONE_PYTEST_TEXT },
		})
		await tdd({ cwd: root, argv: ['red'] })
		writeFileSync(join(root, ADDER_FILE), ADDER_IMPLEMENTED_TEXT)
		await tdd({ cwd: root, argv: ['green'] })
		renameSync(join(root, ADD_PYTEST_FILE), join(root, 'tests/test_sum.py'))
		writeFiles({
			root,
			files: {
				'.dialecte/lot.json': JSON.stringify({
					moved: [{ from: ADD_PYTEST_FILE, to: 'tests/test_sum.py', reason: 'a rename' }],
				}),
			},
		})

		const red = await tdd({ cwd: root, argv: ['red'] })

		expect(red.output.split('\n')).toContain(
			`refused  tests/test_sum.py::test_one  moved from ${ADD_PYTEST_FILE}::test_one, but that red recorded no code of its file to compare with (a pytest file, or a red older than the record): prove it red again, or accept it with dialecte lot accept <case> <reason>`,
		)
	})
})
