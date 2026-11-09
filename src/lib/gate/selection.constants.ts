/** The environment, the selection file and the verdict wordings of a scoped gate step. */
import { HANDOVER_BASE_VARIABLES } from './gate-base.constants.ts'

/** What the gate hands a scoped step: its base, its tree, the changed-paths file and where to write the selection. */
export const GATE_SCOPE_VARIABLES = {
	base: 'DIALECTE_GATE_BASE',
	tree: 'DIALECTE_GATE_TREE',
	changed: 'DIALECTE_GATE_CHANGED',
	selection: 'DIALECTE_GATE_SELECTION',
} as const

/** The hand-over's variables for the `gate --hook` a commit starts: no step ever gets them. */
export const HANDOVER_VARIABLES: readonly string[] = Object.values(HANDOVER_BASE_VARIABLES)

/** The folder (in the system's temporary folder) of one gate run's changed file and selection paths. */
export const GATE_SCOPE_FOLDER_PREFIX = 'dialecte-gate-scope-'

/** The changed-paths file in that folder. */
export const CHANGED_FILE_NAME = 'changed'

/** The selection path of the `{index}`th scoped run in that folder. */
export const SELECTION_FILE_NAME = 'selection-{index}.json'

/** The one selection schema this cli reads. */
export const SELECTION_SCHEMA = 1

/** The largest selection file read, in bytes (1 MiB). */
export const SELECTION_MAX_BYTES = 1024 * 1024

/** A selected or skipped id. */
export const SELECTION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/

/** How many reasons of a selected id a result keeps; the rest are counted. */
export const SELECTION_REASONS_SHOWN = 20

/** A selection the step did not write, or wrote wrong: `{why}` says what. */
export const INVALID_SELECTION_REASON = 'scoped step wrote no valid selection ({why})'

/** Why a selection file is not valid, as `INVALID_SELECTION_REASON`'s `{why}` says it. */
export const INVALID_SELECTION_WHY = {
	missing: 'missing',
	tooLarge: 'too large: {bytes} bytes, at most 1 MiB',
	unreadable: 'unreadable: not JSON',
	notAnObject: 'unreadable: not a JSON object',
	schema: 'schema {schema}, expected 1',
	baseOrTree: '"base" and "tree" are strings',
	changed: '"changed" is no count',
	notAList: '"{field}" is no list',
	notAnEntry: 'an entry of "{field}" is no object',
	invalidId: 'invalid id {id}',
	duplicateId: 'duplicate id {id}',
	noReason: 'no reason for {id}',
	reasonNotString: 'a reason of {id} is no string',
	failing: 'failing',
} as const

/** A selection made against another base or tree than the gate's. */
export const OTHER_BASE_OR_TREE_REASON = 'the selection is of another base or tree'

/** A selection that judged another number of changed paths than the gate handed. */
export const OTHER_CHANGED_COUNT_REASON =
	'the selection judged {judged} changed paths, the gate handed {handed}'

/** The note of a scoped step that selected nothing. */
export const NOTHING_SELECTED_NOTE = 'nothing selected since {base} ({paths} changed)'

/** The path segment a declared failing file may not hold: it would leave the package. */
export const PARENT_SEGMENT = '..'

/** Two or more `/` in a row in a declared failing file: one `/`. */
export const REPEATED_SLASHES_PATTERN = /\/{2,}/g

/** A leading `./` of a declared failing file (after the slashes collapsed): dropped. */
export const LEADING_CURRENT_FOLDER_PATTERN = /^\.\//

/** Between two paths of the changed file, and after the last. */
export const NUL_BYTE = 0

/** The serial rerun of a scoped step selected other ids than its first run. */
export const RERUN_OTHER_IDS_REASON = 'the rerun selected {rerun}, the first run {first}'

/** How an empty id list reads in `RERUN_OTHER_IDS_REASON`. */
export const NO_IDS = 'nothing'

/** A scoped step run without a base and tree from its caller. */
export const NO_GATE_SCOPE_REASON = 'scoped step without a gate base: nothing to select against'
