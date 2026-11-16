/**
 * The install precondition of every check keyed on a tree: the package's `node_modules` installs the
 * `package-lock.json` that tree holds. A check never runs nor answers from records on another install.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { shellQuote } from '../shell-quote.ts'
import { checkNodeModules } from './check-node-modules.ts'
import { readTreeLockText } from './lock-key.ts'
import { PACKAGE_LOCK_FILE, TREE_INSTALL_REFUSALS } from './worktree.constants.ts'

/**
 * Undefined when the `node_modules` of the package at `root` installs the lock `tree` holds (or the tree holds none);
 * else one line: the first package that differs, how many more do, and the way out - `npm ci` when the lock on disk
 * is the checked one, else putting the checked lock on disk first (`npm ci` installs the file); a checked lock that
 * cannot be read package by package refuses too.
 *
 * @intent refuse a check whose node_modules does not install the lock of the tree it checks
 * @internal
 */
export function checkInstallMatchesTree(params: {
	root: string
	tree: string
}): string | undefined {
	const lockText = readTreeLockText(params)
	if (lockText === undefined) return undefined
	const check = checkNodeModules({ worktree: params.root, lockText })
	const command = `cd ${shellQuote(params.root)} && npm ci`
	if (check.notChecked !== undefined)
		return TREE_INSTALL_REFUSALS.unreadable
			.replace('{reason}', () => check.notChecked ?? '')
			.replace('{command}', () => command)
	const [first, ...rest] = check.problems
	if (first === undefined) return undefined
	const onDisk = join(params.root, PACKAGE_LOCK_FILE)
	const sameAsDisk = existsSync(onDisk) && readFileSync(onDisk, 'utf8') === lockText
	return (sameAsDisk ? TREE_INSTALL_REFUSALS.mismatch : TREE_INSTALL_REFUSALS.otherLock)
		.replace('{package}', () => first.package)
		.replace('{problem}', () => first.problem)
		.replace('{more}', () => (rest.length > 0 ? ` (and ${rest.length} more)` : ''))
		.replace('{command}', () => command)
}
