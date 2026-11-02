/** What the tests of the check reuse share: bounds, wordings, the hook a scratch package runs. */

import { HANDOVER_CASE_TIMEOUT } from './test-timing.constants.ts'

/** The bound of a case that runs gates and hand-overs through scratch repositories: see HANDOVER_CASE_TIMEOUT. */
export const SCRATCH_REPOSITORY_TIMEOUT = HANDOVER_CASE_TIMEOUT

/** A gate whose tdd step really runs (a vitest package): the bound leaves room for it. */
export const TDD_GATE_TIMEOUT = 240_000

/** The cli writing a scratch hand-over: its script is never run. */
export const WRITER_CLI = '/opt/dialecte/dist/cli.js'

/** How many characters of a sha or tree the printed wordings and the card show. */
export const SHORT_SHA_LENGTH = 12

/** The record a commit's hook leaves in the git folder, and the one `gate --fast` leaves. */
export const HOOK_RECORD_FILE = 'dialecte-gate-hook.json'
export const FAST_RECORD_FILE = 'dialecte-gate-fast.json'
export const FULL_RECORD_FILE = 'dialecte-gate-full.json'

/** What a counting step and the scratch hook print: npm's step header and vitest's test count. */
export const TEST_COUNT_LINE = '      Tests  4 passed (4)'
export const HOOK_STEP_LINES = ['', '> demo@1.0.0 test:run', '> vitest run', TEST_COUNT_LINE]

/** A tree id: 40 hex characters. */
export const TREE_ID_PATTERN = /^[0-9a-f]{40}$/

/** The lot of the scratch package: its two changed files. */
export const READ_LOT = { paths: ['src/', 'CHANGELOG.md'], message: 'feat(read): read answers one' }

/** The branch a merge lot brings in. */
export const BRANCH_NAME = 'feat/x'

/** A package lock the lot can change without any package to install. */
export const PACKAGE_LOCK_BEFORE =
	'{\n\t"name": "demo",\n\t"version": "1.0.0",\n\t"lockfileVersion": 3,\n\t"packages": {}\n}\n'
export const PACKAGE_LOCK_AFTER =
	'{\n\t"name": "demo",\n\t"version": "1.0.1",\n\t"lockfileVersion": 3,\n\t"packages": {}\n}\n'
