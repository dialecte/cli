/** The mutation declaration of the step-event cases: the scope of the scratch package and its fast tier. */
export const MUTATION_DECLARATION = {
	scope: ['src/engine/*.ts'],
	fast: { vitestConfig: 'v.config.ts' },
}

/** The branch the step lot's worktree is switched to: what the mutation code files its runs under. */
export const MUTATION_LOT_BRANCH = 'feat/0172-repo-other'

/** The second lot of the store that branch names (its own worktree is elsewhere). */
export const NAMED_BY_BRANCH_LOT = '0172-repo-other'
