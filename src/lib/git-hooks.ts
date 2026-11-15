/**
 * The hooks folder git runs a commit's hooks from. A `core.hooksPath` naming a folder that does not exist
 * makes git skip every hook without a word: a worktree made by hand misses `.husky/_`, which husky writes
 * at install time and git ignores. A commit runs a hook when the folder holds an executable file named
 * after one of a commit's hooks (husky's wrappers only when the package has that hook's script).
 */
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, sep } from 'node:path'

import {
	COMMIT_HOOK_NAMES,
	EXECUTABLE_FILE_MODE,
	GIT_FOLDER_NAME,
	HUSKY_RUNNER_FILE,
} from './git-hooks.constants.ts'
import { mainCheckoutOf, readGit, readGitBytes, readGitConfig, tryReadGit } from './git.ts'
import { shellQuote } from './shell-quote.ts'

import type {
	CommitHookFile,
	HookScriptsInRepository,
	HooksFolder,
	TreeEntry,
} from './git-hooks.types.ts'

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
	const scripts = husky ? dirname(folder) : folder
	return COMMIT_HOOK_NAMES.flatMap(function hookFileOf(name) {
		const file = join(scripts, name)
		return isRunnableHookFile({ file, husky }) ? [file] : []
	})
}

/** A hook file git runs: husky runs its script whatever its mode, a plain hooks folder only an executable file. */
function isRunnableHookFile(params: { file: string; husky: boolean }): boolean {
	if (params.husky) return isFile(params.file)
	try {
		const status = statSync(params.file)
		return status.isFile() && (status.mode & 0o111) !== 0
	} catch {
		return false
	}
}

function isFile(path: string): boolean {
	try {
		return statSync(path).isFile()
	} catch {
		return false
	}
}

/**
 * The commit hook files of `root` (`listCommitHookFiles`), each its name and bytes. With `tree`, a hook file whose
 * folder lies inside the repository (husky's scripts, or a `core.hooksPath` folder of the work tree) is read as
 * `tree` holds it - a plain hooks folder's file counts only when the tree holds it executable; a file the tree does
 * not hold is absent when the worktree tracks it, read from disk when git does not track it (an ignored or untracked
 * hook); git's own hooks folder and a folder outside the repository are read from disk as without it.
 */
export function readCommitHookFiles(params: { root: string; tree?: string }): CommitHookFile[] {
	const { root, tree } = params
	const scripts = tree === undefined ? undefined : findHookScriptsInRepository(root)
	if (tree === undefined || scripts === undefined)
		return listCommitHookFiles(root).map(function readFromDisk(file) {
			return { name: basename(file), bytes: readFileSync(file) }
		})
	return readCommitHookFilesAtTree({ root, tree, scripts })
}

/**
 * Where the hook scripts git runs live, relative to the work tree's top, when that folder is part of the repository:
 * a configured hooks folder (husky's scripts are the folder above its own) that exists, inside the work tree and not
 * in its git folder; undefined otherwise.
 */
function findHookScriptsInRepository(root: string): HookScriptsInRepository | undefined {
	const { configured, folder } = readHooksFolder(root)
	// git's own hooks folder lives in the git folder: never part of a tree
	if (configured === undefined) return undefined
	const husky = isFile(join(folder, HUSKY_RUNNER_FILE))
	const scripts = husky ? dirname(folder) : folder
	const top = tryReadGit({ root, args: ['rev-parse', '--show-toplevel'] })?.trim()
	if (!top || !existsSync(scripts)) return undefined
	const path = relative(realpathSync(top), realpathSync(scripts))
	const [first] = path.split(sep)
	if (isAbsolute(path) || first === '..' || first === GIT_FOLDER_NAME) return undefined
	return { path: path.split(sep).join('/'), folder: scripts, husky }
}

/**
 * The commit hook files in the scripts folder, in the order git runs them: as `tree` holds them; a hook the tree does
 * not hold and git does not track in the worktree (ignored or untracked: a commit runs it from disk) from disk.
 */
function readCommitHookFilesAtTree(params: {
	root: string
	tree: string
	scripts: HookScriptsInRepository
}): CommitHookFile[] {
	const { root, tree, scripts } = params
	const paths = COMMIT_HOOK_NAMES.map((name) => hookPathOf({ scripts, name }))
	const entries = readGit({ root, args: ['ls-tree', '-z', '--full-tree', tree, '--', ...paths] })
		.split('\0')
		.filter(Boolean)
		.map(parseTreeEntry)
	const tracked = new Set(
		readGit({
			root,
			args: ['ls-files', '-z', '--full-name', '--', ...paths.map((path) => `:(top)${path}`)],
		})
			.split('\0')
			.filter(Boolean),
	)
	return COMMIT_HOOK_NAMES.flatMap(function readAtTree(name) {
		const path = hookPathOf({ scripts, name })
		const entry = entries.find((candidate) => candidate.path === path)
		if (entry === undefined) {
			// a path the worktree tracks and the tree lacks is absent; one git does not track is run from disk
			if (tracked.has(path)) return []
			const file = join(scripts.folder, name)
			return isRunnableHookFile({ file, husky: scripts.husky })
				? [{ name, bytes: readFileSync(file) }]
				: []
		}
		if (entry.type !== 'blob') return []
		// a plain hooks folder runs only an executable file; husky runs its script whatever its mode
		if (!scripts.husky && entry.mode !== EXECUTABLE_FILE_MODE) return []
		return [{ name, bytes: readGitBytes({ root, args: ['cat-file', 'blob', entry.object] }) }]
	})
}

/** The path of the hook `name` in the scripts folder, relative to the work tree's top. */
function hookPathOf(params: { scripts: HookScriptsInRepository; name: string }): string {
	return params.scripts.path ? `${params.scripts.path}/${params.name}` : params.name
}

/** One `git ls-tree` entry: `<mode> <type> <object>\t<path>`. */
function parseTreeEntry(entry: string): TreeEntry {
	const tab = entry.indexOf('\t')
	const [mode, type, object] = entry.slice(0, tab).split(' ')
	return { mode, type, object, path: entry.slice(tab + 1) }
}
