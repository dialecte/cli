import type { KeepJson } from '../store/keep-decisions.types.ts'
import type { AgentCount, LotReport, SkillCount } from './lot-report.types.ts'
import type { LotTokenTotal, StationTokenTotal } from './token-totals.types.ts'

/** The model `lot report --json` prints: the pure model and the lot's next command (`null` when there is none). */
export type ReportedLot = LotReport & {
	next: string | null
	/** The lot is simulated (its identity says so); left out by a caller that does not know. */
	simulated?: boolean
	/**
	 * The lot kept on purpose (KEEP 3.6): who kept it, when and why, or the keep file that cannot be trusted; null when
	 * not; left out by a caller that does not know.
	 */
	kept?: KeepJson
	/** The one text of its keep (`keptByDecision`), its report's `kept` line; absent when not kept. */
	keptText?: string
}

/** Whether a kept lot's own item is still there: `unknown` for a lot whose identity does not read. */
export type KeptItemPresence = 'present' | 'gone' | 'unknown'

/** One line of `lot report --kept` (KEEP 3.6), built from the lot's one checked read alone. */
export type KeptLot = {
	lot: string
	/** Its state, or `damaged`. */
	state: string
	kept: KeepJson
	worktree: KeptItemPresence
	branch: KeptItemPresence
	next: string | null
}

/** One lot of a feature: read from its folder, or (`fromCardsLog`) from its final `card` line when the folder is gone. */
export type FeatureLot = {
	lot: string
	state: string
	simulated: boolean
	fromCardsLog: boolean
	/** The lot is kept on purpose (KEEP 3.6): marked `kept` on its line; false for a lot read from `cards.log`. */
	kept: boolean
	tokens: LotTokenTotal
	/** Elapsed seconds; `null` when not known. */
	elapsed: number | null
	/** The station runs and the distinct agents; `null` when not known (a gone lot whose card holds no usage). */
	runs: number | null
	agents: number | null
	rounds: number | null
	findings: number | null
	/** The suite counts by family, `null` for a count that is unknown; `null` for a lot read from `cards.log`. */
	suites: Record<string, number | null> | null
}

/** A feature's totals over a set of lots: by station name and by tier, with the agents and skills used. */
export type FeatureTotals = {
	tokens: LotTokenTotal
	byStation: Record<string, StationTokenTotal>
	byTier: Record<string, StationTokenTotal>
	agents: AgentCount[]
	skills: SkillCount[]
}

/** The feature report: the real lots and their totals, the simulated lots apart with their own totals. */
export type FeatureReport = {
	feature: string
	lots: FeatureLot[]
	totals: FeatureTotals
	simulated: { count: number; lots: FeatureLot[]; totals: FeatureTotals }
}
