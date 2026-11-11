/** The branch a merge hand-over's merge lot brings in. */
export const MERGE_BRANCH = 'feat/x'

/** The file the plain lot edits (tracked), the one it adds (untracked), and the one an ignore rule hides. */
export const EDITED_FILE = 'notes.txt'
export const ADDED_FILE = 'fresh.txt'
export const IGNORED_FILE = 'node_modules/ignored.txt'

/** The content of the edited file before and after the lot, and of the added and the ignored file. */
export const EDITED_BEFORE = 'notes\n'
export const EDITED_AFTER = 'notes, edited by the lot\n'
export const ADDED_CONTENT = 'a file the lot adds\n'
export const IGNORED_CONTENT = 'a file nobody commits\n'

/** The file a commit on top of the hand-over's `head` adds, and its content: part of the lot's change. */
export const COMMITTED_FILE = 'committed.txt'
export const COMMITTED_CONTENT = 'a change committed after head\n'

/** The branch of the numbered worktree. */
export const NUMBERED_BRANCH = 'feat/indexed'

/** The editor words the cases configure: one that is no executable anywhere, and the flag it is given. */
export const CONFIGURED_EDITOR_WORD = 'my-editor'
export const CONFIGURED_EDITOR_FLAG = '--wait'
export const CONFIGURED_EDITOR_VALUE = `${CONFIGURED_EDITOR_WORD} ${CONFIGURED_EDITOR_FLAG}`

/** The time the review hand-overs are written at. */
export const REVIEW_HANDOVER_NOW = new Date(2026, 10, 9, 12, 0, 0)

/** The changes the plain hand-over's lot makes. */
export const PLAIN_CHANGES: Readonly<Record<string, string>> = {
	'src/read.ts': 'export function read() {\n\treturn 1\n}\n',
}
