import type { LotReport } from '../lib/events/lot-report.types.ts'
import type { FieldSum, LotTokenTotal } from '../lib/events/token-totals.types.ts'
import type { SuiteReport } from '../lib/events/unrecorded-steps.types.ts'
import type { KeepJson } from '../lib/store/keep-decisions.types.ts'

/** `lot report --json` (33L0 section 7): the model under the spec's names. */
export type LotReportJson = Pick<
	LotReport,
	| 'lot'
	| 'state'
	| 'feature'
	| 'effort'
	| 'steps'
	| 'rounds'
	| 'stations'
	| 'runs'
	| 'agents'
	| 'skills'
	| 'reportedSuites'
	| 'heavy'
	| 'folders'
	| 'review'
	| 'events'
> & {
	totals: {
		tokens: {
			input: FieldSum
			output: FieldSum
			cacheRead: FieldSum
			cacheWrite: FieldSum
			total: LotTokenTotal
		}
		money: LotReport['totals']['money']
		time: LotReport['totals']['time']
	}
	/** The families of the lot's worktree, flat. */
	suites: SuiteReport['families']
	/** The families of the review throwaways, flat. */
	throwawaySuites: SuiteReport['throwaways']
	next: string | null
	simulated: boolean
	/**
	 * The lot kept on purpose (KEEP 3.6): who kept it, when and why, or the keep file that cannot be trusted; null when
	 * not.
	 */
	kept: KeepJson
}
