/**
 * What the review-round commands read of a repository: the worktree root, the paths `git status` lists,
 * the files at HEAD, and whether a hand-over folder sits inside a repository (it never may).
 */
import { spawnSync } from 'node:child_process'
import { existsSync, lstatSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { readGit } from '../git.ts'
import { lotFolderOf } from '../store/lot-folder.ts'
import { LOT_FILE_PATTERN } from '../worktree/worktree.constants.ts'
import { GITLINK_MODE } from './review-rounds.constants.ts'

import type { HeadFiles, StatusListing, WorktreeState } from './review-rounds.types.ts'

/** The top of the git work tree `folder` is in, as git prints it; undefined outside every work tree. */
export function workTreeTopOf(folder: string): string | undefined {
	const result = spawnSync('git', ['rev-parse', '--show-toplevel'], {
		cwd: folder,
		encoding: 'utf8',
	})
	const top = result.status === 0 ? result.stdout.trim() : ''
	return top || undefined
}

/**
 * Why a hand-over folder is refused: it (or its nearest existing ancestor) is inside a git folder or a
 * git work tree. Undefined when it stands outside every repository, or is a lot folder (the folder rule).
 */
export function handoverFolderRefusal(folder: string): string | undefined {
	// a lot folder is the lot's hand-over folder: decided from the path and its entries, before any git process
	if (lotFolderOf({ folder })) return undefined
	let existing = folder
	while (!existsSync(existing) && dirname(existing) !== existing) existing = dirname(existing)
	const lookFrom = statSync(existing).isDirectory() ? existing : dirname(existing)
	const gitFolder = gitFolderHolding(lookFrom)
	if (gitFolder)
		return `${folder} is inside the git folder ${gitFolder}: a hand-over folder stays outside every repository`
	const top = workTreeTopOf(lookFrom)
	if (!top) return undefined
	return `${folder} is inside the repository ${top}: a hand-over folder stays outside every repository`
}

/** The git folder `folder` is inside (`<repo>/.git`, a linked worktree's own), as git prints it; undefined when none. */
function gitFolderHolding(folder: string): string | undefined {
	const result = spawnSync('git', ['rev-parse', '--is-inside-git-dir', '--absolute-git-dir'], {
		cwd: folder,
		encoding: 'utf8',
	})
	if (result.status !== 0) return undefined
	const [inside, gitFolder] = result.stdout.trim().split('\n')
	return inside === 'true' ? gitFolder : undefined
}

/**
 * The paths `git status --porcelain -z --untracked-files=all` lists at `root`: each new path and the old
 * path of a rename or copy, once, in status order; the lot declaration left out.
 */
export function listStatusPaths(root: string): StatusListing {
	const fields = readGit({
		root,
		args: ['status', '--porcelain', '-z', '--untracked-files=all'],
	}).split('\0')
	const paths = new Set<string>()
	const nestedRepositories: string[] = []
	for (let index = 0; index < fields.length; index++) {
		const field = fields[index]
		if (field.length < 4) continue
		const status = field.slice(0, 2)
		const found = [field.slice(3)]
		// a rename or a copy: the old path is the next field
		if (status[0] === 'R' || status[0] === 'C') found.push(fields[++index])
		for (const path of found) {
			if (path.endsWith('/')) nestedRepositories.push(path)
			else if (!LOT_FILE_PATTERN.test(path)) paths.add(path)
		}
	}
	return { paths: [...paths], nestedRepositories }
}

/** The paths at HEAD, relative to `root`: files and symlinks, and the gitlinks of submodules apart. */
export function listHeadFiles(root: string): HeadFiles {
	const head: HeadFiles = { files: new Set(), submodules: new Set() }
	for (const entry of readGit({
		root,
		args: ['ls-tree', '-r', '-z', '--full-tree', 'HEAD'],
	}).split('\0')) {
		// `<mode> <type> <object>\t<path>`
		const tab = entry.indexOf('\t')
		if (tab < 0) continue
		const path = entry.slice(tab + 1)
		if (entry.startsWith(GITLINK_MODE)) head.submodules.add(path)
		else head.files.add(path)
	}
	return head
}

/** The submodules the index holds (gitlinks, mode 160000), an added one not at HEAD yet included. */
export function listIndexSubmodules(root: string): Set<string> {
	const submodules = new Set<string>()
	for (const entry of readGit({ root, args: ['ls-files', '--stage', '-z'] }).split('\0')) {
		// `<mode> <object> <stage>\t<path>`
		const tab = entry.indexOf('\t')
		if (tab >= 0 && entry.startsWith(GITLINK_MODE)) submodules.add(entry.slice(tab + 1))
	}
	return submodules
}

/** What a snapshot or a delta reads of the worktree `root`: its status, HEAD, the submodules of HEAD and the index. */
export function readWorktreeState(root: string): WorktreeState {
	const head = listHeadFiles(root)
	return {
		status: listStatusPaths(root),
		head,
		submodules: new Set([...head.submodules, ...listIndexSubmodules(root)]),
	}
}

/**
 * Why the worktree cannot be snapshot or compared: status lists a repository that is no file of the lot -
 * an untracked nested repository, or a submodule (a gitlink at HEAD or in the index): added, moved, dirty
 * or removed.
 */
export function worktreeStateRefusal(params: {
	root: string
	state: WorktreeState
}): string | undefined {
	const { status } = params.state
	const submodules = status.paths.filter((path) => params.state.submodules.has(path))
	const repositories = [...status.nestedRepositories, ...submodules]
	if (repositories.length === 0) return undefined
	return `${repositories.join(', ')} in ${params.root}: a nested repository or a submodule is no file of the lot`
}

/** The files and symlinks under `folder`, relative to it with `/`, sorted; folders walked, not listed. */
export function listTreeFiles(folder: string): string[] {
	const found: string[] = []
	walkFolder({ folder, relative: '', found })
	return found.sort()
}

function walkFolder(params: { folder: string; relative: string; found: string[] }): void {
	for (const name of readdirSync(join(params.folder, params.relative))) {
		const path = params.relative ? `${params.relative}/${name}` : name
		if (lstatSync(join(params.folder, path)).isDirectory())
			walkFolder({ folder: params.folder, relative: path, found: params.found })
		else params.found.push(path)
	}
}
