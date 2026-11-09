/** The test file split in the moved-cases scenarios, and the core-vocabulary names its cases carry. */
export const SPLIT_SOURCE_FILE = 'src/dd.test.ts'

export const VITEST_IMPORT = "import { describe, expect, it } from 'vitest'"

/** The top-level `it` source: imports, shared state, a hook around its calls. */
export const HOOKED_IMPORT = "import { beforeEach, expect, it } from 'vitest'"

export const HOOK_LINE = 'beforeEach(() => { state = 1 })'

/** The same hook written with other tokens, the same meaning. */
export const OTHER_HOOK_LINE = 'beforeEach(() => { state = 0 + 1 })'

/** The table data file, untouched by the table scenarios, and the helpers of the by-name scenarios. */
export const ROWS_FILE = 'test/rows.cases.ts'
export const CHECK_HELPER_FILE = 'test/check-row.ts'
export const LEG_HELPER_FILE = 'test/define-leg.ts'

/** The rows of the table: a name, a value and the leg that runs it. */
export const ROWS_TEXT = [
	'export const ROWS = [',
	"\t{ name: 'DD_1 keeps attribute a', value: 1, leg: 'a' },",
	"\t{ name: 'DD_2 keeps attribute a', value: 2, leg: 'a' },",
	"\t{ name: 'DD_3 keeps attribute a', value: 3, leg: 'b' },",
	"\t{ name: 'DD_4 keeps attribute a', value: 4, leg: 'b' },",
	"\t{ name: 'DD_5 keeps attribute a', value: 5, leg: 'c' },",
	"\t{ name: 'DD_6 keeps attribute a', value: 6, leg: 'c' },",
	']',
	'',
].join('\n')

/** The base's runner: a helper module registers each row, the test file only calls it in a loop. */
export const CHECK_HELPER_TEXT = [
	"import { expect, it } from 'vitest'",
	"import { ROWS } from './rows.cases.ts'",
	'export function checkRow(row: (typeof ROWS)[number]): void {',
	'\tit(row.name, () => { expect(row.value).toBeGreaterThan(0) })',
	'}',
	'',
].join('\n')

/** The legs' runner: registers the rows of a subset, a row under another name when `rename` gives one. */
export const LEG_HELPER_TEXT = [
	"import { expect, it } from 'vitest'",
	"import { ROWS } from './rows.cases.ts'",
	'export function defineLeg(params: { subset: number[]; rename?: Record<string, string> }): void {',
	'\tfor (const row of ROWS)',
	'\t\tif (params.subset.includes(row.value))',
	'\t\t\tit(params.rename?.[row.name] ?? row.name, () => { expect(row.value).toBeGreaterThan(0) })',
	'}',
	'',
].join('\n')

/** The base of the by-name scenarios: one file looping over every row through the helper. */
export const TABLE_BASE_FILE = 'src/dd-table.test.ts'

export const TABLE_BASE_TEXT = [
	VITEST_IMPORT,
	"import { checkRow } from '../test/check-row.ts'",
	"import { ROWS } from '../test/rows.cases.ts'",
	"describe('D', () => { for (const row of ROWS) checkRow(row) })",
	'',
].join('\n')

/** The two-project config of the multi-project scenario. */
export const TWO_PROJECTS_CONFIG = [
	"import { defineConfig } from 'vitest/config'",
	'export default defineConfig({ test: { projects: [',
	"\t{ test: { name: 'one', include: ['src/**/*.test.ts'] } },",
	"\t{ test: { name: 'two', include: ['src/**/*.test.ts'] } },",
	'] } })',
	'',
].join('\n')
