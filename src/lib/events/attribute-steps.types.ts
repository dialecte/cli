/** A question's time: when it was asked, and when it was answered (`null` while open). */
export type QuestionTime = { asked: string; answered: string | null }

/** A `step.wait` event, as the model needs it: when it ended, and how long the step waited for the machine. */
export type WaitTime = { at: string; waitedMs: number }

/**
 * The owner of a step: a station's name, `shared` (several stations were open at its start) or `outside` (none, or a
 * step the orchestration runs, whatever station is open).
 */
export type StepOwner = string

/** A span of time in epoch milliseconds, its end not before its start. */
export type Interval = { start: number; end: number }

/** A step run and the station it is attributed to. */
export type AttributedStep = { run: string; step: string; owner: StepOwner }

/** A step run, its owner, and the one station run holding its start (`null` for `shared` and `outside`). */
export type RunAttributedStep = AttributedStep & { stationRun: string | null }

/**
 * The agent time of a lot's station runs: the seconds of the runs whose time is measured or reported (`known`,
 * unclipped) and the count of runs with neither (`unknownRuns`); `null` when runs exist and none has a time.
 */
export type AgentTime = { known: number; unknownRuns: number } | null

/**
 * How a place prints the agent time: every run timed (`{time}`), a lower bound (`{time}`, `{unknown}` of `{runs}`),
 * no run timed.
 */
export type AgentTimeTexts = { known: string; atLeast: string; unknown: string }

/**
 * The time of a lot (seconds) in five categories that add up to `elapsed`; every interval is clipped to
 * `[from, to]`. `agentTime` is apart (the station durations, unclipped) and may be larger.
 */
export type TimeBreakdown = {
	elapsed: number
	agents: number
	cliSteps: number
	waiting: number
	machine: number
	other: number
	agentTime: AgentTime
}
