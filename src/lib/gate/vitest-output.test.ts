/**
 * What a vitest run's output names (D1): failing files, failing keys and cases, ran keys, read from the lines vitest
 * prints under the gate's `NO_COLOR=1`.
 */
import { failingCasesOf, failingFilesOf, failingKeysOf, ranKeysOf } from './vitest-output.ts'

import { describe, expect, it } from 'vitest'

/** A failed run: two cases of one file, the same file failing in another project, a collect failure, a located line. */
const FAILED_RUN = [
	' ❯ |node| src/a.test.ts (3 tests | 2 failed) 12ms',
	' ✓ |node| src/b.test.ts (4 tests) 5ms',
	' ❯ |browser| src/a.test.ts (3 tests | 1 failed) 40ms',
	' ↓ src/skipped.test.ts (2 tests | 2 skipped)',
	' × src/c.test.ts (0 test)',
	'',
	'⎯⎯⎯⎯⎯⎯ Failed Suites 1 ⎯⎯⎯⎯⎯⎯⎯',
	' FAIL  src/c.test.ts [ src/c.test.ts ]',
	'Error: cannot import',
	'⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯⎯',
	' FAIL  |node| src/a.test.ts > group > two',
	'AssertionError: expected 1 to be 2',
	' FAIL  |node| src/a.test.ts > group > one',
	' FAIL  |node| src/a.test.ts > group > one',
	' FAIL  |browser| src/a.test.ts:12:3 > group > one [retry: 2]',
	'AssertionError: expected the gate output',
	'    FAIL  tests  exit 1  tests 3 passed, 1 failed / 4',
	' Test Files  3 failed | 1 passed | 1 skipped (5)',
	'      Tests  3 failed | 4 passed | 2 skipped (9)',
].join('\n')

describe('failingFilesOf', () => {
	it('a failed run → the failing files as paths in the output’s order, each once, no project (a rerun’s arguments)', () => {
		expect(failingFilesOf(FAILED_RUN)).toEqual([
			'src/c.test.ts',
			'src/a.test.ts',
			'src/a.test.ts:12:3',
		])
	})
})

describe('failingKeysOf', () => {
	it('a failed run → one key per project and file, a collect failure included, the location dropped, sorted, unique', () => {
		expect(failingKeysOf(FAILED_RUN)).toEqual([
			'src/c.test.ts',
			'|browser| src/a.test.ts',
			'|node| src/a.test.ts',
		])
	})

	it('a line that only starts with FAIL (a gate line in a diff) → no key', () => {
		expect(failingKeysOf('    FAIL  tests  exit 1  tests 3 passed, 1 failed / 4\n')).toEqual([])
	})
})

describe('failingCasesOf', () => {
	it('a failed run → each case as <key> > <path>, the retry marker and location dropped, sorted, unique; a collect failure names none', () => {
		expect(failingCasesOf(FAILED_RUN)).toEqual([
			'|browser| src/a.test.ts > group > one',
			'|node| src/a.test.ts > group > one',
			'|node| src/a.test.ts > group > two',
		])
	})
})

describe('ranKeysOf', () => {
	it('a run → the key of every module line, passed, failed or skipped, with or without a project, sorted, unique', () => {
		expect(ranKeysOf(FAILED_RUN)).toEqual([
			'src/c.test.ts',
			'src/skipped.test.ts',
			'|browser| src/a.test.ts',
			'|node| src/a.test.ts',
			'|node| src/b.test.ts',
		])
	})

	it('an output with no module line (a dot reporter, another runner) → no key', () => {
		expect(ranKeysOf('·····\n Test Files  2 passed (2)\n      Tests  5 passed (5)\n')).toEqual([])
	})
})
