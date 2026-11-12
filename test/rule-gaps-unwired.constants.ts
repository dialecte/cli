/** What the tests of the unwired default steps share: the lines the gate prints for them, the scripts a package holds. */

/** The scripts a counting package defines, by default: those every default step of a full gate runs, but the skills check. */
export const DEFAULT_WIRED_SCRIPTS = ['check', 'build'] as const

/** Every script a default `gate --full` runs through npm. */
export const ALL_DEFAULT_SCRIPTS = ['check', 'skills:check', 'build'] as const

/**
 * Every npm script a default gate step or a default contrib step runs, each doing nothing: a scratch package that is
 * not about wiring holds them, so its default steps are wired and run as they always did.
 */
export const WIRED_DEFAULT_SCRIPTS: Readonly<Record<string, string>> = {
	check: 'true',
	'skills:check': 'true',
	build: 'true',
	'doc:build': 'true',
	'type-bench:check': 'true',
}

/** The step lines, as `dialecte gate` prints them (a mark as wide as the others, two spaces, the name, two spaces). */
export const NOT_RUN_LINE = '--    {name}  not run: a step of the list is not wired'
export const SKILLS_NOT_WIRED_FAIL_LINE = 'FAIL  skills  not wired (no npm script "skills:check")'
export const SKILLS_NOT_WIRED_SKIP_LINE = 'skip  skills  not wired (no npm script "skills:check")'
export const BUILD_NOT_WIRED_FAIL_LINE = 'FAIL  build  not wired (no npm script "build")'

/** The line a derived step the package has no script for leaves in a full or release run, today and after: no step, no failure. */
export const ABSENT_DERIVED_LINE = 'skip  type-narrowing  no npm script "type-narrowing"'

/** The steps the gate adds itself, that the lines of the steps leave out. */
export const GATE_OWN_STEPS = ['hygiene', 'tdd'] as const

/** The vitest summary the stand-in prints. */
export const STAND_IN_TEST_COUNT = '      Tests  4 passed (4)'
