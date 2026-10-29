/**
 * The hooks folder git runs a commit's hooks from. A `core.hooksPath` naming a folder that does not exist
 * makes git skip every hook without a word: a worktree made by hand misses `.husky/_`, which husky writes
 * at install time and git ignores.
 */
import { existsSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'

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
