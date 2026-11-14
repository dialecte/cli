import { STORE_FILES } from '../store/store.constants.ts'

import type { Effort, RiskClass } from './risk.types.ts'

/** The file of a lot folder (or hand-over folder) that holds the risk lines: the store's `risk` file. */
export const RISK_FILE = STORE_FILES.risk

/** The line of an effort below the risk class, printed by `lot risk` and `lot status`: its go-ahead last. */
export const RISK_EFFORT_BELOW_LINE = '! effort {effort} below risk class {class}{goAhead}'

/** The go-ahead of an effort below the class: who recorded the effort line and why (33L1 D30). */
export const RISK_GO_AHEAD_PART = ' (by {by}: {reason})'

/** An effort below the class with no reason recorded: an effort line without one, or the identity's effort alone. */
export const RISK_NO_GO_AHEAD_PART = ' (no go-ahead recorded)'

/** The last line of a command whose derivation could not run (33L1 D26): nothing appended, never a refusal. */
export const RISK_NOT_DERIVED_LINE = '! risk class not derived: {reason}'

/** The `source` of `lot status`'s effort when an effort line is current (33L1 D25). */
export const RISK_LINE_SOURCE = 'risk-line'

/** The version of a `risk.jsonl` line. */
export const RISK_SCHEMA = 1

/** The most bytes a `risk.jsonl` line may hold (one atomic append). */
export const RISK_LINE_LIMIT = 4_096

/** The risk classes, lowest first. */
export const RISK_CLASSES: readonly RiskClass[] = ['light', 'medium', 'high']

/** The class of each effort: low is light, medium is medium, high is high. */
export const CLASS_OF_EFFORT: Record<Effort, RiskClass> = {
	low: 'light',
	medium: 'medium',
	high: 'high',
}

/** The kinds of a reason line of a `derived` line; `more` closes a list that did not fit the line limit. */
export const RISK_REASON_KINDS = [
	'declared',
	'destructive',
	'api',
	'broad-scope',
	'size',
	'docs',
	'more',
] as const

/** The word a declared reason prints after its file, before its glob when the glob is not the file itself. */
export const RISK_DECLARED_WORD = 'declared'

/** Where a `derived` line was made. */
export const RISK_DERIVED_FROM = ['start', 'snapshot', 'handover-write'] as const

/** Extensions of the source files whose added lines are scanned for a destructive call. */
export const RISK_SCANNED_EXTENSIONS: readonly string[] = [
	'.ts',
	'.tsx',
	'.js',
	'.jsx',
	'.mjs',
	'.cjs',
	'.mts',
	'.cts',
]

/** A test file: `*.test.*`, or any file under a `test/` folder; never scanned. */
export const RISK_TEST_FILE_PATTERN = /(^|\/)test\/|\.test\.[^/]*$/

/**
 * An added line that is a comment alone (its first non-blank characters `//`, `/*` or `*`): never scanned for a
 * destructive call. A code line with a trailing comment is scanned whole.
 */
export const RISK_COMMENT_LINE_PATTERN = /^\s*(?:\/\/|\/\*|\*)/

/** Files that are light whatever their size: the changelog and any Markdown page. */
export const RISK_DOCS_FILE_PATTERN = /\.md$/

/** The manifest whose version-only change is light. */
export const RISK_PACKAGE_FILE = 'package.json'

/** The lockfile, light whatever its size. */
export const RISK_LOCK_FILE = 'package-lock.json'

/** The most added and removed lines of the other files a light diff holds. */
export const RISK_LIGHT_LINE_LIMIT = 40

/** The most other files a light diff holds. */
export const RISK_LIGHT_FILE_LIMIT = 3

/** The `detail` of an `api` reason, by api change. */
export const RISK_API_DETAILS = {
	changed: 'the api index changed',
	unknown: 'the api change is unknown: no index read against the base',
} as const

/** A hunk header of a `-U0` diff: the first new line and the new line count (1 when left out). */
export const HUNK_HEADER_PATTERN = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/

/** The start of a diff header naming a file's new path. */
export const DIFF_NEW_PATH_PREFIX = '+++ b/'

/** The tab git writes after the path of a diff header when the path holds a space (33L1 D30). */
export const DIFF_PATH_END_PATTERN = /\t$/

/** The base of a derivation outside a store lot: the work tree's last commit. */
export const RISK_HEAD_BASE = 'HEAD'
