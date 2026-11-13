import type { CheckName } from './next-station.types.ts'

/** The cli steps whose `step.end` is a check of the walk; any other kind (gate-release, gate-hook, mutation, worktree-add) is none. */
export const CHECK_STEPS: readonly CheckName[] = [
	'tdd-red',
	'tdd-green',
	'gate-fast',
	'gate-full',
	'contrib',
]

/** The gate records a lot's worktree holds as checks: the `{mode}` of `dialecte-gate-{mode}.json` and its check. */
export const RECORD_CHECKS: readonly { mode: string; check: CheckName }[] = [
	{ mode: 'fast', check: 'gate-fast' },
	{ mode: 'full', check: 'gate-full' },
	{ mode: 'contrib', check: 'contrib' },
]

/**
 * A go-ahead row of `decisions.md` for a review round above the cap (33L1 section 6): its fixed prefix `round <n>
 * beyond the cap`, then ` of <cap>: <reason>`; the round in the first group, the reason in the second.
 */
export const BEYOND_CAP_PATTERN = /^round ([1-9]\d*) beyond the cap(?: of \d+)?(?:: ([\s\S]*))?$/

/** The order of a worktree record against an event of the same time: before it (a tie is not after, 33L1 D4). */
export const RECORD_RANK = 0

/** The order of an event against a worktree record or a snapshot of the same time. */
export const EVENT_RANK = 1
