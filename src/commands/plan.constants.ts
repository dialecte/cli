/** The words of `dialecte plan`: its verbs, the options each knows, the one state a mark records. */

/** The command's name, as its answers start. */
export const PLAN_COMMAND_NAME = 'plan'

/** The verbs of `plan`. */
export const PLAN_VERBS = { next: 'next', check: 'check', mark: 'mark' } as const

/** The flags of `plan next` and of `plan check`. */
export const PLAN_NEXT_FLAGS: readonly string[] = ['json', 'all']
export const PLAN_CHECK_FLAGS: readonly string[] = ['json']

/** The value options of `plan mark`. */
export const PLAN_MARK_OPTIONS = { by: 'by', reason: 'reason' } as const

/** The one state `plan mark` records. */
export const PLAN_MARK_STATE = 'done'

/** The exit codes of `plan`: answered, no lot can start, usage or refused. */
export const PLAN_EXIT = { answered: 0, noLot: 1, refused: 2 } as const
