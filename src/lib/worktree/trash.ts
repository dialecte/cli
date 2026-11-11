/**
 * `.worktrees/_trash/`: delete and forget. A worktree or a folder is renamed into the trash at once and
 * removed by a detached background command nobody waits for; a folder left there (a sleep, a crash) stays for
 * the person to look at.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, renameSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, sep } from 'node:path'

import { realPathOf } from '../file-system.ts'
import { readGit } from '../git.ts'
import { WORKTREES_FOLDER } from '../workspace.constants.ts'
import { POOL_FOLDER_PREFIX, TRASH_FOLDER } from './worktree.constants.ts'

import type { BackgroundSpawner, TrashedFolder } from './worktree.types.ts'

/**
 * `path` lies in the workspace's trash (`.worktrees/_trash/`) or in a pool entry (`.worktrees/_pool-*`): a
 * folder on its way out, never listed by prune nor a close target.
 */
export function isParked(params: {
	path: string
	/** The repository's main checkout: the workspace's `.worktrees/` is beside it. */
	main: string
}): boolean {
	const fromWorktrees = relative(
		realPathOf(join(dirname(params.main), WORKTREES_FOLDER)),
		realPathOf(params.path),
	)
	if (fromWorktrees === '' || fromWorktrees.startsWith('..') || isAbsolute(fromWorktrees))
		return false
	const [first] = fromWorktrees.split(sep)
	return first === TRASH_FOLDER || first.startsWith(POOL_FOLDER_PREFIX)
}

/**
 * `git worktree move` into `_trash/<folder name>-<time>`, then a background `git worktree remove`: with
 * `--force` by default; without it, git refuses a worktree holding an untracked or modified file, which then
 * stays registered in the trash.
 */
export function trashWorktree(params: {
	worktree: string
	/** The repository's main checkout: git runs from it. */
	repository: string
	worktreesFolder: string
	now: Date
	spawner: BackgroundSpawner
	/** `git worktree remove --force` (default true); false: without it, so git refuses a worktree holding anything uncommitted. */
	force?: boolean
}): TrashedFolder {
	const trashed = trashPathOf({
		worktreesFolder: params.worktreesFolder,
		name: basename(params.worktree),
		now: params.now,
	})
	// a rename: git keeps the worktree registered, now under the trash
	readGit({ root: params.repository, args: ['worktree', 'move', params.worktree, trashed] })
	params.spawner({
		command: 'git',
		args: ['worktree', 'remove', ...(params.force === false ? [] : ['--force']), trashed],
		cwd: params.repository,
	})
	return { trashed }
}

/** Renames a plain folder into `_trash/<folder name>-<time>`, then a background `rm -rf` of that path. */
export function trashFolder(params: {
	folder: string
	worktreesFolder: string
	now: Date
	spawner: BackgroundSpawner
}): TrashedFolder {
	const trashed = trashPathOf({
		worktreesFolder: params.worktreesFolder,
		name: basename(params.folder),
		now: params.now,
	})
	renameSync(params.folder, trashed)
	params.spawner({ command: 'rm', args: ['-rf', trashed] })
	return { trashed }
}

/** Starts the command detached, its output ignored, and never waits for it: what nobody checks finished. */
export function spawnDetached(params: { command: string; args: string[]; cwd?: string }): void {
	const child = spawn(params.command, params.args, {
		cwd: params.cwd,
		detached: true,
		stdio: 'ignore',
	})
	// a command that cannot start leaves the folder in the trash: nothing to report
	child.on('error', function ignore() {})
	child.unref()
}

/** A free path `_trash/<name>-<yyyymmddThhmmss>` (`-2`, `-3`... after it within one second); the trash made. */
function trashPathOf(params: { worktreesFolder: string; name: string; now: Date }): string {
	const trash = join(params.worktreesFolder, TRASH_FOLDER)
	mkdirSync(trash, { recursive: true })
	const base = join(trash, `${params.name}-${timeStamp(params.now)}`)
	let path = base
	for (let counter = 2; existsSync(path); counter++) path = `${base}-${counter}`
	return path
}

/** `20261106T100000`: the UTC time to the second. */
function timeStamp(now: Date): string {
	return now.toISOString().replace(/[-:]/g, '').slice(0, 'yyyymmddThhmmss'.length)
}
