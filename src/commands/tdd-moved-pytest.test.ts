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

/** ADD_ONE_PYTEST_TEXT with a fixture named `test_input` returning `value`, which pytest never collects as a test. */
function fixtureTest(value: string): string {
	return `import pytest\n${ADD_ONE_PYTEST_TEXT}\n\n@pytest.fixture\ndef test_input():\n    return ${value}\n`
}

/** One parametrized case on literal rows, the parametrize call ending with `extra` (empty: nothing more). */
function parametrizedTest(extra: string): string {
	return [
		'import pytest',
		'',
		'from adder import add',
		'',
		'',
		`@pytest.mark.parametrize("left,right,total", [(1, 2, 3)]${extra})`,
		'def test_one(left, right, total):',
		'    assert add(left, right) == total',
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
				[MOVED_FILE]: inClass('@pytest.mark.usefixtures("monkeypatch")\n'),
				'.dialecte/lot.json': JSON.stringify({
					moved: [{ from: ADD_PYTEST_FILE, to: MOVED_FILE, reason: 'a rename' }],
				}),
			},
		})

		const red = await tdd({ cwd: root, argv: ['red'] })

		expect(red.output.split('\n')).toContainEqual(
			expect.stringMatching(
				/holds code the file that red froze did not: @pytest\.mark\.usefixtures\("monkeypatch"\)/,
			),
		)
	})

	it('a fixture named test_input changed in the move → refused: pytest never collects it, so it is own code', async () => {
		const root = createPythonPackage({
			written: { [ADDER_FILE]: ADDER_STUB_TEXT, [ADD_PYTEST_FILE]: fixtureTest('1') },
		})
		await tdd({ cwd: root, argv: ['red'] })
		writeFileSync(join(root, ADDER_FILE), ADDER_IMPLEMENTED_TEXT)
		await tdd({ cwd: root, argv: ['green'] })
		rmSync(join(root, ADD_PYTEST_FILE))
		writeFiles({
			root,
			files: {
				[MOVED_FILE]: fixtureTest('2'),
				'.dialecte/lot.json': JSON.stringify({
					moved: [{ from: ADD_PYTEST_FILE, to: MOVED_FILE, reason: 'a rename' }],
				}),
			},
		})

		const red = await tdd({ cwd: root, argv: ['red'] })

		expect(red.output.split('\n')).toContainEqual(
			expect.stringMatching(/holds code the file that red froze did not: @pytest\.fixture/),
		)
	})

	it('its parametrize gains scope= in the move, its rows unchanged → refused: the call differs', async () => {
		const root = createPythonPackage({
			written: { [ADDER_FILE]: ADDER_STUB_TEXT, [ADD_PYTEST_FILE]: parametrizedTest('') },
		})
		await tdd({ cwd: root, argv: ['red'] })
		writeFileSync(join(root, ADDER_FILE), ADDER_IMPLEMENTED_TEXT)
		await tdd({ cwd: root, argv: ['green'] })
		rmSync(join(root, ADD_PYTEST_FILE))
		writeFiles({
			root,
			files: {
				[MOVED_FILE]: parametrizedTest(', scope="module"'),
				'.dialecte/lot.json': JSON.stringify({
					moved: [{ from: ADD_PYTEST_FILE, to: MOVED_FILE, reason: 'a rename' }],
				}),
			},
		})

		const red = await tdd({ cwd: root, argv: ['red'] })

		expect(red.output.split('\n')).toContainEqual(
			expect.stringMatching(
				/^refused {2}tests\/test_sum\.py::test_one\[1-2-3\] {2}moved from .*but its test call differs/,
			),
		)
	})

	it('moved into a file the base holds, which keeps its own module-level const → carried: the base text is read', async () => {
		const existing = 'LIMIT = 9\n\n\ndef test_limit():\n    assert LIMIT == 9\n'
		const root = createPythonPackage({
			committed: { [MOVED_FILE]: existing },
			written: { [ADDER_FILE]: ADDER_STUB_TEXT, [ADD_PYTEST_FILE]: ADD_ONE_PYTEST_TEXT },
		})
		await tdd({ cwd: root, argv: ['red'] })
		writeFileSync(join(root, ADDER_FILE), ADDER_IMPLEMENTED_TEXT)
		await tdd({ cwd: root, argv: ['green'] })
		rmSync(join(root, ADD_PYTEST_FILE))
		writeFiles({
			root,
			files: {
				[MOVED_FILE]: `${ADD_ONE_PYTEST_TEXT}\n\n${existing}`,
				'.dialecte/lot.json': JSON.stringify({
					moved: [{ from: ADD_PYTEST_FILE, to: MOVED_FILE, reason: 'a merge' }],
				}),
			},
		})

		const red = await tdd({ cwd: root, argv: ['red'] })

		expect(red.output.split('\n')).toContainEqual(
			expect.stringMatching(/^red {6}tests\/test_sum\.py::test_one {2}moved from/),
		)
	})

	it('moved under another conftest, every conftest unchanged → refused naming the conftests', async () => {
		const root = createPythonPackage({
			committed: {
				'tests/one/conftest.py': 'import pytest\n\n\n@pytest.fixture\ndef side():\n    return 1\n',
				'tests/two/conftest.py': 'import pytest\n\n\n@pytest.fixture\ndef side():\n    return 2\n',
			},
			written: { [ADDER_FILE]: ADDER_STUB_TEXT, 'tests/one/test_add.py': ADD_ONE_PYTEST_TEXT },
		})
		await tdd({ cwd: root, argv: ['red'] })
		writeFileSync(join(root, ADDER_FILE), ADDER_IMPLEMENTED_TEXT)
		await tdd({ cwd: root, argv: ['green'] })
		rmSync(join(root, 'tests/one/test_add.py'))
		writeFiles({
			root,
			files: {
				'tests/two/test_sum.py': ADD_ONE_PYTEST_TEXT,
				'.dialecte/lot.json': JSON.stringify({
					moved: [{ from: 'tests/one/test_add.py', to: 'tests/two/test_sum.py', reason: 'a move' }],
				}),
			},
		})

		const red = await tdd({ cwd: root, argv: ['red'] })

		expect(red.output.split('\n')).toContainEqual(
			expect.stringMatching(
				/but its conftests differ from those of that red: tests\/two\/conftest\.py/,
			),
		)
	})
})
