import { RECORD_CHECKS } from './station-records.constants.ts'

import type { BriefEffort } from './brief.types.ts'
import type { CheckName, StationName, StationVerdict } from './next-station.types.ts'
import type { LotStateName } from './store.types.ts'

/** The loop's seven stations (33 section 7). Any other name is shown, never placed. */
export const STATION_NAMES = [
	'test-writer',
	'test-reviewer',
	'implementer',
	'reviewer',
	'fixer',
	'adjudicator',
	'independent-reviewer',
] as const

/** The stations whose ends carry a `--step`. */
export const STEP_STATIONS: readonly StationName[] = ['test-writer', 'test-reviewer', 'implementer']

/** The stations whose ends carry a `--round`. */
export const ROUND_STATIONS: readonly StationName[] = ['reviewer', 'fixer', 'adjudicator']

/** The checks a worktree keeps one record of per gate mode (`records` mode): a later green one covers earlier claims. */
export const RECORD_GATE_CHECKS: readonly CheckName[] = RECORD_CHECKS.map(({ check }) => check)

/** The stations that edit the tree: the full gate must come after the last of them. */
export const EDIT_STATIONS: readonly StationName[] = ['test-writer', 'implementer', 'fixer']

/** The review rounds of an effort; an undefined effort allows 1 and every round above it needs a go-ahead. */
export const REVIEW_ROUND_CAPS: Record<BriefEffort, number> = { low: 1, medium: 2, high: 3 }

/** The cap of a lot whose effort is not known. */
export const UNKNOWN_EFFORT_CAP = 1

/** The lot states that answer without a station walk (row 1). */
export const STATIONLESS_STATES: readonly LotStateName[] = [
	'committed',
	'canceled',
	'failed',
	'ready',
]

/** The verdicts that leave a station to run again: its end is not "ended". */
export const AGAIN_VERDICTS: readonly StationVerdict[] = ['failed', 'limit']

/** A test review that sends the tests back this many times asks the person. */
export const TEST_REVIEW_BACK_LIMIT = 3

/** The backs that send the tests to the test-writer again (the limit's own back asks the person). */
export const TEST_REVIEW_BACK_MAX = TEST_REVIEW_BACK_LIMIT - 1

/** The `why` lines, templates with `{id}`, `{state}`, `{station}`, `{at}`, `{run}`, `{step}`, `{round}`, `{n}`, `{cap}`, `{verdict}`, `{max}`, `{limit}`, `{exit}`. */
export const NEXT_STATION_WHY = {
	lotState: 'lot {state}',
	questionOpen: 'question {id} open',
	running: '{station} running since {at} (run {run})',
	noTest: 'step {step}: no test written',
	redNotProved: 'test-writer step {step} ended, red not proved',
	testsNotReviewed: 'step {step}: tests not reviewed',
	testReviewBack: 'test review back {n} of {max}',
	testReviewBackLimit: 'test review back {limit} times',
	notImplemented: 'step {step}: tests approved, not implemented',
	notImplementedLow: 'step {step}: red proved, not implemented',
	testWrong: 'the implementer says a test is wrong',
	claimUnchecked: 'implementer step {step} ended, claim unchecked',
	stationAgain: '{station} again: {verdict}',
	stationAgainExit: '{station} again: exit {exit}',
	endedWithoutVerdict: '{station} ended without a verdict',
	endedWithVerdict: '{station} ended with {verdict}',
	notSnapshot: 'round {round} not snapshot',
	notReviewed: 'round {round} snapshot, not reviewed',
	reviewerFix: 'reviewer round {round}: fix-then-repass',
	fixerDisagreed: 'fixer round {round}: disagreed',
	fixerClaimUnchecked: 'fixer round {round} ended, claim unchecked',
	roundCap: 'round cap {cap} reached',
	noFullGate: 'review approved, no full gate after the last edit',
	noContrib: 'full gate passed, contrib not run',
	noIndependent: 'no independent review after the full gate',
	independentFix: 'independent review: fix-then-repass',
	independentFixerClaimUnchecked: 'independent review fixer ended, claim unchecked',
	noHandover: 'no hand-over written',
	handoverWritten: 'hand-over written',
	noStationRecorded: 'no station recorded: record them with lot station',
	noStepRecords: "the worktree's cli records no steps",
} as const
