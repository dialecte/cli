import { WINDOW } from './health.constants.ts'

/** The clock of the inbox's health cases: the end of the health window. */
export const INBOX_HEALTH_NOW = WINDOW.now

/** The inbox's health window: 24 hours. */
export const INBOX_HEALTH_WINDOW_SPEC_MS = 86_400_000

/** The repository folder of the cases' workspace, and the lots written into its store. */
export const HEALTH_INBOX_REPOSITORY = 'cli'
export const COMMITTED_LOT = '0200-cli-done'
export const READY_LOT = '0201-cli-ready'
export const STALLED_LOT = '0108-cli-stalled-run'
export const STALLED_WORKTREE = `/workspace/.worktrees/${STALLED_LOT}`
export const STALLED_START_AT = '2026-11-14T08:00:00.000Z'
export const IDLE_WORKTREE_NAME = '0001-cli-old'

/** The next command of a finding that names none. */
export const REPOSITORY_NEXT = `dialecte health --repository ${HEALTH_INBOX_REPOSITORY}`
export const SCRATCH_NEXT = 'dialecte health'

/** The rehearsal's lot the real fixture re-ran. */
const RERAN_LOT_NUMBER = 2

/** The lot of the real 0105 fixture and the three lines the inbox prints for it, newest finding first. */
export const FIXTURE_LOT = '0105-cli-lot-scope'
export const FIXTURE_LINES = [
	`✗ health  cli  ${FIXTURE_LOT}  duplicate work: tree c7fef5d3019b: hook ran 15 m 42 s although a green hook record existed (2026-11-15T03:33:49.995Z, rehearsal)  next: ${REPOSITORY_NEXT}`,
	`✗ health  cli  ${FIXTURE_LOT}  landing time: handover run 16 m 39 s (budget 5 m 0 s) at 2026-11-15T04:10:12.968Z  next: ${REPOSITORY_NEXT}`,
	`✗ health  cli  ${FIXTURE_LOT}  duplicate work: tree c7fef5d3019b: the rehearsal re-ran lot ${RERAN_LOT_NUMBER} for 30 m 24 s although a green hook record existed (2026-11-15T03:33:49.995Z, rehearsal)  next: ${REPOSITORY_NEXT}`,
]

/** A duplicate-work case's times: a green hook record and its re-run, in the window and two days before it. */
export const FRESH_TIMES = {
	greenAt: '2026-11-15T01:00:00.000Z',
	rerunAt: '2026-11-15T02:10:00.000Z',
}
export const OLD_TIMES = {
	greenAt: '2026-11-13T01:00:00.000Z',
	rerunAt: '2026-11-13T02:10:00.000Z',
}

/** The inbox line of the fresh duplicate-work case. */
export const FRESH_DUPLICATE_LINE = `✗ health  cli  0108-cli-health-run  duplicate work: tree 7a1b2c3d4e5f: hook ran 10 m 0 s although a green hook record existed (2026-11-15T01:00:00.000Z)  next: ${REPOSITORY_NEXT}`

/** The line of the stalled lot: its dead gate-full run and the command that resumes it. */
export const STALLED_LINE = `✗ health  cli  ${STALLED_LOT}  stalled run: gate-full stalled: started ${STALLED_START_AT}, pid 4242 is gone  next: cd ${STALLED_WORKTREE} && dialecte gate --full`

/** The idle worktree's amber line: the registered worktree was last touched 124 hours before the clock. */
export const IDLE_LINE = `! health  cli  worktrees: 1 idle worktree with no open lot (oldest ${IDLE_WORKTREE_NAME}, idle 124 h 0 m)  next: ${REPOSITORY_NEXT}`

/** How long before the clock a leaked scratch folder was last touched. */
export const SCRATCH_AGE_MS = 7 * 3_600_000
