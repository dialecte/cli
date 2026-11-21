/** Who signs the keep lines of the cases, and why. */
export const KEEP_BY = 'person'
export const KEEP_REASON = 'performance audit, rerun later'
export const OTHER_KEEP_REASON = 'spike to read again'
export const UNKEEP_REASON = 'audit rerun done'

/** When the keep lines of the cases are written. */
export const KEEP_AT = '2026-11-20T09:00:00.000Z'
export const KEEP_VERB_NOW = new Date(KEEP_AT)

/** The damage of a lot whose transition holds a time the store does not write (`damageLot`). */
export const TRANSITION_DAMAGE = 'a transition holds a time the store does not write'

/** The `lot unkeep` command a kept lot's next names: `{name}` the lot. */
export const UNKEEP_NEXT = 'dialecte lot unkeep {name} --by <who> --reason <text>'
