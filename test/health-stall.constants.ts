export const STALL_LOT = '0104-cli-stall-run'
export const OTHER_STALL_LOT = '0105-cli-other-run'
export const STALL_COMMON = '/workspace/cli/.git'
export const STALL_FOLDER_ROOT = `${STALL_COMMON}/dialecte-lots`
export const STALL_WORKTREE = `/workspace/.worktrees/${STALL_LOT}`
export const OTHER_WORKTREE = `/workspace/.worktrees/${OTHER_STALL_LOT}`
export const STALL_PID = 31337
export const STALL_FIRST_PID = 424242

const HOUR_MS = 3_600_000
export const ONE_HOUR_MS = HOUR_MS
export const TWO_HOURS_MS = 2 * HOUR_MS
export const TWO_AND_A_HALF_HOURS_MS = 2.5 * HOUR_MS
export const THREE_HOURS_MS = 3 * HOUR_MS
export const FOUR_HOURS_MS = 4 * HOUR_MS
export const ONE_MS = 1

export const STALL_NOW = new Date('2026-11-15T12:00:00.000Z')

/** The values of the three thresholds the spec pins. */
export const STEP_STALL_SPEC_MS = 7_200_000
export const HEAVY_STEP_STALL_SPEC_MS = 10_800_000
export const STATION_STALL_SPEC_MS = 14_400_000

/** The real interrupted handover run of the stall lot (09:33 on 2026-11-15, 2416028 ms). */
export const INTERRUPTED_AT = '2026-11-15T09:33:20.000Z'
export const INTERRUPTED_MS = 2_416_028
export const INTERRUPTED_FOR = '40 m 16 s'

/** The steps of each resume family and the command a stalled run of it gives (`{worktree}` and `{folder}` filled). */
export const RESUME_CASES: ReadonlyArray<{ step: string; next: string }> = [
	{ step: 'gate-fast', next: `cd ${STALL_WORKTREE} && dialecte gate --fast` },
	{ step: 'gate-full', next: `cd ${STALL_WORKTREE} && dialecte gate --full` },
	{
		step: 'gate-release',
		next: `cd ${STALL_WORKTREE} && dialecte gate --release`,
	},
	{ step: 'contrib', next: `cd ${STALL_WORKTREE} && dialecte contrib` },
	{ step: 'tdd-red', next: `cd ${STALL_WORKTREE} && dialecte tdd red` },
	{ step: 'tdd-green', next: `cd ${STALL_WORKTREE} && dialecte tdd green` },
	{
		step: 'gate-hook',
		next: `dialecte handover run ${STALL_FOLDER_ROOT}/${STALL_LOT}`,
	},
	{
		step: 'handover-run',
		next: `dialecte handover run ${STALL_FOLDER_ROOT}/${STALL_LOT}`,
	},
	{
		step: 'rehearsal',
		next: `dialecte handover run ${STALL_FOLDER_ROOT}/${STALL_LOT}`,
	},
	{ step: 'mutation', next: `dialecte lot status ${STALL_LOT}` },
	{ step: 'worktree-add', next: `dialecte lot status ${STALL_LOT}` },
	{ step: 'throwaway-add', next: `dialecte lot status ${STALL_LOT}` },
]

/** The scratch clock, the detail line every finding of the stall worktree carries, and the two commands a stalled run gives. */
export const NOW = STALL_NOW
export const DETAIL = [`worktree ${STALL_WORKTREE}`]
export const HANDOVER_NEXT = RESUME_CASES.find((row) => row.step === 'handover-run')?.next
export const GATE_FULL_NEXT = RESUME_CASES.find((row) => row.step === 'gate-full')?.next
