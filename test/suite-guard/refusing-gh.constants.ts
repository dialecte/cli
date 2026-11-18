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
