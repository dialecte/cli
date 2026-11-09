import { TEMPORARY_INFIX } from '../lib/store/store.constants.ts'

import type { BriefEffort } from '../lib/store/brief.types.ts'

/** The options `lot start` takes followed by a value, and its flags, without the dashes. */
export const START_VALUE_OPTIONS: readonly string[] = ['effort']
export const START_FLAGS: readonly string[] = ['dry-run', 'json']

/** The effort of a lot whose brief and flags name none (S; L1 replaces it by the risk class). */
export const DEFAULT_EFFORT: BriefEffort = 'medium'

/** The schema of `identity.json`. */
export const IDENTITY_SCHEMA = 1

/** Who publishes the transitions of `lot start`, and the reasons of its own. */
export const ENGINE = 'engine'
export const START_REASON = 'lot started'
export const OVERLAP_REASON = 'overlap with {lot}, started at the same time'
export const BRANCH_MADE_SUFFIX = '; the branch {branch} was made: a retry meets branch-exists'

/** The note of a link that could not be made once the worktree exists (the lot goes on). */
export const LINK_REFUSED_NOTE =
	'the link {link} to the lot folder could not be made: {reason}; open the lot by its id'

/**
 * The final name the hard-link probe's files are temporaries of, and its two files below the store folder
 * (`<final name>.tmp-<pid>-<n>`: never a record; a dead pid's are swept as any temporary of that name).
 */
export const PROBE_NAME = '.link-probe'
export const PROBE_SOURCE = `${PROBE_NAME}${TEMPORARY_INFIX}{pid}-1`
export const PROBE_TARGET = `${PROBE_NAME}${TEMPORARY_INFIX}{pid}-2`
