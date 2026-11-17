/** The prefixes a ref's label drops: `refs/remotes/origin/main` reads `origin/main`, `refs/heads/feat/x` `feat/x`. */
export const REF_LABEL_PREFIXES: readonly string[] = ['refs/remotes/', 'refs/heads/']

/** The refs a stacked lot's parent line is read from: its local branch and origin's (`{branch}` its name). */
export const PARENT_REF_TEMPLATES: readonly string[] = [
	'refs/heads/{branch}',
	'refs/remotes/origin/{branch}',
]

/** Why a lot's base cannot be read: `{head}` the lot's head, `{ref}` the line it forks from. */
export const LOT_BASE_REFUSALS = {
	noHead: "the lot's head {head} does not resolve",
	noForkPoint: "the lot's head {head} shares no commit with {ref}",
	noParentRef: 'the stack parent {branch} has no branch here nor on origin',
} as const
