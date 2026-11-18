import { join } from 'node:path'

/** The folder holding the suite's refusing `gh`, put first on the PATH of every test and the commands it spawns. */
export const REFUSING_GH_FOLDER = join(import.meta.dirname, 'refusing-gh')

/** What the refusing `gh` writes on its error output, before the test's name. */
export const REFUSING_GH_TEXT =
	'the suite never runs the real gh: put a fake gh first on the PATH, or pass a fake host'

/** The variable the refusing `gh` reads its text from. */
export const REFUSING_GH_VARIABLE = 'DIALECTE_REFUSING_GH'

/** The variable the refusing `gh` reads the running test's name from. */
export const SUITE_TEST_VARIABLE = 'DIALECTE_SUITE_TEST'

/** The variable naming the file the refusing `gh` appends the running test's name to, one line per call. */
export const REFUSING_GH_CALLS_VARIABLE = 'DIALECTE_REFUSING_GH_CALLS'

/** The prefix of that file, in the suite's temporary folder (one per test file's worker context). */
export const REFUSING_GH_CALLS_PREFIX = 'refusing-gh-calls-'

/** The failure of a test that ran the refusing `gh`: `{test}` its name, `{count}` the calls. */
export const REFUSING_GH_FAILURE =
	'{test} ran gh {count} time(s): the suite never runs the real gh, put a fake gh first on the PATH, or pass a fake host'
