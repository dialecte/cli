/** A package on main and a branch with one commit, not merged: the trees the cards of the gate records check. */
export type MergeFixture = {
	root: string
	/** The tree the merge hand-over commits: the trial merge of the branch on main. */
	mergedTree: string
	/** The worktree's tree (HEAD's tree, the working files clean). */
	ownTree: string
}
