/** What the tests of the landing's hook reuse share: the gate steps of the scratch package, its moved file, its lock. */
/** The hook steps of the landing package, in list order. */
export const LANDING_STEP_NAMES = ['check', 'build', 'tests'] as const

/** What the `tests` step reads in its `requires` file to pass. */
export const LANDING_TESTS_PASS = 'ok'
export const LANDING_TESTS_FAIL = 'broken'

/** The file main gains after the branch is cut, and the merge lot's message. */
export const LANDING_MOVED_FILE = 'docs/moved.md'
export const LANDING_MOVED_TEXT = 'moved\n'
export const LANDING_MOVED_MESSAGE = 'docs(moved): the base moves'
export const LANDING_MERGE_MESSAGE = 'merge: bring main in'

/** A hook that records the store variable it was handed, one line per run, in `{log}` (`unset` when absent). */
export const CHECK_STORE_PROBE = 'printf \'%s\\n\' "${DIALECTE_CHECK_STORE-unset}" >> {log}'

/** The landing line of a lot whose hook answered every step: each step reused from a run of a mode and time, none ran. */
export const ALL_REUSED_LANDING =
	/^ {2}hook: reused check \(\S+ \S+\), build \(\S+ \S+\), tests \(\S+ \S+\) · ran none$/

/** The landing line of a lot whose hook answered nothing and ran every step. */
export const ALL_RAN_LANDING = '  hook: reused none · ran check, build, tests'

/** Every line starting a landing line in a run's text. */
export const LANDING_LINE_START = '  hook: reused '
