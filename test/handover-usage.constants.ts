import type { HandoverCard, HandoverUsage } from '../src/lib/handover/handover.types.ts'

/**
 * The recorded lot has four station runs, over three station names and two agents (so the agents, the stations and
 * the runs are three different numbers): the first (test-writer, agent A) reports its total, the second
 * (implementer, agent B) only its input (a lower bound), the third (reviewer, agent A) and the fourth (test-writer
 * again, agent A) their totals.
 */
export const FIRST_RUN_TOTAL = 1_000_000
export const SECOND_RUN_INPUT = 400_000
export const THIRD_RUN_TOTAL = 100_000
export const FOURTH_RUN_TOTAL = 40_000

/** The lot total: the exact ones and the lower bound added (1.54M, printed `1.5M`). */
export const USAGE_TOKEN_VALUE =
	FIRST_RUN_TOTAL + SECOND_RUN_INPUT + THIRD_RUN_TOTAL + FOURTH_RUN_TOTAL

/** The durations of the four runs, in seconds (30 m, 34 m, 6 m, 2 m): 72 minutes in all. */
export const RUN_SECONDS = [1800, 2040, 360, 120]
export const USAGE_AGENT_SECONDS = 4320

/** The usage of the recorded lot as the card's data holds it: four runs, two agents, one run not exact. */
export const LOT_USAGE: HandoverUsage = {
	tokens: {
		total: { value: USAGE_TOKEN_VALUE, exact: false, notExact: 1, stations: 4 },
		fields: {
			input: { known: SECOND_RUN_INPUT, unknownStations: 3 },
			output: { known: null, unknownStations: 4 },
			cacheRead: { known: null, unknownStations: 4 },
			cacheWrite: { known: null, unknownStations: 4 },
			total: {
				known: FIRST_RUN_TOTAL + THIRD_RUN_TOTAL + FOURTH_RUN_TOTAL,
				unknownStations: 1,
			},
		},
	},
	agents: 2,
	runs: 4,
	agentTime: { known: USAGE_AGENT_SECONDS, unknownRuns: 0 },
	money: [],
}

/** The row of the recorded lot, as the card prints it (the lot name follows). */
export const LOT_USAGE_TEXT =
	'usage    ≥ 1.5M tokens (1 of 4 not exact) · 2 agents · 4 runs · 1 h 12 m agent time · dialecte lot report'

/** A static usage whose runs all report their totals: two agents, three runs, 30 minutes, nothing to flag. */
export const EXACT_USAGE: HandoverUsage = {
	tokens: {
		total: { value: 1_200_000, exact: true, notExact: 0, stations: 3 },
		fields: {
			input: { known: null, unknownStations: 3 },
			output: { known: null, unknownStations: 3 },
			cacheRead: { known: null, unknownStations: 3 },
			cacheWrite: { known: null, unknownStations: 3 },
			total: { known: 1_200_000, unknownStations: 0 },
		},
	},
	agents: 2,
	runs: 3,
	agentTime: { known: 1800, unknownRuns: 0 },
	money: [],
}

/** A usage of four runs, one of them with no measured or reported time: 30 minutes known. */
export const PARTLY_TIMED_USAGE: HandoverUsage = {
	...EXACT_USAGE,
	runs: 4,
	agentTime: { known: 1800, unknownRuns: 1 },
}

/** A usage of two runs, none with a measured or reported time. */
export const UNTIMED_USAGE: HandoverUsage = { ...EXACT_USAGE, runs: 2, agentTime: null }

/** The lot folder of the static cards: the card names the lot by its folder's name. */
export const STATIC_LOT_NAME = '0171-repo-subscribe'
export const STATIC_LOT_FOLDER = `/state/dialecte/dialecte-lots/${STATIC_LOT_NAME}`

/** A card whose every gate is green, no usage: READY. */
export const READY_CARD: HandoverCard = {
	repository: '/Users/dev/Dialecte/core',
	worktree: '/Users/dev/Dialecte/.worktrees/0171-repo-subscribe',
	branch: 'main',
	head: '2d1cce9a4b7e0f3c5d6e7f8091a2b3c4d5e6f708',
	verdict: 'READY',
	failedGates: [],
	otherTreeGates: [],
	declarations: 0,
	profile: 'consumer',
	gates: [
		{ name: 'check', status: 'passed', detail: '10 passed' },
		{ name: 'review', status: 'passed', detail: '1 of 3 rounds · approved' },
	],
	lots: [
		{ index: 1, fileCount: 1, insertions: 3, deletions: 1, subject: 'fix: read', pending: true },
	],
	command: `cd '${STATIC_LOT_FOLDER}' && bash commit.sh`,
	folder: STATIC_LOT_FOLDER,
}

/** The agents of the usage lot, one per station run. */
export const FIRST_AGENT = 'dialecte-test-writer'
export const SECOND_AGENT = 'dialecte-implementer'

/** The day and times the usage lot's station runs lie on (the test day of the report events). */
export const FIRST_RUN_TIMES = { start: '10:00', end: '10:30' }
export const SECOND_RUN_TIMES = { start: '10:30', end: '11:04' }
export const THIRD_RUN_TIMES = { start: '11:04', end: '11:10' }
export const FOURTH_RUN_TIMES = { start: '11:10', end: '11:12' }
