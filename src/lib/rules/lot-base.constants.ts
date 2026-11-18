/** The line a run without a gate base prints, naming where the one base order found its base. */
export const BASE_LINE = {
	lot: 'rules: base {sha} (the lot {name})',
	baseBranch: 'rules: base {sha} (the merge-base with {branch})',
	/** The base branch's name not found again: never an empty name. */
	baseBranchUnnamed: 'rules: base {sha} (the merge-base with the base branch)',
	releaseTag: 'rules: base {sha} (the release tag {tag})',
	/** The lot base of the worktree's lot cannot be read: no base, the reason named. */
	failure: 'rules: no base ({reason})',
} as const
