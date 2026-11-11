/** What the whole-suite cases of the scoped tests step share: a scratch package, the paths whose change runs everything. */

/** The test file of each module of the scratch package. */
export const SCRATCH_TEST_FILES = ['src/a.test.ts', 'src/b.test.ts'] as const

/** The setup file the scratch package's vitest config names. */
export const SETUP_FILE = 'test/setup.ts'

/** A vitest config naming that setup file. */
export const SCRATCH_VITEST_CONFIG = `export default { test: { setupFiles: ['./${SETUP_FILE}'] } }\n`

/** The files of the scratch package besides its tests and modules. */
export const SCRATCH_EXTRA_FILES = {
	'src/cli.ts': 'export const entry = 1\n',
	'vitest.config.ts': SCRATCH_VITEST_CONFIG,
	[SETUP_FILE]: 'globalThis.setupMark = 1\n',
	'src/notes.md': 'a file a test reads\n',
	'test/data.md': 'a file a test reads\n',
}

/**
 * The changed paths whose change makes the scoped step run the whole suite: the cli's entry, the vitest config, a
 * setup file, the package manifest, and a file under `src/` or `test/` no test can import (a note a test reads).
 */
export const WHOLE_SUITE_CHANGES: readonly { title: string; path: string }[] = [
	{ title: 'the cli entry', path: 'src/cli.ts' },
	{ title: 'the vitest config', path: 'vitest.config.ts' },
	{ title: 'a setup file', path: SETUP_FILE },
	{ title: 'the package manifest', path: 'package.json' },
	{ title: 'a note under src that a test reads', path: 'src/notes.md' },
	{ title: 'a note under test that a test reads', path: 'test/data.md' },
]
