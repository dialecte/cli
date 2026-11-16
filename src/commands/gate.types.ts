import type { CheckKey, GateRecord } from '../lib/gate-records/gate-records.types.ts'
import type { HandoverBase, UsedGateBase } from '../lib/gate/gate-base.types.ts'
import type { GateStep } from '../lib/gate/gate-config.types.ts'
import type { StepResult } from '../lib/gate/gate.types.ts'
import type { StepSource } from '../lib/gate/step-source.types.ts'
import type { AwakeHolder } from '../lib/keep-awake/keep-awake.types.ts'
import type { RunClocks } from '../lib/progress/slept.types.ts'
import type { LiveOutput, StepProgress } from '../lib/progress/step-progress.types.ts'

/** What `runGate` is given: the folder, the command line, and what the process environment told the cli. */
export type GateRunParams = {
	cwd: string
	argv: string[]
	/** Where each step's start line (or spinner) goes while it runs; the result is returned at the end. */
	live?: LiveOutput
	/** `--hook`: the index file git handed the commit hook (relative: to the worktree top); default: the worktree's own index. */
	indexFile?: string
	/** `--hook`: false when what is committed is unknown (git variables naming another repository): the tests run. */
	reusable?: boolean
	/**
	 * `--hook`: the base a hand-over run handed down (`DIALECTE_HANDOVER_BASE` with `DIALECTE_HANDOVER_FOLDER` in the
	 * cli's given environment), given to `resolveGateBase` (rule 2).
	 */
	handoverBase?: HandoverBase
	/** `--hook`: why a hand-over variable given without the other was ignored; said when a test step is scoped. */
	handoverIgnored?: string
	/**
	 * The absolute git common dir of the repository whose store holds the gate's records, any mode
	 * (`DIALECTE_CHECK_STORE` in the cli's given environment); its records are marked as a rehearsal's.
	 */
	checkStore?: string
	/** The line saying why a given store was ignored (no absolute path to a folder); the gate starts with it. */
	checkStoreIgnored?: string
	/** `--full` and `--release` call it once at their start; `--fast` never. Default: holds the machine awake. */
	holdAwake?: AwakeHolder
	/** The clock pair a `--full` or `--release` run measures a sleep with. Default: the process's. */
	runClocks?: RunClocks
	/** Where the one `events: not recorded: <reason>` line goes (standard error unless given). */
	warn?: (line: string) => void
}

/** What a `--fast`, `--full` or `--release` run reads before any step: the hold, the steps, their base and hash. */
export type GateSetup = {
	/** The line saying the run goes on under the hand-over that holds the repository; none without a hold. */
	underHandover: string[]
	source: StepSource
	steps: GateStep[]
	/** The base the scoped steps select on; absent when the list holds no scoped step. */
	gateBase?: UsedGateBase
	/** The store the run reads and writes its records in (`GateRunParams.checkStore`); absent: the repository's own. */
	checkStore?: string
	commandHash: string
	/** Said once before the steps: a given store ignored, where the base came from, a release list that answers no full gate. */
	noticeLines: string[]
}

/** Where a run shows its steps while they run: both absent when nothing is shown live. */
export type GateView = { live?: LiveOutput; progress?: StepProgress }

/** What one part of a run leaves: its results in run order, how long each ran, the ones already shown live. */
export type GatePhase = {
	results: StepResult[]
	durations: Map<StepResult, number>
	shown: Set<StepResult>
}

/** The record lookup of a run: HEAD, the key of the state the steps start on, and the record that answers them. */
export type GateReuse = {
	head: string | undefined
	keyBefore?: CheckKey
	reused?: { record: GateRecord; key: CheckKey }
}
