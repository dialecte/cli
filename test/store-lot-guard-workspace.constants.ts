import { GUARD_NAME_WIDTH } from '../src/lib/handover/handover.constants.ts'

/** The change every hand-over of these cases commits. */
export const READ_CHANGES: Readonly<Record<string, string>> = {
	'src/read.ts': 'export function read() {\n\treturn 1\n}\n',
}

/** The go-ahead the cases give: `--not-a-lot --by reviewer --reason r`. */
export const GO_AHEAD_ARGV: readonly string[] = ['--not-a-lot', '--by', 'reviewer', '--reason', 'r']

/** What the printed folder is shown as in a guard line. */
export const FOLDER_PLACEHOLDER = '<folder>'

/** The guard's name padded as a run prints it, then the duration a fake clock gives every guard. */
export const LOT_GUARD_PREFIX = 'lot'.padEnd(GUARD_NAME_WIDTH)
export const GUARD_DURATION = '0.0 s'

/** Where a hand-over of a store lot is refused or goes ahead: the refusal for a folder that is not a lot of the store. */
export const NOT_A_LOT_REFUSAL = `${FOLDER_PLACEHOLDER} is not a lot of the store: start lots with dialecte lot start (LOT-RULES)`

/** The go-ahead's reading, by `reviewer` for `r`. */
export const GO_AHEAD_DETAIL = 'not a store lot (by reviewer: r)'

/** The identity another lot's folder holds. */
export const OTHER_LOT_NAME = '0099-repo-other'

/** The folder of a hand-over whose first line a run prints. */
export const RUN_FIRST_LINE_PREFIX = 'handover run '

/** The time the decisions rows of the unit cases are dated from (local noon). */
export const GO_AHEAD_NOW = new Date(2026, 10, 12, 12, 0, 0)
export const GO_AHEAD_DAY = '2026-11-12'

/** The card's `lot` line of a folder that is not a store lot and holds no go-ahead row. */
export const REFUSING_LINE = {
	name: 'lot',
	status: 'failed',
	detail:
		'not a store lot: handover run will refuse (go ahead with --not-a-lot --by <who> --reason <text>)',
}

/** The card's `lot` line of a folder holding the go-ahead row of `reviewer` for `r`. */
export const GO_AHEAD_LINE = {
	name: 'lot',
	status: 'warning',
	detail: 'not a store lot (by reviewer: r)',
}
