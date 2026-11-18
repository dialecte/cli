/** The evidences of a merge, in the order the reader asks them after `empty`: git's ancestry, the host, the tree. */
export const LANDING_EVIDENCES = ['ancestor', 'host', 'tree'] as const

/** Why a landing state is unknown: `{branch}` the lot's branch, `{ref}` the base ref. */
export const LANDING_UNKNOWN = {
	noBranch: 'the branch {branch} does not resolve',
	noBase: 'the base {ref} does not resolve: fetch origin',
} as const

/** The doubts an unlanded reading can carry: a landing git alone cannot prove. */
export const LANDING_PROOFS = ['offline-unproven'] as const

/** A reflog entry as the lot's own commits are read from it: its commit and its selector dated in unix seconds. */
export const REFLOG_ENTRY_FORMAT = '--format=%H %gd'

/** The commit and the unix seconds of a `REFLOG_ENTRY_FORMAT` line (`<sha> refs/heads/<branch>@{<seconds>}`). */
export const REFLOG_ENTRY_PATTERN = /^([0-9a-f]+) .*@\{(\d+)\}$/
