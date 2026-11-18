/** What `lot close` says of a target beyond the shared keep rules; `{...}` filled. */
export const CLOSE_TARGET_TEXTS = {
	/** A lot target whose lot is open: its name, its state and why it is not landed. */
	open: 'lot {lot} {state}: {why}',
	/** A lot target whose identity names no branch: nothing to compare its worktree with. */
	noBranch: 'its identity names no branch: nothing to compare its worktree with',
	/** An argument naming no hand-over and no lot. */
	unknown: 'no hand-over nor lot named or indexed {argument}: nothing closed for it',
	/** A lot target whose worktree is gone with no removal recorded that moved it. */
	nothingToClose:
		'its worktree {worktree} is gone and no removal recorded moved it: nothing to close',
	/** A lot's declaration neither archive of its folder holds, both taken by other bytes. */
	declarationKept:
		'.dialecte/lot.json: {archived} and {landed} of {folder} both hold other bytes; nothing archives it',
} as const
