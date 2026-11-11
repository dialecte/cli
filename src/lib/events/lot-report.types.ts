import type { QuestionTime, RunAttributedStep, TimeBreakdown } from './attribute-steps.types.ts'
import type { LotEvent } from './event.types.ts'
import type { LotTokenTotals, MoneySum, StationTokenTotal } from './token-totals.types.ts'
import type { MutationRunTime, SuiteReport, WorktreeRecordTimes } from './unrecorded-steps.types.ts'

/** The lot's identity fields the report prints. */
export type ReportIdentity = {
	name: string
	state: string
	feature: string | null
	effort: string | null
	/** Where the effort came from (`identity.effort.source`: `flag`, `brief`, `default`); left out when not known. */
	effortSource?: string | null
	/** The brief's steps (S). */
	steps: number | null
	/** `identity.created`, ISO. */
	created: string
	/** The lot's worktree, a real path. */
	worktree: string | null
}

/** A state change of the lot: when, and to which state. */
export type TransitionTime = { at: string; to: string }

/** One row of the findings ledger as the report reads it. */
export type LedgerFinding = { round: number; severity: string; state: string }

/** Everything the pure model needs: plain values, no disk, no clock. `step.wait` events are read from `events`. */
export type LotReportInput = {
	/** ISO. */
	now: string
	identity: ReportIdentity
	transitions: readonly TransitionTime[]
	questions: readonly QuestionTime[]
	/** The events as `readEvents` gives them, sorted. */
	events: readonly LotEvent[]
	damaged: number
	unknownKinds: number
	ledger: readonly LedgerFinding[]
	/** The names found in the lot's folder: `round-<n>` ones are rounds, the rest is ignored. */
	roundFolders: readonly string[]
	/** Record times of every readable worktree, live or frozen, each tagged with its worktree. */
	records: readonly WorktreeRecordTimes[]
	/** Worktrees whose records are gone (no live folder, no frozen line). */
	goneWorktrees: readonly string[]
	mutationRuns: readonly MutationRunTime[]
}

/** A skill as the report counts it: runs that saw it, runs that were asked it, flagged when asked and never seen. */
export type SkillCount = {
	name: string
	hash: string | null
	seen: number
	asked: number
	askedNotSeen: boolean
}

/** An agent's name with the runs it had. */
export type AgentCount = { name: string; runs: number }

/**
 * A run's time: the cli's clock (`null` when the end is before the start or there is no start), the host's, and the
 * one the report uses (`seconds`: measured unless it is `null`, else reported, else `null`).
 */
export type RunTime = {
	measuredSeconds: number | null
	reportedSeconds: number | null
	seconds: number | null
}

/** One station run. */
export type StationRunRow = {
	run: string
	station: string
	step: number | null
	round: number | null
	attempt: number | null
	agent: string | null
	executor: string | null
	vendor: string | null
	model: string | null
	tier: string | null
	effort: string | null
	session: string | null
	tokens: StationTokenTotal
	money: { amount: number; currency: string } | null
	time: RunTime
	verdict: string | null
	exit: number | null
	skills: SkillCount[]
	/** `ended`; `running` (no end, the lot is open); `no end` (no end, the lot is terminal). */
	status: 'ended' | 'running' | 'no end'
}

/** The station runs of a lot summed: one row per run, the tokens and money they reported, the agents that ran them. */
export type StationRunsSummary = {
	runs: StationRunRow[]
	tokens: LotTokenTotals
	money: MoneySum[]
	agents: AgentCount[]
}

/** One station, its runs summed. Stations are listed in the order of their first run. */
export type StationRow = {
	station: string
	runs: number
	/** Exact when every run is exact, unknown when none reported, else at least. */
	tokens: StationTokenTotal
	money: MoneySum[]
	/** Seconds: each run's `seconds` summed; `null` when no run has one. */
	seconds: number | null
	agents: AgentCount[]
	/** Alphabetical by name. */
	skills: SkillCount[]
	/** The suites the station's runs reported themselves, summed by name. */
	reported: Record<string, number>
}

/** One review round: the findings of the ledger by severity and by state. */
export type RoundRow = {
	round: number
	findings: number
	bySeverity: Record<string, number>
	byState: Record<string, number>
}

/** One heavy step: a heavy kind's run (`gate-full`) or a heavy part that ran (`gate-fast: <part>`), with its duration. */
export type HeavyStep = { step: string; seconds: number }

/** The folder-heavy steps: how long the lot waited on its worktree, its throwaways and the folder actions. */
export type FoldersReport = {
	worktreeAdd: { count: number; seconds: number; nodeModules: Record<string, number> }
	throwaways: { count: number; seconds: number }
	/** `folder` events by action (`trash`, `park`, `branch-delete`). */
	actions: Record<string, { count: number; seconds: number }>
}

/** The model `lot report --json` prints (the parts L0a2 step 1 covers; `next` is added by the reader). */
export type LotReport = {
	lot: string
	state: string
	feature: string | null
	effort: string | null
	steps: number | null
	rounds: number
	stations: StationRow[]
	runs: StationRunRow[]
	totals: {
		tokens: LotTokenTotals
		money: MoneySum[]
		time: TimeBreakdown
	}
	agents: AgentCount[]
	/** Alphabetical by name. */
	skills: SkillCount[]
	suites: SuiteReport
	/** The suites the stations reported themselves, summed by name: the cli did not see them. */
	reportedSuites: Record<string, number>
	heavy: HeavyStep[]
	folders: FoldersReport
	review: RoundRow[]
	events: { count: number; damaged: number; duplicates: number; unknownKinds: number }
	/** Where the effort came from; `null` when not known. */
	effortSource: string | null
	/** Station runs recorded by an end alone (the host sent no start). */
	endsWithoutStart: number
	/**
	 * The counted step runs of the lot's worktree (not a throwaway's, not a folder step), in time order, each with its
	 * owner and the one station run holding its start: what the station rows print.
	 */
	stepOwners: RunAttributedStep[]
}
