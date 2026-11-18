import { IGNORED_STATUS_ARGUMENTS } from './removable-ignored.constants.ts'

/** Why the throwaway proof keeps a review-round throwaway; `{...}` filled. */
export const THROWAWAY_KEEP_REASONS = {
	headMoved: 'HEAD is not on {branch}: {head}',
	differs: 'round-{round} differs: {count} path(s), first: {path}',
	noSnapshot: 'no round-{round}/ snapshot: the throwaway holds the only copy',
	heldNowhere: 'hand-made throwaway of {lot}: {count} path(s) held nowhere, first: {path}',
	embedded: 'an untracked folder git status does not look into: {path}',
	gitlink: 'a submodule entry git status does not compare: {path}',
	hidden: '{count} path(s) hidden from git status, first: {path}',
	ignored: 'ignored files git worktree remove would delete: {paths}',
	ignoredMany: '{count} ignored files git worktree remove would delete, first: {paths}',
} as const

/** The argument that adds the ignored entries to git status. */
export const IGNORED_MATCHING_ARGUMENT = '--ignored=matching'

/**
 * `git status` as the proof reads a throwaway: `removableIgnored`'s reading without the ignored entries (never
 * rewriting its index, NUL-separated entries, every untracked file one by one, a folder only when git does not descend
 * it: an embedded repository).
 */
export const STATUS_ARGUMENTS = IGNORED_STATUS_ARGUMENTS.filter(function notIgnored(argument) {
	return argument !== IGNORED_MATCHING_ARGUMENT
})

/** The status code of an untracked entry. */
export const UNTRACKED_STATUS = '??'

/** Git's modes of a tree entry: a file, an executable file, a symbolic link, a submodule. */
export const BLOB_MODE = '100644'
export const EXECUTABLE_MODE = '100755'
export const LINK_MODE = '120000'
export const GITLINK_MODE = '160000'

/**
 * An entry of `git ls-files -v` that git status does not compare: a lowercase tag (assume-unchanged) or `S`
 * (skip-worktree).
 */
export const HIDDEN_FLAG_PATTERN = /^(?:[a-z]|S) /
