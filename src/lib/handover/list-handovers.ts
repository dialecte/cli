/**
 * `dialecte handover list`: every hand-over folder under a root (a folder holding `lots.json` and
 * `commit.sh`), with where it commits and where it stands - pending, committed, partly committed, or
 * stale when something else moved the branch.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'

import { mainCheckoutOf } from '../git.ts'
import { findCommittedLots } from './find-committed-lots.ts'
import {
	COMMIT_SCRIPT_FILE,
	HANDOVER_FILES,
	LEGACY_SCRIPT_PATTERN,
	LIST_DEPTH,
} from './handover.constants.ts'
import { readHandoverFolder } from './read-handover-folder.ts'

import type { HandoverFolder, HandoverListing, HandoverState } from './handover.types.ts'

export function listHandovers(params: { root: string; now: number }): HandoverListing[] {
	return findHandoverFolders({ folder: params.root, depth: LIST_DEPTH }).flatMap(
		function listing(folder): HandoverListing[] {
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
					state: repositoryExists ? handoverState(handover) : 'repository missing',
				},
			]
		},
	)
}

/** Where the hand-over stands, read from the tip of its branch (the worktree may sit elsewhere). */
export function handoverState(handover: HandoverFolder): HandoverState {
	const { lotsFile, lots } = handover
	const root = lotsFile.repository
	const head = revisionOf({ root, revision: `${lotsFile.head}^{commit}` })
	const tip = revisionOf({ root, revision: `refs/heads/${lotsFile.branch}` })
	if (!head || !tip) return 'stale: HEAD moved by something else'
	const found = findCommittedLots({ root, head, tip, lots, compareContent: false })
	if (found.foreign) return 'stale: HEAD moved by something else'
	if (found.commits.length === lots.length) return 'committed'
	if (found.commits.length > 0) return 'partly committed'
	return 'pending'
}

function revisionOf(params: { root: string; revision: string }): string | undefined {
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

/** Folders holding a lots file and a script, `depth` levels down at most; dependencies and git folders skipped. */
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
		if (entry.isDirectory() && entry.name !== 'node_modules' && !entry.name.startsWith('.'))
			found.push(
				...findHandoverFolders({ folder: join(folder, entry.name), depth: params.depth - 1 }),
			)
	return found.sort()
}
