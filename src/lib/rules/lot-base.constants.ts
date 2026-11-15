/** The line a run prints when it took its base from the lot link or from the worktree's hygiene baseline. */
export const LOT_BASE_LINE = {
	lot: 'rules: base {sha} (the lot {name})',
	worktree: "rules: base {sha} (the worktree's from {ref})",
} as const
