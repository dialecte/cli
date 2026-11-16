import { isPythonCaseOfBase, isPythonCaseOfChange, pythonCaseHash } from './python-case.ts'

import { describe, expect, it } from 'vitest'

import type { PythonCaseSource } from './tdd.types.ts'

/** A test file as the base holds it: one parametrized method of a class, two rows. */
const BASE_TEXT = [
	'import pytest',
	'',
	'',
	'class TestRows:',
	'    @pytest.mark.parametrize("value", [1, 2])',
	'    def test_row(self, value):',
	'        assert value > 0',
	'',
].join('\n')

/** The same method copied into a second class: the file now holds the def line twice. */
const COPIED_TEXT = [
	'import pytest',
	'',
	'',
	'class TestRows:',
	'    @pytest.mark.parametrize("value", [1, 2])',
	'    def test_row(self, value):',
	'        assert value > 0',
	'',
	'',
	'class TestMore:',
	'    def test_row(self, value):',
	'        assert value > 0',
	'',
].join('\n')

/** The base holds a second parametrized function whose table has the row 5. */
const OTHER_TABLE_TEXT = [
	'import pytest',
	'',
	'',
	'class TestRows:',
	'    @pytest.mark.parametrize("value", [1, 2])',
	'    def test_row(self, value):',
	'        assert value > 0',
	'',
	'',
	'@pytest.mark.parametrize("size", [5, 6])',
	'def test_other(size):',
	'    assert size',
	'',
].join('\n')

/** A table whose element 10 holds the text of the row 1 without being it. */
const TENS_TEXT = [
	'import pytest',
	'',
	'',
	'class TestRows:',
	'    @pytest.mark.parametrize("value", [10, 2])',
	'    def test_row(self, value):',
	'        assert value > 0',
	'',
].join('\n')

/** Another parametrized function sits before `test_row` and holds the row 5 in its table. */
const BEFORE_TABLE_TEXT = [
	'import pytest',
	'',
	'',
	'@pytest.mark.parametrize("size", [5, 6])',
	'def test_other(size):',
	'    assert size',
	'',
	'',
	'class TestRows:',
	'    @pytest.mark.parametrize("value", [1, 2])',
	'    def test_row(self, value):',
	'        assert value > 0',
	'',
].join('\n')

/** A function with no parametrize at all. */
const PLAIN_TEXT = 'def test_plain():\n    assert 1 == 1\n'
const PLAIN_CALL = 'def test_plain():\n    assert 1 == 1'

/** A method marked slow above its parametrize table: the plugin's text of it keeps the mark, not the table. */
const SLOW_TABLE_TEXT = [
	'import pytest',
	'',
	'',
	'class TestRows:',
	'    @pytest.mark.slow',
	'    @pytest.mark.parametrize("value", [1, 2])',
	'    def test_row(self, value):',
	'        assert value > 0',
	'',
].join('\n')
const SLOW_ROW_CALL = '@pytest.mark.slow\ndef test_row(self, value):\n        assert value > 0'

/** The same method marked slow below its table, and a function the base marks slow beside an unmarked one. */
const SLOW_BELOW_TABLE_TEXT = [
	'import pytest',
	'',
	'',
	'class TestRows:',
	'    @pytest.mark.parametrize("value", [1, 2])',
	'    @pytest.mark.slow',
	'    def test_row(self, value):',
	'        assert value > 0',
	'',
].join('\n')
const SLOW_ELSEWHERE_TEXT = [
	'import pytest',
	'',
	'',
	'@pytest.mark.slow',
	'def test_other():',
	'    assert 2 == 2',
	'',
	'',
	'def test_plain():',
	'    assert 1 == 1',
	'',
].join('\n')
const SLOW_PLAIN_CALL = '@pytest.mark.slow\ndef test_plain():\n    assert 1 == 1'

/** A plain function under a skipif mark. */
const SKIPIF_TEXT = [
	'import pytest',
	'',
	'',
	'@pytest.mark.skipif(False, reason="never")',
	'def test_plain():',
	'    assert 1 == 1',
	'',
].join('\n')
const SKIPIF_CALL =
	'@pytest.mark.skipif(False, reason="never")\ndef test_plain():\n    assert 1 == 1'

