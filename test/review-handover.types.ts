/** A written hand-over, as the `handover review` cases need it. */
export type ReviewHandover = {
	/** The repository the hand-over was written in (the main checkout). */
	root: string
	/** The registered name of the hand-over. */
	name: string
	/** The hand-over folder, as the registry holds it. */
	folder: string
	/** The lots file's `repository`: the worktree the review opens. */
	worktree: string
}
