import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

import {
	LINKED_WORKTREE_GITDIR_FILE,
	LINKED_WORKTREES_FOLDER,
} from '../handover/handover.constants.ts'
import { LINKED_WORKTREE_HEAD_FILE } from '../plan/plan.constants.ts'
import { LINKED_WORKTREE_INDEX_FILE } from './health.constants.ts'

import type { StoreEntry } from '../handover/handover.types.ts'
import type { HealthWorktree } from './health.types.ts'
import type { Stats } from 'node:fs'

/**
 * The worktrees registered in `<common>/worktrees/`, sorted by name, read from files only (no git process): the folder
 * each `gitdir` names, whether it still exists, when git registered it, when its index or HEAD last changed, and the
 * hand-over entry of that folder (the newest written when several name it). A registration whose `gitdir` does not
 * read, or that vanished while it was read (git removes registrations at any time), is left out; no `worktrees`
 * folder reads as none.
 */
export function readRegisteredWorktrees(params: {
	common: string
	entries: readonly StoreEntry[]
}): HealthWorktree[] {
	const folder = join(params.common, LINKED_WORKTREES_FOLDER)
	return listFolderNames({ folder }).flatMap(function worktreeOf(name): HealthWorktree[] {
		const record = join(folder, name)
		const path = gitdirPathOf({ record })
		if (path === undefined) return []
		const registered = statOf({ path: record })
		if (registered === undefined) return []
		const handover = handoverOf({ entries: params.entries, path })
		return [
			{
				name,
				path,
				gone: !existsSync(path),
				createdAt: registered.birthtime.toISOString(),
				activeAt: activeAtOf({ record, registeredMs: registered.mtimeMs }),
				...(handover === undefined ? {} : { handover }),
			},
		]
	})
}

/** The folder names of `folder`, sorted; none when it does not exist. */
function listFolderNames(params: { folder: string }): string[] {
	try {
		return readdirSync(params.folder, { withFileTypes: true })
			.filter((entry) => entry.isDirectory())
			.map((entry) => entry.name)
			.sort()
	} catch {
		return []
	}
}

/** The worktree folder a registration's `gitdir` names (`<path>/.git`, relative to the registration when relative). */
function gitdirPathOf(params: { record: string }): string | undefined {
	try {
		const text = readFileSync(join(params.record, LINKED_WORKTREE_GITDIR_FILE), 'utf8').trim()
		return text === '' ? undefined : dirname(resolve(params.record, text))
	} catch {
		return undefined
	}
}

/** The path's stats; undefined when it does not exist any more. */
function statOf(params: { path: string }): Stats | undefined {
	try {
		return statSync(params.path)
	} catch {
		return undefined
	}
}

/**
 * The newest modification time of the registration's index and HEAD, ISO; the registration folder's own
 * (`registeredMs`) when neither exists.
 */
function activeAtOf(params: { record: string; registeredMs: number }): string {
	const times = [LINKED_WORKTREE_INDEX_FILE, LINKED_WORKTREE_HEAD_FILE].flatMap(
		function timeOf(file) {
			try {
				return [statSync(join(params.record, file)).mtimeMs]
			} catch {
				return []
			}
		},
	)
	const newest = times.length === 0 ? params.registeredMs : Math.max(...times)
	return new Date(newest).toISOString()
}

/** The state and closed time of the newest written hand-over entry whose worktree is `path`. */
function handoverOf(params: {
	entries: readonly StoreEntry[]
	path: string
}): HealthWorktree['handover'] {
	let newest: StoreEntry | undefined
	for (const entry of params.entries) {
		if (entry.worktree === '' || resolve(entry.worktree) !== params.path) continue
		if (newest === undefined || entry.written >= newest.written) newest = entry
	}
	if (newest === undefined) return undefined
	return {
		state: newest.state,
		...(newest.closed === undefined ? {} : { closed: newest.closed }),
	}
}
