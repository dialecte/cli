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

/** The second plain lot of a landing scenario: a new file, a file the base holds and the lot changes, its message. */
export const LANDING_SECOND_FILE = 'docs/two.md'
export const LANDING_SECOND_TEXT = 'two\n'
export const LANDING_NOTES_FILE = 'docs/notes.md'
export const LANDING_NOTES_BEFORE = 'notes base\n'
export const LANDING_NOTES_AFTER = 'notes two\n'
export const LANDING_SECOND_LOT = {
	paths: [LANDING_SECOND_FILE, LANDING_NOTES_FILE],
	message: 'docs(two): the second lot',
}

/**
 * A hook line logging, one line per run in `{log}`, what the tree the hook runs on holds of the second lot:
 * `present`/`absent` for its new file, then the first line of the notes file the lot changes.
 */
export const SECOND_FILE_PROBE = `echo "$(if [ -f ${LANDING_SECOND_FILE} ]; then echo present; else echo absent; fi) $(head -n 1 ${LANDING_NOTES_FILE})" >> {log}`

/** What the probe logs on a tree without, and with, the second lot. */
export const PROBE_WITHOUT_SECOND_LOT = 'absent notes base'
export const PROBE_WITH_SECOND_LOT = 'present notes two'

/** A later lot that deletes a file the base holds: the file, its base text, the lot. */
export const LANDING_DELETED_FILE = 'docs/old.md'
export const LANDING_DELETED_TEXT = 'old\n'
export const LANDING_DELETING_LOT = {
	paths: [LANDING_DELETED_FILE],
	message: 'docs(old): the old notes go',
}

/** A hook line logging, one line per run in `{log}`, whether the tree the hook runs on holds the deleted file. */
export const DELETED_FILE_PROBE = `echo "old $(if [ -f ${LANDING_DELETED_FILE} ]; then echo present; else echo absent; fi)" >> {log}`

/** What the probe logs on a tree holding the deleted file, and on one without it. */
export const PROBE_DELETED_PRESENT = 'old present'
export const PROBE_DELETED_ABSENT = 'old absent'

/** The word a hand-over run names each lot with in its lines, before the lot's number. */
export const LOT = 'lot'
