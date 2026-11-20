/**
 * The line a run without a gate base prints, naming where the one base order found its base; without a caller's
 * prefix, which each caller adds (`rules: `, `bench: `).
 */
export const BASE_LINE = {
	lot: 'base {sha} (the lot {name})',
	baseBranch: 'base {sha} (the merge-base with {branch})',
	/** The base branch's name not found again: never an empty name. */
	baseBranchUnnamed: 'base {sha} (the merge-base with the base branch)',
	releaseTag: 'base {sha} (the release tag {tag})',
	/** The lot base of the worktree's lot cannot be read: no base, the reason named. */
	failure: 'no base ({reason})',
} as const

/** The prefix `rules` and contrib's rules row put before a base line. */
export const RULES_BASE_LINE_PREFIX = 'rules: '