/** A function under two patches, a then b (the order binds the mocks). */
const PATCHED_TEXT = [
	'from unittest.mock import patch',
	'',
	'',
	'@patch("a")',
	'@patch("b")',
	'def test_mocks(b, a):',
	'    assert a is not b',
	'',
].join('\n')
const PATCHED_BODY = 'def test_mocks(b, a):\n    assert a is not b'
const PATCHED_SWAPPED_CALL = `@patch("b")\n@patch("a")\n${PATCHED_BODY}`
const PATCHED_DUPLICATED_CALL = `@patch("a")\n@patch("a")\n@patch("b")\n${PATCHED_BODY}`

/** A plain function under a skip mark, as a base holds it. */
const SKIPPED_TEXT = [
	'import pytest',
	'',
	'',
	'@pytest.mark.skip(reason="later")',
	'def test_plain():',
	'    assert 1 == 1',
	'',
].join('\n')

const ROW_CALL = 'def test_row(self, value):\n        assert value > 0'
const ROW_NAME = 'TestRows > test_row[1]'
const ROW_SOURCE: PythonCaseSource = { call: ROW_CALL, row: '1' }

describe('pythonCaseHash', () => {
	it('a case → a sha256 in hexadecimal', () => {
		expect(pythonCaseHash({ name: ROW_NAME, source: ROW_SOURCE })).toMatch(/^[0-9a-f]{64}$/)
	})

	it('the same case with other indentation and runs of spaces → the same hash', () => {
		expect(
			pythonCaseHash({
				name: ROW_NAME,
				source: { call: 'def test_row(self, value):\n    assert    value > 0', row: '1' },
			}),
		).toBe(pythonCaseHash({ name: ROW_NAME, source: ROW_SOURCE }))
	})

	it('the function body edited → another hash', () => {
		expect(
			pythonCaseHash({
				name: ROW_NAME,
				source: { call: 'def test_row(self, value):\n        assert value > 1', row: '1' },
			}),
		).not.toBe(pythonCaseHash({ name: ROW_NAME, source: ROW_SOURCE }))
	})

	it('another row of the same function → another hash', () => {
		expect(
			pythonCaseHash({ name: 'TestRows > test_row[2]', source: { call: ROW_CALL, row: '2' } }),
		).not.toBe(pythonCaseHash({ name: ROW_NAME, source: ROW_SOURCE }))
	})

	it('the same function and row under another name → another hash', () => {
		expect(pythonCaseHash({ name: 'TestOther > test_row[1]', source: ROW_SOURCE })).not.toBe(
			pythonCaseHash({ name: ROW_NAME, source: ROW_SOURCE }),
		)
	})

	it('a name and a function text that share a boundary shifted by a character → another hash', () => {
		expect(pythonCaseHash({ name: 'a', source: { call: 'bc' } })).not.toBe(
			pythonCaseHash({ name: 'ab', source: { call: 'c' } }),
		)
	})
})

