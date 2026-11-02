export const PACKAGE_NAME = 'demo-pkg'
export const SCOPE_FILE = 'src/engine/a.ts'
export const NEW_FILE = 'src/engine/new.ts'

/** Line 2 holds the one mutated expression, `x === 1`. */
export const SCOPE_SOURCE = 'export function pick(x: number) {\n\treturn x === 1\n}\n'
export const EDITED_SCOPE_SOURCE = 'export function pick(x: number) {\n\treturn x === 2\n}\n'
export const NEW_SOURCE = 'export const two = 2\n'

/** The location of `x === 1` on line 2 (columns count from 1). */
export const MUTANT_LOCATION = {
	start: { line: 2, column: 9 },
	end: { line: 2, column: 16 },
}

export const MUTANT_MUTATOR = 'ConditionalExpression'
export const MUTANT_ORIGINAL = 'x === 1'

export const LEGACY_RECORDS_FILE = 'scripts/mutants/equivalent-mutants.json'
export const RECORDS_FILE = '.dialecte/mutation-records.json'

/** The bound of a case that runs on small scratch folders and no repository: a guard against a hang, not a measure of speed. */
export const SMALL_CASE_TIMEOUT = 60_000
