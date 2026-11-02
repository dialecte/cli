/**
 * The hooks folder git runs a commit's hooks from. A `core.hooksPath` naming a folder that does not exist
 * makes git skip every hook without a word: a worktree made by hand misses `.husky/_`, which husky writes
 * at install time and git ignores. A commit runs a hook when the folder holds an executable file named
 * after one of a commit's hooks (husky's wrappers only when the package has that hook's script).
 */
import { existsSync, statSync } from 'node:fs'
import { dirname, isAbsolute, join } from 'node:path'

import { COMMIT_HOOK_NAMES, HUSKY_RUNNER_FILE } from './git-hooks.constants.ts'
import { mainCheckoutOf, readGit, readGitConfig } from './git.ts'
import { shellQuote } from './shell-quote.ts'

import type { HooksFolder } from './git-hooks.types.ts'

export function readHooksFolder(root: string): HooksFolder {
	const configured = readGitConfig({ root, key: 'core.hooksPath' })
	if (configured)
		return {
			configured,
			folder: isAbsolute(configured) ? configured : join(root, configured),
		}
	const folder = readGit({
		root,
		args: ['rev-parse', '--path-format=absolute', '--git-path', 'hooks'],
	}).trim()
	return { configured: undefined, folder }
}

/** The refusal when `core.hooksPath` names a folder that does not exist, with how to restore it; else undefined. */
export function describeMissingHooksFolder(root: string): string | undefined {
	const { configured, folder } = readHooksFolder(root)
	if (!configured || existsSync(folder)) return undefined
	const mainCheckout = mainCheckoutOf(root)
	const source = isAbsolute(configured) ? undefined : join(mainCheckout, configured)
	const restore =
		source && source !== folder && existsSync(source)
			? `copy it from the main checkout: cp -R ${shellQuote(source)} ${shellQuote(folder)}`
			: 'reinstall the package (npm install writes it when husky is a dependency)'
	return `core.hooksPath is ${configured} but ${folder} does not exist: git would skip every hook. Restore it - ${restore}`
}

/**
 * A commit in `root` runs a hook: the hooks folder holds an executable file named after a commit's hook. In
 * husky's folder every hook name has a wrapper: a hook counts only when the package's script of that name
 * exists in the folder above.
 */
export function hasCommitHook(root: string): boolean {
	return listCommitHookFiles(root).length > 0
}

/**
 * The files a commit in `root` runs as its hooks, in the order git runs them: husky's scripts of the
 * package (`.husky/pre-commit`) when the hooks folder is husky's, else the hooks folder's executable files.
 */
export function listCommitHookFiles(root: string): string[] {
	const { folder } = readHooksFolder(root)
	const husky = isFile(join(folder, HUSKY_RUNNER_FILE))
	return COMMIT_HOOK_NAMES.flatMap(function hookFileOf(name) {
		if (husky) return isFile(join(dirname(folder), name)) ? [join(dirname(folder), name)] : []
		try {
			const status = statSync(join(folder, name))
			return status.isFile() && (status.mode & 0o111) !== 0 ? [join(folder, name)] : []
		} catch {
			return []
		}
	})
}

function isFile(path: string): boolean {
	try {
		return statSync(path).isFile()
	} catch {
		return false
	}
}
