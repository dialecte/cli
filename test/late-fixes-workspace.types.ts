/** Where a story plays: the worktree and the folder that holds the lot's snapshots and `verify.jsonl`. A scratch store lot is one. */
export type StoryTarget = { cwd: string; lotFolder: string }

/** One thing that happens to a lot in a late-fix story, in order. */
export type LateFixesStep =
	| { snapshot: number; withoutState?: true }
	| { edit: Record<string, string> }
	/** Files of the worktree deleted. */
	| { remove: string[] }
	/** A verify line of the worktree as it is now. */
	| { verifyHere: { by: string; note: string } }
	/** A verify line of a state the worktree is not in. */
	| { verifyOther: { by: string; note: string } }
	/** Text appended to `verify.jsonl` as it is, line breaks included. */
	| { raw: string }
