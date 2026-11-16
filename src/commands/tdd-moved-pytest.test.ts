/**
 * A moved pytest case carries its red under the subset rule, as a vitest one: the cli's pytest plugin reports each
 * test module's own code, recorded at the red and compared at the move.
 */
import { rmSync, writeFileSync } from 'node:fs'
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

const MOVED_FILE = 'tests/test_sum.py'

/** A package whose `test_one` was proven red then green, then moved to MOVED_FILE as `text` says, with its entry. */
async function movedPytestPackage(params: {
	text: string
	written?: Record<string, string>
}): Promise<string> {
	const root = createPythonPackage({
		written: { [ADDER_FILE]: ADDER_STUB_TEXT, [ADD_PYTEST_FILE]: ADD_ONE_PYTEST_TEXT },
	})
	await tdd({ cwd: root, argv: ['red'] })
	writeFileSync(join(root, ADDER_FILE), ADDER_IMPLEMENTED_TEXT)
	await tdd({ cwd: root, argv: ['green'] })
	rmSync(join(root, ADD_PYTEST_FILE))
	writeFiles({
		root,
		files: {
			...params.written,
			[MOVED_FILE]: params.text,
			'.dialecte/lot.json': JSON.stringify({
				moved: [{ from: ADD_PYTEST_FILE, to: MOVED_FILE, reason: 'a rename' }],
			}),
		},
	})
	return root
}

/** A test file whose one case sits in `class TestAdd`, the class written after `decorator` (empty: none). */
function inClass(decorator: string): string {
	return [
		'import pytest',
		'',
		'from adder import add',
		'',
		'',
		`${decorator}class TestAdd:`,
		'    def test_one(self):',
		'        assert add(1, 2) == 3',
		'',
	].join('\n')
}

describe('a moved pytest case', { timeout: HELPER_SCENARIO_TIMEOUT }, () => {
	it('proven red then green, its file renamed with a moved entry → red carries its red (flag moved)', async () => {
		const root = await movedPytestPackage({ text: ADD_ONE_PYTEST_TEXT })

		const red = await tdd({ cwd: root, argv: ['red'] })

		expect(red.output.split('\n')).toContain(
			`red      ${MOVED_FILE}::test_one  moved from ${ADD_PYTEST_FILE}::test_one  flags: moved`,
		)
	})

	it('its new file adds a module-level helper → refused naming it', async () => {
		const root = await movedPytestPackage({
			text: `${ADD_ONE_PYTEST_TEXT}\n\ndef helper():\n    return 1\n`,
		})

		const red = await tdd({ cwd: root, argv: ['red'] })

		expect(red.output.split('\n')).toContainEqual(
			expect.stringMatching(
				/^refused {2}tests\/test_sum\.py::test_one {2}moved from .*, but its file holds code the file that red froze did not: def helper\(\):/,
			),
		)
	})

	it('its new file imports add from another module → refused naming the import', async () => {
		const root = await movedPytestPackage({
			text: ADD_ONE_PYTEST_TEXT.replace('from adder import add', 'from other import add'),
			written: { 'other.py': ADDER_IMPLEMENTED_TEXT },
		})

		const red = await tdd({ cwd: root, argv: ['red'] })

		expect(red.output.split('\n')).toContainEqual(
			expect.stringMatching(/holds code the file that red froze did not: from other import add/),
		)
	})

	it('a relative import of the package, the file renamed inside it → carried', async () => {
		const relative = [
			'from adder import add',
			'from .helpers import EXPECTED',
			'',
			'',
			'def test_one():',
			'    assert add(1, 2) == EXPECTED',
			'',
		].join('\n')
		const root = createPythonPackage({
			written: {
				[ADDER_FILE]: ADDER_STUB_TEXT,
				'tests/pkg/__init__.py': '',
				'tests/pkg/helpers.py': 'EXPECTED = 3\n',
				'tests/pkg/test_add.py': relative,
			},
		})
		await tdd({ cwd: root, argv: ['red'] })
		writeFileSync(join(root, ADDER_FILE), ADDER_IMPLEMENTED_TEXT)
		await tdd({ cwd: root, argv: ['green'] })
		rmSync(join(root, 'tests/pkg/test_add.py'))
		writeFiles({
			root,
			files: {
				'tests/pkg/test_sum.py': relative,
				'.dialecte/lot.json': JSON.stringify({
					moved: [
						{ from: 'tests/pkg/test_add.py', to: 'tests/pkg/test_sum.py', reason: 'a rename' },
					],
				}),
			},
		})

		const red = await tdd({ cwd: root, argv: ['red'] })

		expect(red.output.split('\n')).toContainEqual(
			expect.stringMatching(/^red {6}tests\/pkg\/test_sum\.py::test_one {2}moved from/),
		)
	})

	it('its test class gains a decorator in the move → refused naming the class header', async () => {
		const root = createPythonPackage({
			written: { [ADDER_FILE]: ADDER_STUB_TEXT, [ADD_PYTEST_FILE]: inClass('') },
		})
		await tdd({ cwd: root, argv: ['red'] })
		writeFileSync(join(root, ADDER_FILE), ADDER_IMPLEMENTED_TEXT)
		await tdd({ cwd: root, argv: ['green'] })
		rmSync(join(root, ADD_PYTEST_FILE))
		writeFiles({
			root,
			files: {
				[MOVED_FILE]: inClass('@pytest.mark.usefixtures("tmp_path")\n'),
				'.dialecte/lot.json': JSON.stringify({
					moved: [{ from: ADD_PYTEST_FILE, to: MOVED_FILE, reason: 'a rename' }],
				}),
			},
		})

		const red = await tdd({ cwd: root, argv: ['red'] })

		expect(red.output.split('\n')).toContainEqual(
			expect.stringMatching(
				/holds code the file that red froze did not: @pytest\.mark\.usefixtures\("tmp_path"\)/,
			),
		)
	})
})
