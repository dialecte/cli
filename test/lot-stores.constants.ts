/** The store list's place below the state folder, and the link a lot's worktree holds to its lot folder. */
export const STORE_LIST_SEGMENTS = ['dialecte', 'lot-stores'] as const
export const LOT_LINK_SEGMENTS = ['.dialecte', 'lot'] as const

/** The lot the folder-rule fixtures build. */
export const LOT_NAME = '0001-repo-branch'

/** The scope every fixture lot gets (the store's own checks are not under test here). */
export const FIXTURE_SCOPE = ['src/']

/** The ledger and the table head `lot finding` writes. */
export const LEDGER_TABLE_HEAD =
	'| id | round | severity | file:line | finding | state |\n|---|---|---|---|---|---|\n'

/** The `lot finding` arguments after the folder word. */
export const FINDING_TAIL = ['--round', '1', '--severity', 'blocking', '--at', 'a.ts:3', 'text']
