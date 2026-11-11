import { join } from 'node:path'

/** The entry the gate runs for its scoped tests step. */
export const SCOPED_TESTS_ENTRY = join(import.meta.dirname, 'scoped-tests.ts')

/** The variable that counts how deep scoped runs nest, and the one the scratch test writes its file path from. */
export const DEPTH_VARIABLE = 'DIALECTE_SCOPED_TESTS_DEPTH'
export const RECORD_VARIABLE = 'SCRATCH_DEPTH_RECORD'

/** What the scratch test records when the variable is not set. */
export const UNSET_RECORD = 'unset'

/** The line a refused nested start prints says this. */
export const NESTED_REFUSAL_PATTERN = /cannot start inside a scoped run nested twice/

/** The module and its test: the test records the depth variable it sees into the file named by `RECORD_VARIABLE`. */
export const SCRATCH_FILES = {
	'src/a.ts': "export const value = 'a'\n",
	'src/a.test.ts': [
		"import { writeFileSync } from 'node:fs'",
		"import { expect, it } from 'vitest'",
		"import { value } from './a.ts'",
		'',
		"it('a', () => {",
		`\twriteFileSync(process.env.${RECORD_VARIABLE} ?? '', process.env.${DEPTH_VARIABLE} ?? '${UNSET_RECORD}')`,
		"\texpect(value).toBe('a')",
		'})',
		'',
	].join('\n'),
}

/** The bound on the spawned entry: a guard against a hang, never a measure of speed. */
export const ENTRY_KILL_BOUND_MS = 120_000
