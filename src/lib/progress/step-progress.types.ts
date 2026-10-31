/**
 * Where a long-running command's live lines go: a terminal can replace its live region (a spinner and the last
 * hook lines under it, redrawn in place, then the step's result over it); anything else only appends lines.
 */
export type LiveOutput = {
	/** The output is a terminal that can redraw its live region. */
	tty: boolean
	/** The terminal's width in columns; undefined when the output is not a terminal. */
	columns?: number
	/** Ends the live region (it is replaced by `line`) and writes `line` as a finished line. */
	writeLine(line: string): void
	/** Replaces the live region (the spinner line and the last hook lines under it) with `lines`. */
	rewriteLines(lines: string[]): void
	/** The run ends (an interrupt too): an open live region is left on its own line, the prompt below it. */
	close?(): void
}

/**
 * What a step is and, optionally, what runs inside it (`hook: unit suite`). `hintWhenSilent`: a step
 * running something that prints as it works (a hook): silent past the hint time, its spinner says what
 * that often is (waiting for input, watch mode).
 */
export type StepDescription = { name: string; detail?: string; hintWhenSilent?: boolean }

/** A step announced and not finished yet. */
export type RunningStep = {
	/**
	 * The step ended: its lines (the last one its result) replace the spinner and what is shown under it,
	 * or follow the start line.
	 */
	finish(...lines: string[]): void
	/**
	 * On a terminal: the lines shown live under the spinner (a hook's step and warnings), or how to render
	 * them at each redraw (a step's elapsed time). Off a terminal: nothing.
	 */
	show(lines: LiveLines): void
	/**
	 * The step printed something, shown or not: its silence starts again for the silent hint (on both); the
	 * running lines off a terminal wait for a line written (`wrote`).
	 */
	touch(): void
	/**
	 * Off a terminal: a line of the step was written (a hook's step or warning), so its running lines start
	 * again; output heard but filtered out does not count. On a terminal: nothing.
	 */
	wrote(): void
}

export type StepProgress = {
	/** Announces the step before any of its work begins. */
	start(step: StepDescription): RunningStep
}

/** Lines shown live under a spinner, or rendered at each redraw from the clock's time. */
export type LiveLines = string[] | ((now: number) => string[])
