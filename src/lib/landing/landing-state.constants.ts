/** The evidences of a merge, in the order the reader asks them after `empty`: git's ancestry, the host, the tree. */
export const LANDING_EVIDENCES = ['ancestor', 'host', 'tree'] as const

/** Why a landing state is unknown: `{branch}` the lot's branch, `{ref}` the base ref. */
export const LANDING_UNKNOWN = {
	noBranch: 'the branch {branch} does not resolve',
	noBase: 'the base {ref} does not resolve: fetch origin',
} as const

/** The doubts an unlanded reading can carry: a landing git alone cannot prove. */
export const LANDING_PROOFS = ['offline-unproven'] as const
