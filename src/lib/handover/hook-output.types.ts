import type { RecordOrigin } from '../gate-records/gate-records.types.ts'
import type { StepCounts } from '../gate/gate.types.ts'

/** What a line of a hook's output is when it is one to show: a warning or an error of a tool the hook runs. */
export type HookLineKind =
	| 'lint warning'
	| 'lint error'
	| 'format'
	| 'type error'
	| 'build warning'
	| 'build error'
	| 'test failure'
	/** run-p naming the task that failed (`ERROR: "type-check" exited with 2.`). */
	| 'script failure'

/**
 * A step of a hook, read from its output: an npm script its header announced (`> <package>@<version>
 * <script>`), or `hook` for what a hook prints with no header.
 */
export type HookStep = {
	/** The script's name (`test:run`), or `hook`. */
	name: string
	/** The lines it printed after its header (its command line first), up to the next header. */
	lines: string[]
	/**
	 * Its command runs other npm scripts (`npm run ...`, `run-p`). Run one after the other, each is a
	 * step of its own; run in parallel (`run-p`), their lines are mixed and stay this step's.
	 */
	runsScripts: boolean
	/** The step whose command runs this one; absent for a script the hook file runs itself. */
	parent?: string
}

/** A pattern of a tool's warning or error line, and the kind such a line is. */
export type HookLinePattern = { kind: HookLineKind; pattern: RegExp }

/** A line of a hook's output worth showing, with its kind and the step that printed it. */
export type FlaggedHookLine = {
	line: string
	kind: HookLineKind
	/** The step's name; a script run in parallel by its parent is its parent's step. */
	step: string
	/** The line written as shown: `[<step>] <line>`. */
	label: string
}

/** A line with how many times it was printed (shown `<line> (×<count>)` from a count of 2). */
export type RepeatedLine = { text: string; count: number }

/** A flagged line with how many times its step printed it. */
export type CountedFlaggedLine = { flagged: FlaggedHookLine; count: number }

/** A flagged line with the step holding it and its place among that step's lines. */
export type PlacedFlaggedLine = { flagged: FlaggedHookLine; step: HookStep; index: number }

/** A step the hook's summary names: passed or failed, with the counts its own summary lines said. */
export type HookSummaryStep = {
	name: string
	failed: boolean
	counts: StepCounts
	/** `gate --hook` answered the step from the green `gate --full` record of this time and short HEAD. */
	reused?: RecordOrigin
	/** A passed step whose tests failed in parallel and passed on the serial rerun: the files `gate --hook` named flaky. */
	flaky?: string[]
}

/** The npm scripts a command line runs. */
export type ScriptsRun = {
	/** Their names, or npm-run-all's patterns (`lint:*`). */
	scripts: string[]
	/** Run together (`run-p`): their headers and lines are mixed. */
	parallel: boolean
}

/** A step whose command runs other scripts, while its scripts may still start. */
export type HookParentStep = ScriptsRun & { step: HookStep }

/** Reads a hook's output a line at a time, as it comes. */
export type HookStepReader = {
	read(line: string): void
	/** The output ended: the steps it held (a hook printing no header: one step `hook`). */
	end(): HookStep[]
}

/** Shows a running hook's output as it comes: its steps and its warning and error lines. */
export type HookLiveView = {
	read(line: string): void
	/** The hook ended: off a terminal, a run of repeats of the last flagged line is written with its count. */
	end(): void
}
