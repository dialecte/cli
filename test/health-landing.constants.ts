/** The numbers a landing finding gives the hooks of a handover run, in start order. */
export const FIRST_HOOK = 1
export const SECOND_HOOK = 2

/** The lots a case writes: the scratch lot's folder sorts after this one's. */
export const EARLIER_LOT = '0107-cli-first-lot'

export const DEFAULT_GUARDS_MS = 20_000
export const OVER_BUDGET_MS = 400_000
export const HOOK_RAN_MS = 300_000

/** The handover run starts here and, in an over-budget case, lasts 400 s (it ends at 04:06:40). */
export const HR_START_AT = '2026-11-15T04:00:00.000Z'
export const HR_END_AT = '2026-11-15T04:06:40.000Z'
export const AFTER_HR_END_AT = '2026-11-15T04:06:40.001Z'
export const JUST_BEFORE_HR_START_AT = '2026-11-15T03:59:59.999Z'
export const LATER_HR_START_AT = '2026-11-15T05:00:00.000Z'

/** The first hook starts after the guards (HR start + 20 s) and runs 300 s. */
export const HOOK_START_AT = '2026-11-15T04:00:20.000Z'
export const HOOK_START_MINUS_ONE_AT = '2026-11-15T04:00:19.999Z'
export const HOOK_END_AT = '2026-11-15T04:05:20.000Z'
export const HOOK_END_PLUS_SLACK_AT = '2026-11-15T04:06:20.000Z'
export const HOOK_END_PAST_SLACK_AT = '2026-11-15T04:06:20.001Z'
export const HOOK_INSIDE_OTHER_START_AT = '2026-11-15T04:00:30.000Z'
/** After a reused hook of 24 ms, the second hook starts 24 ms after the first and ends 300 s later. */
export const SECOND_HOOK_END_AT = '2026-11-15T04:05:20.024Z'
/** A hook of the earlier lot that starts inside the span of the scratch lot's handover run. */
export const EARLIER_LOT_HOOK_IN_MAIN_SPAN_AT = '2026-11-15T04:01:00.000Z'

export const GREEN_BEFORE_HOOK_AT = '2026-11-15T03:00:00.000Z'
export const GREEN_AFTER_HOOK_AT = '2026-11-15T04:03:00.000Z'

export const HR_EARLIEST_START_AT = '2026-11-15T02:30:00.000Z'
export const HR_PREVIOUS_START_AT = '2026-11-15T03:00:00.000Z'
export const HR_PREVIOUS_MS = 120_000
export const REHEARSAL_BEFORE_PREVIOUS_AT = '2026-11-15T02:00:00.000Z'
export const REHEARSAL_BETWEEN_PREVIOUS_AT = '2026-11-15T02:40:00.000Z'
export const REHEARSAL_AFTER_PREVIOUS_AT = '2026-11-15T03:20:00.000Z'
export const REHEARSAL_ENDING_AFTER_HR_AT = '2026-11-15T03:55:00.000Z'
export const REHEARSAL_LONG_MS = 1_200_000
export const REHEARSAL_SHORT_MS = 600_000

export const HANDOVER_BEFORE_WINDOW_AT = '2026-11-14T23:00:00.000Z'
/** A run of 400 s that started before the window and ended inside it (since is 00:00), and one that ends after now (12:00). */
export const HANDOVER_ENDS_AFTER_SINCE_AT = '2026-11-14T23:58:00.000Z'
export const HANDOVER_ENDS_AFTER_NOW_AT = '2026-11-15T11:58:00.000Z'

export const REAL_LANDING_AT = '2026-11-15T04:10:12.968Z'

/** The detail of a landing whose one hook ran 5 m 0 s and was not reused. */
export const NOT_REUSED_DETAIL = `guards 20 s · lot ${FIRST_HOOK} hook ran 5 m 0 s - not reused`