describe('isPythonCaseOfChange', () => {
	it('a row 0 the base table lacks, though the base body holds the text 0 → of change', () => {
		expect(
			isPythonCaseOfChange({ source: { call: ROW_CALL, row: '0' }, baseText: BASE_TEXT }),
		).toBe(true)
	})

	it('a row that is an element of another function table at the base → of change', () => {
		expect(
			isPythonCaseOfChange({ source: { call: ROW_CALL, row: '5' }, baseText: OTHER_TABLE_TEXT }),
		).toBe(true)
	})

	it('a row 1 where the base table holds 10 and 2 → of change, 1 is no element of it', () => {
		expect(
			isPythonCaseOfChange({ source: { call: ROW_CALL, row: '1' }, baseText: TENS_TEXT }),
		).toBe(true)
	})

	it('a row that is an element of the table of a function defined before the same function → of change', () => {
		expect(
			isPythonCaseOfChange({
				source: { call: ROW_CALL, row: '5' },
				baseText: BEFORE_TABLE_TEXT,
			}),
		).toBe(true)
	})

	it('a case without a row whose function text changed since the base → of change', () => {
		expect(
			isPythonCaseOfChange({
				source: { call: 'def test_plain():\n    assert 1 == 2' },
				baseText: PLAIN_TEXT,
			}),
		).toBe(true)
	})

	it('a case without a row whose function text the base holds → not of change', () => {
		expect(isPythonCaseOfChange({ source: { call: PLAIN_CALL }, baseText: PLAIN_TEXT })).toBe(false)
	})

	it('a file the base lacks → the case is of change', () => {
		expect(isPythonCaseOfChange({ source: ROW_SOURCE, baseText: undefined })).toBe(true)
	})

	it('the base holds the function text and the row → not of change', () => {
		expect(isPythonCaseOfChange({ source: ROW_SOURCE, baseText: BASE_TEXT })).toBe(false)
	})

	it('the function text changed since the base → of change', () => {
		expect(
			isPythonCaseOfChange({
				source: { call: 'def test_row(self, value):\n        assert value > 1', row: '1' },
				baseText: BASE_TEXT,
			}),
		).toBe(true)
	})

	it('a row the base table lacks, the function text unchanged → only that row is of change', () => {
		expect(
			isPythonCaseOfChange({ source: { call: ROW_CALL, row: '3' }, baseText: BASE_TEXT }),
		).toBe(true)
	})

	it('a row the base table holds, a row added beside it → that row is not of change', () => {
		expect(
			isPythonCaseOfChange({ source: { call: ROW_CALL, row: '2' }, baseText: BASE_TEXT }),
		).toBe(false)
	})

	it('a method marked slow above its table, the mark, the body and the row as the base holds them → not of change', () => {
		expect(
			isPythonCaseOfChange({
				source: { call: SLOW_ROW_CALL, row: '1' },
				baseText: SLOW_TABLE_TEXT,
			}),
		).toBe(false)
	})

	it('a method marked slow below its table, as the base holds it → not of change', () => {
		expect(
			isPythonCaseOfChange({
				source: { call: SLOW_ROW_CALL, row: '2' },
				baseText: SLOW_BELOW_TABLE_TEXT,
			}),
		).toBe(false)
	})

	it('a row the base table of a method marked slow lacks → of change', () => {
		expect(
			isPythonCaseOfChange({
				source: { call: SLOW_ROW_CALL, row: '3' },
				baseText: SLOW_TABLE_TEXT,
			}),
		).toBe(true)
	})

	it('a slow mark added to a method whose body and row the base holds → of change', () => {
		expect(
			isPythonCaseOfChange({ source: { call: SLOW_ROW_CALL, row: '1' }, baseText: BASE_TEXT }),
		).toBe(true)
	})

	it('a slow mark added to a function, the base marking another function slow → of change', () => {
		expect(
			isPythonCaseOfChange({ source: { call: SLOW_PLAIN_CALL }, baseText: SLOW_ELSEWHERE_TEXT }),
		).toBe(true)
	})

	it('a function under a skipif mark, as the base holds it → not of change', () => {
		expect(isPythonCaseOfChange({ source: { call: SKIPIF_CALL }, baseText: SKIPIF_TEXT })).toBe(
			false,
		)
	})

	it('two patches swapped since the base (patch a, b → b, a) → of change', () => {
		expect(
			isPythonCaseOfChange({ source: { call: PATCHED_SWAPPED_CALL }, baseText: PATCHED_TEXT }),
		).toBe(true)
	})

	it('a patch duplicated since the base → of change', () => {
		expect(
			isPythonCaseOfChange({ source: { call: PATCHED_DUPLICATED_CALL }, baseText: PATCHED_TEXT }),
		).toBe(true)
	})

	it('a skip mark removed since the base → of change', () => {
		expect(isPythonCaseOfChange({ source: { call: PLAIN_CALL }, baseText: SKIPPED_TEXT })).toBe(
			true,
		)
	})
})

