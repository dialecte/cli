/**
 * `dialecte handover list`: every hand-over folder under a root (a folder holding `lots.json` and
 * `commit.sh`), with where it commits and where it stands - pending, committed, partly committed, or
 * stale when something else moved the branch.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, lstatSync, readdirSync, realpathSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'

import { mainCheckoutOf } from '../git.ts'
import { findCommittedLots } from './find-committed-lots.ts'
import { readAbandonedMarker } from './handover-abandoned-marker.ts'
import {
	COMMIT_SCRIPT_FILE,
	HANDOVER_FILES,
	LEGACY_SCRIPT_PATTERN,
	LIST_DEPTH,
} from './handover.constants.ts'
import { readHandoverFolder } from './read-handover-folder.ts'

import type {
	CommittedLots,
	HandoverFolder,
	HandoverListing,
	HandoverState,
} from './handover.types.ts'
import type { Dirent } from 'node:fs'

export function listHandovers(params: { root: string; now: number }): HandoverListing[] {
	const folders = findHandoverFolders({ folder: params.root, depth: LIST_DEPTH })
	return onePerRealPath(folders).flatMap(function listing(folder): HandoverListing[] {
		if (!existsSync(join(folder, HANDOVER_FILES.lots)))
			return [
				{
					folder,
					repository: '-',
					worktree: '-',
					branch: '-',
					lots: undefined,
					age: params.now - newestScriptTime(folder),
					state: 'legacy script, state unknown',
				},
			]
		const handover = readHandoverFolder(folder)
		if (typeof handover === 'string') return []
		const { lotsFile } = handover
		const repositoryExists = existsSync(lotsFile.repository)
		return [
			{
				folder,
				repository: repositoryExists
					? basename(mainCheckoutOf(lotsFile.repository))
					: basename(lotsFile.repository),
				worktree: lotsFile.repository,
				branch: lotsFile.branch,
				lots: lotsFile.lots.length,
				age: params.now - statSync(join(folder, COMMIT_SCRIPT_FILE)).mtimeMs,
				state: handoverState(handover),
			},
		]
	})
}

/**
 * One folder per hand-over: a folder reached by its path and through a link is listed once, by the path
 * that is not itself a link when there is one.
 */
function onePerRealPath(folders: readonly string[]): string[] {
	const byRealPath = new Map<string, string>()
	for (const folder of folders) {
		const real = realpathSync(folder)
		const known = byRealPath.get(real)
		if (
			known === undefined ||
			(lstatSync(known).isSymbolicLink() && !lstatSync(folder).isSymbolicLink())
		)
			byRealPath.set(real, folder)
	}
	const kept = new Set(byRealPath.values())
	return folders.filter((folder) => kept.has(folder))
}

/**
 * Where the hand-over stands: abandoned when `handover abandon` marked it (asked first, the repository may be
 * gone), else read from the tip of its branch (the worktree may sit elsewhere).
 */
export function handoverState(handover: HandoverFolder): HandoverState {
	const { lotsFile, lots } = handover
	if (readAbandonedMarker(handover.folder)) return 'abandoned'
	if (!existsSync(lotsFile.repository)) return 'repository missing'
	const found = committedLotsOnBranch(handover)
	if (!found || found.foreign) return 'stale: HEAD moved by something else'
	if (found.commits.length === lots.length) return 'committed'
	if (found.commits.length > 0) return 'partly committed'
	return 'pending'
}

/**
 * The lots committed on the tip of the hand-over's branch on top of the lots file's HEAD; undefined when
 * either is no commit of the repository.
 */
export function committedLotsOnBranch(handover: HandoverFolder): CommittedLots | undefined {
	const { lotsFile, lots } = handover
	const root = lotsFile.repository
	const head = revisionOf({ root, revision: `${lotsFile.head}^{commit}` })
	const tip = revisionOf({ root, revision: `refs/heads/${lotsFile.branch}` })
	if (!head || !tip) return undefined
	return findCommittedLots({ root, head, tip, lots })
}

export function revisionOf(params: { root: string; revision: string }): string | undefined {
	const result = spawnSync('git', ['rev-parse', '--verify', '--quiet', params.revision], {
		cwd: params.root,
		encoding: 'utf8',
	})
	return result.status === 0 ? result.stdout.trim() : undefined
}

/** Scripts of a hand-over written by hand (`commit*.sh`) in the folder. */
function listLegacyScripts(folder: string): string[] {
	return readdirSync(folder).filter((name) => LEGACY_SCRIPT_PATTERN.test(name))
}

function newestScriptTime(folder: string): number {
	return Math.max(...listLegacyScripts(folder).map((name) => statSync(join(folder, name)).mtimeMs))
}

/**
 * Folders holding a lots file and a script, `depth` levels down at most, a link to a folder followed (prune
 * keeps a hand-over reached through one); dependencies and git folders skipped.
 */
export function findHandoverFolders(params: { folder: string; depth: number }): string[] {
	const { folder } = params
	if (!existsSync(folder)) return []
	const hasLots = existsSync(join(folder, HANDOVER_FILES.lots))
	const found =
		(hasLots && existsSync(join(folder, COMMIT_SCRIPT_FILE))) ||
		(!hasLots && listLegacyScripts(folder).length > 0)
			? [folder]
			: []
	if (params.depth === 0) return found
	for (const entry of readdirSync(folder, { withFileTypes: true }))
		if (isFolder({ folder, entry }) && entry.name !== 'node_modules' && !entry.name.startsWith('.'))
			found.push(
				...findHandoverFolders({ folder: join(folder, entry.name), depth: params.depth - 1 }),
			)
	return found.sort()
}

/** A folder, or a link to one. */
function isFolder(params: { folder: string; entry: Dirent }): boolean {
	if (params.entry.isDirectory()) return true
	if (!params.entry.isSymbolicLink()) return false
	try {
		return statSync(join(params.folder, params.entry.name)).isDirectory()
	} catch {
		return false
	}
}
