import type { WorktreeCli } from '../src/lib/events/event.types.ts'

/** The cli of a lot's worktree that writes step events, and one that does not (core, scl, nsd and plc until their bumps). */
export const STEP_EVENTS_CLI: WorktreeCli = { version: '0.5.0', stepEvents: true }
export const NO_STEP_EVENTS_CLI: WorktreeCli = { version: '0.4.0', stepEvents: false }

/** The test day's clock at second 0 of every `second` the station-records tests name: 10:00:00. */
export const FIRST_CLOCK_HOUR = 10

/** The folder of a lot's snapshot of a round, and the files beside it. */
export const SNAPSHOT_BASE_SHA = 'b'.repeat(40)

/** A state hash as a `round-<n>.state` file holds it (33L1 D7). */
export const SNAPSHOT_STATE_HASH = 'c'.repeat(64)

/** A package.json of a worktree, per profile. */
export const PRODUCER_PACKAGE = { name: 'a-producer', dialecte: { profile: 'contributor' } }
export const CONSUMER_PACKAGE = { name: 'a-consumer', dialecte: { profile: 'consumer' } }

/** The head of the decisions file `appendDecision` makes is written by it; this is the day of its rows. */
export const DECISION_DAY = '2026-11-12'
