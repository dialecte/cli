/** What the tests of a record judged with the commands of the tree it checked share: the hook files, steps and lines. */
import { TEST_COUNT_LINE } from './scratch-checks.constants.ts'

import type { CardGateLine, RecordedStep } from '../src/lib/gate-records/gate-records.types.ts'
import type { GateStep } from '../src/lib/gate/gate-config.types.ts'

/** The commit hook of a worktree cut before main changed it: three lines. */
export const OLD_PRE_COMMIT = 'npm run check\nnpm run test:hook\nnpm run build'

/** The old hook with a line that stages files of its own. */
export const OLD_STAGING_PRE_COMMIT = `${OLD_PRE_COMMIT}\ngit add -u`

/** The commit hook main holds now: one line, which runs the gate's hook. */
export const MAIN_PRE_COMMIT = 'npm run test:hook'

/** The file the commit hook lives in, its name, and a plain hooks folder inside the repository. */
export const PRE_COMMIT_FILE = '.husky/pre-commit'
export const PRE_COMMIT_NAME = 'pre-commit'

/** A second husky hook script, as a branch may add it. */
export const COMMIT_MSG_FILE = '.husky/commit-msg'

/** The full gate of the card and hash scenarios: a check, then a test step, both unscoped, so both are hook steps. */
export const HOOK_TREE_STEPS: GateStep[] = [
	{ name: 'check', run: 'true' },
	{ name: 'tests', run: `printf '%s\\n' '${TEST_COUNT_LINE}'`, counts: 'tests' },
]

/** Another full gate, as a merged tree's package.json may hold it: a lint step more. */
export const OTHER_HOOK_TREE_STEPS: GateStep[] = [
	{ name: 'check', run: 'true' },
	{ name: 'lint', run: 'true' },
	{ name: 'tests', run: `printf '%s\\n' '${TEST_COUNT_LINE}'`, counts: 'tests' },
]

/** The times of the records of the card scenarios. */
export const OWN_GATE_TIME = '2026-11-15T10:00:00.000Z'
export const HOOK_TIME = '2026-11-15T11:00:00.000Z'

/** The counts of a hook's test step. */
export const HOOK_TREE_TEST_COUNTS = { tests: { passed: 3186, failed: 0, skipped: 4, total: 3190 } }

/** The steps of the commit hook's record: check, test:hook (counting tests), build. */
export const HOOK_RECORD_STEPS: RecordedStep[] = [
	{ name: 'check', status: 'passed', counts: {} },
	{ name: 'test:hook', status: 'passed', counts: HOOK_TREE_TEST_COUNTS },
	{ name: 'build', status: 'passed', counts: {} },
]

/** The steps of the worktree's own `gate --full` before the merge: tdd, check, build. */
export const OWN_GATE_RECORD_STEPS: RecordedStep[] = [
	{ name: 'tdd', status: 'passed', counts: {}, note: '12 case(s) of the change', cases: [] },
	{ name: 'check', status: 'passed', counts: {} },
	{ name: 'build', status: 'passed', counts: {} },
]

/** The card's lines of the hook's steps as a commit hook's record. */
export const HOOK_RECORD_LINES: CardGateLine[] = [
	{ name: 'check', status: 'passed', detail: 'commit hook' },
	{ name: 'build', status: 'passed', detail: 'commit hook' },
	{ name: 'test:hook', status: 'passed', detail: '3186 passed · 4 skipped · commit hook' },
]

/** The card's lines of the steps of a `gate --hook` run over `HOOK_TREE_STEPS` (the tests print four, all passing). */
export const HOOK_GATE_LINES: CardGateLine[] = [
	{ name: 'check', status: 'passed', detail: '' },
	{ name: 'tests', status: 'passed', detail: '4/4' },
]

/** The card wording when the gates of another tree are all there is. */
export const GATES_ON_ANOTHER_TREE = 'gates ran on another tree'

/** The merge lot's message of the scenarios. */
export const HOOK_TREE_MERGE_MESSAGE = 'merge: bring main in'

export const GITHOOKS_FOLDER = '.githooks'
export const GITHOOKS_PRE_COMMIT_FILE = '.githooks/pre-commit'
