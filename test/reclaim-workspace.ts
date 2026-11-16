/**
 * The scene of the `worktree prune --reclaim` cases: a workspace whose main checkouts commit a lock, real worktrees
 * holding a fake node_modules, and git folders aged so that every worktree reads idle (or recently active).
 */
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	realpathSync,
	statSync,
	utimesSync,
	writeFileSync,
} from 'node:fs'
import { join } from 'node:path'

import { createBriefWorkspace } from './brief-workspace.ts'
import { addBareWorktree, addLotWorktree } from './lot-keep-workspace.ts'
import {
	DAY_MS,
	IDLE_DAYS,
	IGNORED,
	MAIN_LOCK,
	PRESERVED_FILES,
} from './reclaim-workspace.constants.ts'
import { git, initializeRepository, writeFiles } from './scratch-repository.ts'
import { createFakeNodeModules } from './worktree-pool.ts'

import type { BriefWorkspace } from './brief-workspace.types.ts'
import type { LotKeepState } from './lot-keep-workspace.types.ts'

/** A workspace whose repository's main checkout commits `MAIN_LOCK` and ignores node_modules and `.tmp/`. */
export function createReclaimWorkspace(): BriefWorkspace {
	const workspace = createBriefWorkspace()
	writeFiles({
		root: workspace.repository,
		files: { 'package-lock.json': MAIN_LOCK, '.gitignore': IGNORED },
	})
	git({ root: workspace.repository, args: ['add', '-A'] })
	git({ root: workspace.repository, args: ['commit', '-q', '-m', 'chore: lock'] })
	return workspace
}

/** A second repository `<workspace>/<folder>` whose main checkout commits `lock`; its path. */
export function addReclaimRepository(params: {
	workspace: BriefWorkspace
	folder: string
	lock: string
}): string {
	return initializeRepository({
		root: join(params.workspace.workspace, params.folder),
		files: { 'package-lock.json': params.lock, '.gitignore': IGNORED },
	})
}

/**
 * A real worktree `.worktrees/<name>` of the workspace's repository holding a fake node_modules (with `marker` when
 * given): named by a lot in `lot` when given, else by none; with `lock` committed on its branch. Its real path.
 */
export function addReclaimWorktree(params: {
	workspace: BriefWorkspace
	name: string
	lot?: LotKeepState
	lock?: string
	merged?: boolean
	marker?: string
}): string {
	const { workspace, name } = params
	const added =
		params.lot === undefined
			? addBareWorktree({ workspace, name, merged: params.merged })
			: addLotWorktree({ workspace, name, state: params.lot, merged: params.merged })
	if (params.lock !== undefined) commitLock({ worktree: added.worktree, lock: params.lock })
	createFakeNodeModules({ folder: join(added.worktree, 'node_modules'), marker: params.marker })
	return added.worktree
}

/**
 * A worktree `.worktrees/<name>` of `repository` (any repository of the workspace) on `feat/<name>`, holding a fake
 * node_modules with `marker`; with `lock` committed on its branch when given. Its real path.
 */
export function addPlainWorktree(params: {
	workspace: BriefWorkspace
	repository: string
	name: string
	marker: string
	lock?: string
}): string {
	const path = join(params.workspace.workspace, '.worktrees', params.name)
	git({
		root: params.repository,
		args: ['worktree', 'add', '-q', '-b', `feat/${params.name}`, path],
	})
	if (params.lock !== undefined) commitLock({ worktree: path, lock: params.lock })
	createFakeNodeModules({ folder: join(path, 'node_modules'), marker: params.marker })
	return realpathSync(path)
}

function commitLock(params: { worktree: string; lock: string }): void {
	writeFiles({ root: params.worktree, files: { 'package-lock.json': params.lock } })
	git({ root: params.worktree, args: ['commit', '-q', '-am', 'chore: another lock'] })
}

/** The git folder of a linked worktree (`.git/worktrees/<name>`). */
export function gitFolderOf(worktree: string): string {
	return git({ root: worktree, args: ['rev-parse', '--absolute-git-dir'] }).trim()
}

/** Every file under `folder`, at every depth, last written `days` ago. */
export function ageFolder(params: { folder: string; days: number }): void {
	const at = new Date(Date.now() - params.days * DAY_MS)
	for (const name of readdirSync(params.folder)) {
		const path = join(params.folder, name)
		if (statSync(path).isDirectory()) ageFolder({ folder: path, days: params.days })
		else utimesSync(path, at, at)
	}
}

/**
 * The git folder of every repository of the workspace (every worktree's git folder inside it) last written `days` ago
 * (default `IDLE_DAYS`): run after every git operation of the scene.
 */
export function ageEverything(params: { workspace: BriefWorkspace; days?: number }): void {
	const { workspace } = params.workspace
	for (const name of readdirSync(workspace)) {
		const gitFolder = join(workspace, name, '.git')
		if (existsSync(gitFolder) && statSync(gitFolder).isDirectory())
			ageFolder({ folder: gitFolder, days: params.days ?? IDLE_DAYS })
	}
}

/** `file` of a git folder (`index`, `HEAD`, `logs/HEAD`) last written `days` ago: git activity at that time. */
export function touchGitFile(params: { gitFolder: string; file: string; days: number }): void {
	const at = new Date(Date.now() - params.days * DAY_MS)
	utimesSync(join(params.gitFolder, params.file), at, at)
}

/** Writes an untracked note, an ignored `.tmp/` note and a `.claude/settings.local.json` into the worktree. */
export function addPreservedFiles(worktree: string): void {
	for (const [path, text] of Object.entries(PRESERVED_FILES)) {
		mkdirSync(join(worktree, path, '..'), { recursive: true })
		writeFileSync(join(worktree, path), text)
	}
}

/** The preserved files of the worktree as they are now (absent: `undefined`), and its `git status --porcelain`. */
export function preservedStateOf(worktree: string): {
	files: Record<string, string | undefined>
	status: string
} {
	return {
		files: Object.fromEntries(
			Object.keys(PRESERVED_FILES).map((path) => [
				path,
				existsSync(join(worktree, path)) ? readFileSync(join(worktree, path), 'utf8') : undefined,
			]),
		),
		status: git({ root: worktree, args: ['status', '--porcelain'] }),
	}
}
