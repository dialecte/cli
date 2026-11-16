import type { LANDING_STEP_NAMES } from './handover-landing.constants.ts'

/** The counter file of each hook step of the landing package. */
export type LandingCounters = Record<(typeof LANDING_STEP_NAMES)[number], string>

/** A landing scenario: the repository, its hand-over folder and what its steps count. */
export type LandingScenario = {
	root: string
	out: string
	counters: LandingCounters
	/** The file the `tests` step reads: it passes while it holds `LANDING_TESTS_PASS`. */
	requires: string
	/** The tree the first lot commits (HEAD plus the lot's files). */
	lotTree: string
	/** The tree every lot of the scenario leaves (the first lot's tree when there is no later lot). */
	finalTree: string
}