describe('isPythonCaseOfBase', () => {
	it('a row 0 the base table lacks, though the base body holds the text 0 → not of the base', () => {
		expect(
			isPythonCaseOfBase({
				name: 'TestRows > test_row[0]',
				source: { call: ROW_CALL, row: '0' },
				text: BASE_TEXT,
				baseText: BASE_TEXT,
			}),
		).toBe(false)
	})

	it('a row that is an element of another function table at the base → not of the base', () => {
		expect(
			isPythonCaseOfBase({
				name: 'TestRows > test_row[5]',
				source: { call: ROW_CALL, row: '5' },
				text: OTHER_TABLE_TEXT,
				baseText: OTHER_TABLE_TEXT,
			}),
		).toBe(false)
	})

	it('a row 1 where the base table holds 10 and 2 → not of the base', () => {
		expect(
			isPythonCaseOfBase({
				name: ROW_NAME,
				source: ROW_SOURCE,
				text: TENS_TEXT,
				baseText: TENS_TEXT,
			}),
		).toBe(false)
	})

	it('a row that is an element of the table of a function defined before the same function → not of the base', () => {
		expect(
			isPythonCaseOfBase({
				name: 'TestRows > test_row[5]',
				source: { call: ROW_CALL, row: '5' },
				text: BEFORE_TABLE_TEXT,
				baseText: BEFORE_TABLE_TEXT,
			}),
		).toBe(false)
	})

	it('a case without a row, its def line in the base → of the base', () => {
		expect(
			isPythonCaseOfBase({
				name: 'test_plain',
				source: { call: PLAIN_CALL },
				text: PLAIN_TEXT,
				baseText: PLAIN_TEXT,
			}),
		).toBe(true)
	})

	it('the def line, the class and the row all in the base, the body edited since → of the base', () => {
		expect(
			isPythonCaseOfBase({
				name: ROW_NAME,
				source: { call: 'def test_row(self, value):\n        assert value > 1', row: '1' },
				text: BASE_TEXT,
				baseText: BASE_TEXT,
			}),
		).toBe(true)
	})

	it('a file the base lacks → not of the base', () => {
		expect(
			isPythonCaseOfBase({
				name: ROW_NAME,
				source: ROW_SOURCE,
				text: BASE_TEXT,
				baseText: undefined,
			}),
		).toBe(false)
	})

	it('a function the base does not define under that name → not of the base', () => {
		expect(
			isPythonCaseOfBase({
				name: 'TestRows > test_renamed[1]',
				source: { call: 'def test_renamed(self, value):\n        assert value > 0', row: '1' },
				text: BASE_TEXT,
				baseText: BASE_TEXT,
			}),
		).toBe(false)
	})

	it('a class the base does not hold → not of the base', () => {
		expect(
			isPythonCaseOfBase({
				name: 'TestOther > test_row[1]',
				source: ROW_SOURCE,
				text: BASE_TEXT,
				baseText: BASE_TEXT,
			}),
		).toBe(false)
	})

	it('a row the base table lacks → not of the base', () => {
		expect(
			isPythonCaseOfBase({
				name: 'TestRows > test_row[3]',
				source: { call: ROW_CALL, row: '3' },
				text: BASE_TEXT,
				baseText: BASE_TEXT,
			}),
		).toBe(false)
	})

	it('a row of a method marked slow above its table, the base holding the row → of the base', () => {
		expect(
			isPythonCaseOfBase({
				name: ROW_NAME,
				source: { call: SLOW_ROW_CALL, row: '1' },
				text: SLOW_TABLE_TEXT,
				baseText: SLOW_TABLE_TEXT,
			}),
		).toBe(true)
	})

	it('a function under a skipif mark, its def line in the base → of the base', () => {
		expect(
			isPythonCaseOfBase({
				name: 'test_plain',
				source: { call: SKIPIF_CALL },
				text: SKIPIF_TEXT,
				baseText: SKIPIF_TEXT,
			}),
		).toBe(true)
	})

	it('two patches swapped since the base → not of the base', () => {
		expect(
			isPythonCaseOfBase({
				name: 'test_mocks',
				source: { call: PATCHED_SWAPPED_CALL },
				text: PATCHED_TEXT,
				baseText: PATCHED_TEXT,
			}),
		).toBe(false)
	})

	it('a skip mark removed since the base → not of the base', () => {
		expect(
			isPythonCaseOfBase({
				name: 'test_plain',
				source: { call: PLAIN_CALL },
				text: PLAIN_TEXT,
				baseText: SKIPPED_TEXT,
			}),
		).toBe(false)
	})

	it('the base defines the function once, the file now defines it twice → not of the base', () => {
		expect(
			isPythonCaseOfBase({
				name: ROW_NAME,
				source: ROW_SOURCE,
				text: COPIED_TEXT,
				baseText: BASE_TEXT,
			}),
		).toBe(false)
	})
})
