/**
 * The worktree index: every worktree `dialecte worktree add` makes is `.worktrees/<index>-<repository>-<branch
 * tail>`, `<index>` 4 digits at least, one counter per workspace, so the latest sorts last. The next index is 1 +
 * the highest of the claims in `.worktrees/.index/` (one empty file per index ever taken) and the numbered
 * entries of `.worktrees/`; a claim is created exclusively, so two runs never take the same index, whatever
 * their repository, and a number once taken is never taken again.
 */
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

import { WORKTREES_FOLDER } from '../workspace.constants.ts'
import {
	WORKTREE_INDEX_CLAIM_PATTERN,
	WORKTREE_INDEX_DIGITS,
	WORKTREE_INDEX_FOLDER,
	WORKTREE_INDEX_PATTERN,
} from './worktree.constants.ts'

import type { InterleavingSeam } from '../handover/handover.types.ts'

/** Claims the next index of the workspace's `.worktrees/` folder (made when absent): its padded text. */
export function claimWorktreeIndex(params: {
	worktreesFolder: string
	/** Called between the pick of the number and the creation of its claim. */
	afterPick?: InterleavingSeam
}): string {
	const claims = join(params.worktreesFolder, WORKTREE_INDEX_FOLDER)
	mkdirSync(claims, { recursive: true })
	let seam = params.afterPick
	// another run may claim the same number meanwhile: a claim is created only where none exists
	for (;;) {
		const index = padIndex(highestIndex({ worktreesFolder: params.worktreesFolder, claims }) + 1)
		seam?.()
		seam = undefined
		if (createClaim(join(claims, index))) return index
	}
}

/**
 * The index of a worktree folder of a workspace's `.worktrees/` (`.worktrees/0171-cli-x` → `0171`); undefined
 * for an unnumbered one, and for any folder elsewhere (a main checkout, a clone), whatever its name.
 */
export function worktreeIndexOf(path: string): string | undefined {
	if (basename(dirname(path)) !== WORKTREES_FOLDER) return undefined
	return indexOfName(basename(path))
}

/** The index a numbered folder name starts with (`0171-cli-x` → `0171`). */
function indexOfName(name: string): string | undefined {
	return WORKTREE_INDEX_PATTERN.exec(name)?.[1]
}

/** `<index>-<repository folder>-<branch tail>`: the name of a numbered worktree folder. */
export function worktreeFolderName(params: {
	index: string
	repository: string
	branch: string
}): string {
	return `${params.index}-${basename(params.repository)}-${params.branch.split('/').at(-1)}`
}

/** The index the next claim would take in `.worktrees/` (padded), without claiming it nor making a folder. */
export function nextWorktreeIndex(params: { worktreesFolder: string }): string {
	const claims = join(params.worktreesFolder, WORKTREE_INDEX_FOLDER)
	return padIndex(highestIndex({ worktreesFolder: params.worktreesFolder, claims }) + 1)
}

/** The highest index among the claims and the numbered entries of `.worktrees/` (0 when none). */
function highestIndex(params: { worktreesFolder: string; claims: string }): number {
	const claimed = entriesOf(params.claims).filter(function isClaim(name) {
		return WORKTREE_INDEX_CLAIM_PATTERN.test(name)
	})
	const numbered = entriesOf(params.worktreesFolder).flatMap(function indexOf(name) {
		const index = indexOfName(name)
		return index === undefined ? [] : [index]
	})
	return Math.max(0, ...[...claimed, ...numbered].map(Number))
}

/** The names in a folder; none when it does not exist yet. */
function entriesOf(folder: string): string[] {
	return existsSync(folder) ? readdirSync(folder) : []
}

function padIndex(index: number): string {
	return String(index).padStart(WORKTREE_INDEX_DIGITS, '0')
}

/** Creates the claim, never over one: false when it exists already (taken by another run). */
function createClaim(path: string): boolean {
	try {
		writeFileSync(path, '', { flag: 'wx' })
		return true
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false
		throw error
	}
}
