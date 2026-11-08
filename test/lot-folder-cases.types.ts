/** What the folder rule decides about a folder. */
export type FolderCase = {
	name: string
	/** The path the verb is given. */
	folder: string
	/** The real path of the lot folder when it is one; undefined when it is no lot folder. */
	lot: string | undefined
}

/** The places of the scratch repository the folder cases point at. */
export type FolderLayout = {
	repository: string
	/** The real path of `<git common folder>/dialecte-lots`. */
	store: string
	/** The real path of the lot folder. */
	lotFolder: string
	/** `<worktree>/.dialecte/lot`, a link to the lot folder. */
	link: string
	/** A link of another name to the lot folder. */
	otherLink: string
	/** A `dialecte-lots` folder that is no git common folder's. */
	looseStore: string
	/** `<git folder>/worktrees/<x>/dialecte-lots`: a linked worktree's own git folder holds HEAD, no objects and no refs. */
	worktreeGitStore: string
}
