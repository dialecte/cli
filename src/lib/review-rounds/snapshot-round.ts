/**
 * The snapshot of a review round: every path `git status` lists in the lot's worktree copied to
 * `<folder>/round-<n>/` (bytes, executable bit, a symlink as a symlink), the paths gone from disk that HEAD
 * holds in `round-<n>.deleted` (sorted, each followed by a NUL), the HEAD sha in `round-<n>.base`, the time and the
 * worktree's state hash in `round-<n>.state` (JSON `{ schema: 1, at, stateHash }`). Built
 * under `.partial` names and renamed at the end, so a run that fails part-way leaves nothing a rerun
 * refuses on.
 */
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { copyFileOrLink, isFileOrLink } from '../copy-file-or-link.ts'
import { computeStateHash } from '../gate-records/state-hash.ts'
import { readGit } from '../git.ts'
import { PARTIAL_SUFFIX, ROUND_STATE_SCHEMA } from './review-rounds.constants.ts'
import { roundNames } from './round-names.ts'
import { worktreeStateRefusal } from './worktree-state.ts'

import type { RoundState, TakenSnapshot, WorktreeState } from './review-rounds.types.ts'

/** Why the round cannot be taken (one of its names exists already, a nested repository or a submodule); undefined when it can. */
export function snapshotRefusal(params: {
	root: string
	folder: string
	round: number
	state: WorktreeState
}): string | undefined {
	const names = roundNames(params.round)
	const existing = [names.folder, names.deleted, names.base, names.state].find((name) =>
		existsSync(join(params.folder, name)),
	)
	if (existing)
		return `${join(params.folder, existing)} exists already: round ${params.round} was taken`
	return worktreeStateRefusal({ root: params.root, state: params.state })
}

/** Takes the snapshot of round `round` of the worktree `root`, read as `state`, into `folder`, taken at `at`. */
export function takeSnapshot(params: {
	root: string
	folder: string
	round: number
	state: WorktreeState
	at: Date
}): TakenSnapshot {
	const { root, folder } = params
	const names = roundNames(params.round)
	mkdirSync(folder, { recursive: true })
	removeLeftovers({ folder, round: params.round })
	const base = readGit({ root, args: ['rev-parse', 'HEAD'] }).trim()
	const copied: string[] = []
	const deleted: string[] = []
	const partial = join(folder, `${names.folder}${PARTIAL_SUFFIX}`)
	mkdirSync(partial)
	for (const path of params.state.status.paths) {
		if (isFileOrLink(join(root, path))) {
			copyFileOrLink({ from: join(root, path), to: join(partial, path) })
			copied.push(path)
		} else if (params.state.head.files.has(path)) deleted.push(path)
	}
	writeFileSync(
		join(folder, `${names.deleted}${PARTIAL_SUFFIX}`),
		deleted
			.sort()
			.map((path) => `${path}\0`)
			.join(''),
	)
	writeFileSync(join(folder, `${names.base}${PARTIAL_SUFFIX}`), `${base}\n`)
	const roundState: RoundState = {
		schema: ROUND_STATE_SCHEMA,
		at: params.at.toISOString(),
		stateHash: computeStateHash(root),
	}
	writeFileSync(join(folder, `${names.state}${PARTIAL_SUFFIX}`), `${JSON.stringify(roundState)}\n`)
	renameAll({ folder, names: [names.state, names.deleted, names.base, names.folder] })
	return { copied: copied.length, deleted: deleted.length, base }
}

/** Removes the `.partial` names a crashed run of the same round left (this command's own). */
function removeLeftovers(params: { folder: string; round: number }): void {
	const names = Object.values(roundNames(params.round))
	for (const entry of readdirSync(params.folder))
		if (names.some((name) => entry.startsWith(`${name}${PARTIAL_SUFFIX}`)))
			rmSync(join(params.folder, entry), { recursive: true, force: true })
}

/** Renames each `<name>.partial` to `<name>`; one failing puts the ones already renamed back. */
function renameAll(params: { folder: string; names: string[] }): void {
	const renamed: string[] = []
	try {
		for (const name of params.names) {
			renameSync(join(params.folder, `${name}${PARTIAL_SUFFIX}`), join(params.folder, name))
			renamed.push(name)
		}
	} catch (error) {
		for (const name of renamed)
			renameSync(join(params.folder, name), join(params.folder, `${name}${PARTIAL_SUFFIX}`))
		throw error
	}
}
