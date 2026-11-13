/** The vitest configs of the zero-case scenarios: the default config runs `src/`, the unit config runs `unit/`. */
export const DEFAULT_CONFIG = 'vitest.config.ts'
export const UNIT_CONFIG = 'vitest.unit.config.ts'

export const DEFAULT_CONFIG_TEXT = "export default { test: { include: ['src/**/*.test.ts'] } }\n"
export const UNIT_CONFIG_TEXT = "export default { test: { include: ['unit/**/*.test.ts'] } }\n"

/** The default config listing the unit config in its `projects`. */
export const LISTING_CONFIG_TEXT =
	"export default { test: { include: ['src/**/*.test.ts'], projects: ['./vitest.unit.config.ts'] } }\n"

/** A unit config whose include is a constant imported from another file: the reader cannot read it as a glob. */
export const CONSTANT_GLOB_CONFIG_TEXT =
	"import { UNIT_GLOB } from './test-globs.constants.ts'\nexport default { test: { include: [UNIT_GLOB] } }\n"
export const GLOB_CONSTANTS_FILE = 'test-globs.constants.ts'
export const GLOB_CONSTANTS_TEXT = "export const UNIT_GLOB = 'unit/**/*.test.ts'\n"

/** The test file only the unit config includes. */
export const UNIT_TEST = 'unit/a.test.ts'

/** The test file the default config includes. */
export const SRC_TEST = 'src/real.test.ts'

/** A spec of a non-vitest runner: no vitest config includes it, and it holds no vitest case. */
export const NON_VITEST_SPEC = 'e2e/flow.spec.ts'
export const NON_VITEST_SPEC_TEXT =
	'// a browser flow, run by another runner\nexport const flow = 1\n'

/** A helper registering a table's cases (so no test call of the file's own source names them) and the file using it. */
export const CASES_HELPER = 'src/run-cases.ts'
export const CASES_HELPER_TEXT = [
	"import { expect, it } from 'vitest'",
	'export function runCases(table: readonly (readonly [string, number])[]): void {',
	'\tfor (const [title, value] of table) it(title, () => { expect(value).toBe(2) })',
	'}',
	'',
].join('\n')
export const HELPER_CASES_TEST_TEXT = [
	"import { describe, it } from 'vitest'",
	"import { runCases } from './run-cases.ts'",
	"const TABLE = [['one is not two', 1], ['three is not two', 3]] as const",
	"describe('a table', () => {",
	'\trunCases(TABLE)',
	"\tit.todo('later')",
	'})',
	'',
].join('\n')

/** The suite of the scenarios' test files and the title of their one real case (it fails on an assertion). */
export const SUITE = 'a unit'
export const RED_TITLE = 'one is two → the numbers differ'

/** The refusal texts, as the spec words them. */
export const OTHER_CONFIG_REFUSAL =
	'ran no case: the file belongs to vitest.unit.config.ts, which the default config does not list (projects)'
export const NO_CASE_REFUSAL = 'ran no case of the file'
export const ALL_SKIPPED_REFUSAL = 'every case is skipped'
export const NOT_VITEST_LINE = 'not a vitest test file (no vitest config includes it)'
export const CANNOT_LIST = 'cannot list its cases'

/** A test file that does not parse. */
export const IMPORT_ASSERTION_TEXT =
	"import { describe, expect, it } from 'vitest'\nexpect(1).toBe(2)\ndescribe('a unit', () => {\n\tit('b', () => {})\n})\n"

export const SYNTAX_ERROR_TEXT = "import { it } from 'vitest'\nit('a', () => {\n"
