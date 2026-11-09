import type { GateStep } from '../src/lib/gate/gate-config.types.ts'

/** A scoped step and the files outside the repository it writes and reads. */
export type ScopedStep = {
	step: GateStep
	/** One line per run: `<base> <tree>` as the step got them; `<log>.changed` is the changed file it got. */
	log: string
	/** While this file exists the step moves `main` to the commit it holds, as it runs. */
	moveFile: string
}

/** What a run of the scoped step saw. */
export type ScopedRun = { base: string; tree: string }
