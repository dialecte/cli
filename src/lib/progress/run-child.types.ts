/**
 * How a command ended, with everything it printed (both streams, in the order they came). `exitCode` is
 * undefined when the command was stopped for stalling (`stalled` is then set).
 */
export type StreamedCommand = {
	exitCode: number | undefined
	output: string
	stalled?: StallReport
}

/** One process of a child's tree, as the sampler saw it. */
export type ProcessSample = {
	pid: number
	/** The `ps` state letter: `S` sleeping, `R` running, `T` stopped. */
	state: string
	/** CPU time the process has used so far, in milliseconds. */
	cpuMilliseconds: number
	command: string
}

/** Samples the process tree rooted at a pid (the root included). */
/** Undefined when the sampling failed (`ps` timed out or failed): no verdict on that sample. */
export type TreeSampler = (params: { rootPid: number }) => ProcessSample[] | undefined

/**
 * Kills every process of the tree, given the pids last sampled (the child's own pid always among them);
 * the run settles once it resolves.
 */
export type TreeKiller = (pids: number[]) => void | Promise<void>

/** How a long-running command is watched for a stall: no output and no CPU gained by its tree. */
export type Watchdog = {
	/** Milliseconds of silence without CPU gain before the command is stalled. Default: 10 minutes. */
	stallAfter?: number
	/** How often the tree is sampled, in milliseconds. Default: 5 s. */
	checkEvery?: number
	/** Default: the machine's `ps`. */
	sampleTree?: TreeSampler
	/** Default: signals the child's process group and every pid given, then waits for them to be gone. */
	kill?: TreeKiller
	/** Milliseconds between the polite stop and the forced one, and the wait for the tree to be gone. */
	killGrace?: number
}

/** A command stopped for stalling: what its tree looked like, as lines (pid, state, cpu, command). */
export type StallReport = { processes: ProcessSample[]; report: string }

/** An interrupt being handled: the signal, and when every live group it stopped is gone. */
export type InterruptInFlight = { signal: NodeJS.Signals; handled: Promise<void> }
