/**
 * The proof a review-round throwaway may go: every path it changed is kept elsewhere (its round snapshot, or a held
 * commit), its ignored entries are rebuilt or copies, no commit only it holds would be lost, and its HEAD is still on
 * the branch it was made on. Read-only: git and the disk, nothing moved.
 */
import { createHash } from 'node:crypto'
import { existsSync, lstatSync, readFileSync, readlinkSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { readCommitOrNone, readGit, tryReadGit } from '../git.ts'
import { fillMessage } from '../knowledge/standard/fill-message.ts'
import { lostWork, lostWorkText } from '../landing/lost-work.ts'
import { roundNames } from '../review-rounds/round-names.ts'
import { IGNORED_FILES_SHOWN } from '../worktree/worktree.constants.ts'
import { STATUS_WITH_ORIGINAL_PATH } from './removable-ignored.constants.ts'
import { removableIgnored } from './removable-ignored.ts'
import {
	BLOB_MODE,
	EXECUTABLE_MODE,
	GITLINK_MODE,
	HIDDEN_FLAG_PATTERN,
	LINK_MODE,
	STATUS_ARGUMENTS,
	THROWAWAY_KEEP_REASONS,
	UNTRACKED_STATUS,
} from './throwaway-proof.constants.ts'

import type {
	BlobVersion,
	StatusEntry,
	ThrowawayProof,
	ThrowawayProofParameters,
} from './throwaway-proof.types.ts'

/**
 * Whether the throwaway may go, or the first reason that keeps it: its HEAD off its branch, a path git status cannot
 * see (a gitlink, an assume-unchanged or skip-worktree flag, an untracked folder it does not descend), a changed path
 * kept nowhere else, an ignored entry nothing rebuilds or copies, a commit only it holds.
 *
 * Throws when git cannot read the throwaway (its folder gone, a broken repository): the caller keeps it then.
 *
 * @intent never remove a review throwaway that holds the only copy of anything
 * @internal
 */
export function proveThrowaway(params: ThrowawayProofParameters): ThrowawayProof {
	const kept =
		headMoved(params) ??
		hiddenFromStatus(params.throwaway) ??
		changedNotKept(params) ??
		ignoredKept(params) ??
		lostCommits(params)
	return kept === undefined ? { goes: true } : { goes: false, kept }
}

/** The throwaway's HEAD is no longer on its branch: where it is now. */
function headMoved(params: ThrowawayProofParameters): string | undefined {
	const { throwaway, branch } = params
	const head = tryReadGit({
		root: throwaway,
		args: ['symbolic-ref', '--quiet', '--short', 'HEAD'],
	})?.trim()
	if (head === branch) return undefined
	return fillMessage({
		template: THROWAWAY_KEEP_REASONS.headMoved,
		values: { branch, head: head || 'a detached HEAD' },
	})
}

/** A gitlink, or a path git status hides (assume-unchanged, skip-worktree): what status cannot compare keeps it. */
function hiddenFromStatus(throwaway: string): string | undefined {
	const staged = nulEntries(readGit({ root: throwaway, args: ['ls-files', '-s', '-z'] }))
	const gitlink = staged.find((entry) => entry.startsWith(`${GITLINK_MODE} `))
	if (gitlink !== undefined)
		return fillMessage({
			template: THROWAWAY_KEEP_REASONS.gitlink,
			values: { path: gitlink.slice(gitlink.indexOf('\t') + 1) },
		})
	const hidden = nulEntries(readGit({ root: throwaway, args: ['ls-files', '-v', '-z'] }))
		.filter((entry) => HIDDEN_FLAG_PATTERN.test(entry))
		.map((entry) => entry.slice(2))
		.sort()
	if (hidden.length === 0) return undefined
	return fillMessage({
		template: THROWAWAY_KEEP_REASONS.hidden,
		values: { count: String(hidden.length), path: hidden[0] },
	})
}

/**
 * Each changed path's working file and staged blob compared with the round snapshot and the held commits: the first
 * path kept nowhere else, with how many are not; an untracked folder git does not descend keeps it.
 */
function changedNotKept(params: ThrowawayProofParameters): string | undefined {
	const { throwaway, lotFolder, round } = params
	const entries = statusEntriesOf(throwaway)
	if (entries.length === 0) return undefined
	const embedded = entries.find((entry) => entry.untracked && entry.path.endsWith('/'))
	if (embedded !== undefined)
		return fillMessage({
			template: THROWAWAY_KEEP_REASONS.embedded,
			values: { path: embedded.path },
		})
	const names = roundNames(round)
	const snapshot = join(lotFolder, names.folder)
	if (!isDirectory(snapshot))
		return fillMessage({
			template: THROWAWAY_KEEP_REASONS.noSnapshot,
			values: { round: String(round) },
		})
	const deleted = new Set(nulEntries(readOrEmpty(join(lotFolder, names.deleted))))
	const holders = params.holders.flatMap(function resolved(ref) {
		const commit = readCommitOrNone({ root: throwaway, ref })
		return commit === undefined ? [] : [commit]
	})
	const paths = [...new Set(entries.map((entry) => entry.path))].sort()
	const differ = paths.filter(function notKept(path) {
		const kept = keptVersionsOf({ throwaway, snapshot, deleted, holders, path })
		const staged = entries.some((entry) => entry.path === path && entry.staged)
		return ![
			workingVersionOf({ throwaway, path }),
			...(staged ? [indexVersionOf({ throwaway, path })] : []),
		].every((version) => kept.some((one) => sameVersion(one, version)))
	})
	if (differ.length === 0) return undefined
	return fillMessage({
		template: THROWAWAY_KEEP_REASONS.differs,
		values: { round: String(round), count: String(differ.length), path: differ[0] },
	})
}

/** The versions of `path` kept elsewhere: the snapshot's file (or its deletion), each held commit's blob. */
function keptVersionsOf(params: {
	throwaway: string
	snapshot: string
	deleted: ReadonlySet<string>
	holders: readonly string[]
	path: string
}): BlobVersion[] {
	const { path } = params
	const fromSnapshot = fileVersionOf(join(params.snapshot, path))
	return [
		...(fromSnapshot === undefined ? [] : [fromSnapshot]),
		...(params.deleted.has(path) ? ['absent' as const] : []),
		...params.holders.flatMap(function blobIn(holder) {
			const listed = tryReadGit({
				root: params.throwaway,
				args: ['--literal-pathspecs', 'ls-tree', '-z', holder, '--', path],
			})
			const entry = nulEntries(listed ?? '')[0]
			if (entry === undefined) return []
			const [mode, , sha] = entry.slice(0, entry.indexOf('\t')).split(' ')
			return [{ mode, sha }]
		}),
	]
}

/** The working file's version: absent when gone from disk. */
function workingVersionOf(params: { throwaway: string; path: string }): BlobVersion {
	return fileVersionOf(join(params.throwaway, params.path)) ?? 'absent'
}

/** The staged blob's version: absent when the index no longer holds the path (a staged deletion). */
function indexVersionOf(params: { throwaway: string; path: string }): BlobVersion {
	const entry = nulEntries(
		readGit({
			root: params.throwaway,
			args: ['--literal-pathspecs', 'ls-files', '-s', '-z', '--', params.path],
		}),
	)[0]
	if (entry === undefined) return 'absent'
	const [mode, sha] = entry.slice(0, entry.indexOf('\t')).split(' ')
	return { mode, sha }
}

/** A file's or link's version as git would store it (no filter): its mode and blob id; undefined when there is none. */
function fileVersionOf(path: string): BlobVersion | undefined {
	let status
	try {
		status = lstatSync(path)
	} catch {
		return undefined
	}
	if (status.isSymbolicLink())
		return { mode: LINK_MODE, sha: blobIdOf(readlinkSync(path, { encoding: 'buffer' })) }
	if (!status.isFile()) return undefined
	// git keeps one executable bit: the owner's
	return {
		mode: (status.mode & 0o100) !== 0 ? EXECUTABLE_MODE : BLOB_MODE,
		sha: blobIdOf(readFileSync(path)),
	}
}

function blobIdOf(bytes: Buffer): string {
	return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')
}

function sameVersion(left: BlobVersion, right: BlobVersion): boolean {
	if (left === 'absent' || right === 'absent') return left === right
	return left.mode === right.mode && left.sha === right.sha
}

/** The ignored entries `git worktree remove` would delete that nothing rebuilds or copies. */
function ignoredKept(params: ThrowawayProofParameters): string | undefined {
	const { kept } = removableIgnored({ worktree: params.throwaway, main: params.main })
	if (kept.length === 0) return undefined
	const shown = kept.slice(0, IGNORED_FILES_SHOWN).join(', ')
	return kept.length > IGNORED_FILES_SHOWN
		? fillMessage({
				template: THROWAWAY_KEEP_REASONS.ignoredMany,
				values: { count: String(kept.length), paths: shown },
			})
		: fillMessage({ template: THROWAWAY_KEEP_REASONS.ignored, values: { paths: shown } })
}

/** The commits only the throwaway's HEAD holds, which its removal would lose. */
function lostCommits(params: ThrowawayProofParameters): string | undefined {
	const lost = lostWork({
		root: params.throwaway,
		removes: { worktrees: [params.throwaway], branches: [] },
		landedTips: params.landedTips,
	})
	return lost.length === 0 ? undefined : lostWorkText(lost)
}

/**
 * The entries of `git status -z --porcelain=v1 --untracked-files=all`: each path with whether it is untracked and
 * whether its index differs from HEAD; a rename or copy record gives both its paths.
 */
function statusEntriesOf(throwaway: string): StatusEntry[] {
	const tokens = nulEntries(readGit({ root: throwaway, args: [...STATUS_ARGUMENTS] }))
	const entries: StatusEntry[] = []
	for (let index = 0; index < tokens.length; index++) {
		const token = tokens[index]
		const code = token.slice(0, 2)
		const untracked = code === UNTRACKED_STATUS
		const staged = !untracked && code[0] !== ' '
		entries.push({ path: token.slice(3), untracked, staged })
		if (STATUS_WITH_ORIGINAL_PATH.some((letter) => code.includes(letter))) {
			index++
			entries.push({ path: tokens[index], untracked: false, staged: true })
		}
	}
	return entries
}

function nulEntries(text: string): string[] {
	return text.split('\0').filter(Boolean)
}

function readOrEmpty(path: string): string {
	return existsSync(path) ? readFileSync(path, 'utf8') : ''
}

function isDirectory(path: string): boolean {
	try {
		return statSync(path).isDirectory()
	} catch {
		return false
	}
}
