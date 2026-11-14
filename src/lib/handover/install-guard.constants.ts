/** The install guard's refusals (after `✗ lot <n> not committed: `) and its package list. */

/** `node_modules` differ from the lock the commit holds, which the working copy holds too. */
export const INSTALL_MISMATCH_REFUSAL =
	'node_modules do not match package-lock.json: run npm ci in {worktree}'

/** `node_modules` differ from the lock the commit holds while the working copy holds another (a later lot's). */
export const INSTALL_LATER_LOCK_REFUSAL =
	'node_modules do not match the package-lock.json lot {lot} commits (a later lot changes it): run npm ci with that lock, or commit the lock change first'

/** The lock the commit holds cannot be read: `{reason}` is the reader's (`unreadable`, `has no packages map`). */
export const INSTALL_UNREADABLE_REFUSAL = 'package-lock.json {reason}: run npm ci in {worktree}'

/** A file the index holds that git cannot read (a missing object): `{reason}` is the first line of git's message. */
export const INDEX_FILE_UNREADABLE_REFUSAL = '{file} in the index could not be read: {reason}'

/** A file the index holds whose text is no JSON: `{reason}` is the first line of the parser's message. */
export const INDEX_FILE_PARSE_REFUSAL = '{file} in the index does not parse: {reason}'

/** The line printed when the record cannot be written: the check is made, the lot goes on. */
export const INSTALL_RECORD_NOT_WRITTEN = '! install.json not written: {reason}'

/** How many mismatched packages the refusal names, one per line; the others are counted. */
export const INSTALL_LISTED_PACKAGES = 5

/** The line counting the mismatched packages beyond those named. */
export const INSTALL_MORE_PACKAGES = 'and {count} more'

/**
 * The exit code of `handover run` when the install guard refused a lot (as the `target` and `processes` guards), or
 * the lock sync could not read or parse a staged file.
 */
export const INSTALL_REFUSAL_EXIT_CODE = 2

/** The card's gate line name for the install guard's last record. */
export const INSTALL_LINE_NAME = 'install'

/** The card's passed install line: `{lock}` is the first characters of the lock's hash. */
export const INSTALL_LINE_PASSED = 'node_modules match package-lock.json ({lock})'

/** The card's failed install line when packages differ from the lock. */
export const INSTALL_LINE_MISMATCHED =
	'node_modules do not match package-lock.json ({count} package(s)): run npm ci in {worktree}'

/** The card's failed install line for a refusal naming a later lot's lock (`laterLock`): no worktree to install in. */
export const INSTALL_LINE_LATER_LOCK =
	'node_modules do not match the package-lock.json the next lot commits ({count} package(s)): a later lot changes it: run npm ci with that lock, or commit the lock change first'

/** The card's failed install line when the guard could not read the lock (a record with no package counted). */
export const INSTALL_LINE_UNREADABLE =
	'package-lock.json could not be read: handover run refuses until it reads'

/** How many characters of the lock's hash the passed line shows. */
export const INSTALL_LINE_HASH_LENGTH = 12
