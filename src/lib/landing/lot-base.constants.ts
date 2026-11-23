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
	joinConflict:
		"the lines the lot holds ({a}, {b}) do not merge clean ({paths}): its own change cannot be told apart from {base}'s; rebase it onto {base} once its parent landed, or merge {base} into its parent first",
	joinConflictUnproven:
		"the lines the lot holds ({a}, {b}) do not merge clean ({paths}), and its parent {branch} may have landed though git alone cannot prove it: record the parent's landing (lot close on the parent's lot), then read it again; or rebase it onto {base} once its parent landed, or merge {base} into its parent first",
	joinFailed: 'the lines the lot holds ({a}, {b}) could not be joined: {reason}',
	independentFailed: 'the lines the lot holds ({lines}) could not be compared: {reason}',
	mergeBaseFailed: "the lot's head {head} could not be compared with {ref}: {reason}",
} as const

/** Why a git read of the lot's base gave nothing to go on, when it exited 0 with no output. */
export const LOT_BASE_GIT_REASONS = {
	independentEmpty: 'git named none of them',
	mergeTreeEmpty: 'git merge-tree printed no tree',
	commitTreeEmpty: 'git commit-tree printed no commit',
	treeReadEmpty: 'git rev-parse printed no tree',
} as const

/** How the lines named in a comparison refusal are listed. */
export const LINE_LABEL_SEPARATOR = ', '

/** The message of the commit that joins the lines a lot holds (no ref names it). */
export const LOT_BASE_JOIN_MESSAGE = 'dialecte lot base: join of the lines the lot holds'

/** How the conflicted paths of a join are listed in its refusal. */
export const JOIN_PATH_SEPARATOR = ', '
