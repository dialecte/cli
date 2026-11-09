import type { JudgedCase } from '../tdd/tdd.types.ts'
import type { GateStep } from './gate-config.types.ts'

export type GateMode = 'fast' | 'full' | 'release'

/** What a step's own summary lines say, read from its unfiltered output. */
export type StepCounts = {
	tests?: { passed: number; failed: number; skipped: number; total: number }
	testFiles?: { passed: number; failed: number; total: number }
	/** Errors a type-check, a linter or `skills check` reported. */
	errors?: number
	warnings?: number
}

export type StepStatus = 'passed' | 'failed' | 'skipped' | 'not-run'

export type StepResult = {
	step: GateStep
	status: StepStatus
	exitCode?: number
	counts: StepCounts
	/** Why a step failed or was skipped, beyond its exit code. */
	reason?: string
	/** Generated docs written back to their bytes from before the step. */
	restored: string[]
	/** Why a passed step ran no test: nothing the change affects. */
	note?: string
	/** The last lines of the output of a failed step. */
	tail?: string
	/** Lines shown under the step's line, for the review (the tdd step's flags and deleted cases). */
	details?: string[]
	/** The tdd step: the cases of the change it judged (`TddCheck.cases`). */
	cases?: JudgedCase[]
	/** A failed or flaky step: every file its output (and a scoped step's selection) names as failing, sorted, unique. */
	failing?: string[]
	/** A vitest test step that failed: its one serial rerun. */
	rerun?: StepRerun
	/** A scoped step that wrote a valid selection: what it recorded (the first run's, after a rerun). */
	selection?: StepSelection
}

/** The base and tree of one gate run, handed to every scoped step. */
export type GateScope = { base: string; tree: string }

/** The selection a scoped step wrote, as a result keeps it. */
export type StepSelection = {
	base: string
	tree: string
	/** How many changed paths the step judged. */
	changed: number
	/** The selected ids, in the step's order. */
	ids: string[]
	/** Per selected id: at most 20 reasons shown, and how many more there were. */
	reasons: Record<string, { shown: string[]; more: number }>
	skipped: { id: string; reason: string }[]
}

/** A selection file as a scoped step wrote it, once read and found valid. */
export type ReadSelection = {
	base: string
	tree: string
	changed: number
	selected: { id: string; reasons: string[] }[]
	skipped: { id: string; reason: string }[]
	/** The files the step declares failing, relative to the package root, each once (`[]` when it declares none). */
	failing: string[]
}

/** What one gate run hands its scoped steps: the scope, and the changed file the cli wrote for it. */
export type ScopeRun = GateScope & {
	/** The run's own temporary folder, removed once the run returns. */
	folder: string
	/** The changed paths, NUL-separated, byte-sorted. */
	changedFile: string
	/** How many paths the changed file holds. */
	changedCount: number
	/** A new selection path in the folder, absent until a step writes it. */
	nextSelectionPath: () => string
}

/** One run of a step: its result, its output, whether it stalled, and why a scoped step's selection was refused. */
export type StepRun = {
	result: StepResult
	output: string
	stalled: boolean
	/** A scoped step whose selection failed its checks: why (its result may fail on its exit code first). */
	selectionProblem?: string
	/** A scoped step's valid selection: the files it declares failing. */
	declaredFailing?: string[]
}

/** The serial rerun of a failed vitest test step, on the files its first run named. */
export type StepRerun = {
	/** The failing files the first run named, in its order; `[]` when it named none (the whole step was rerun). */
	files: string[]
	/** The files that failed again. */
	failing: string[]
	/** Passed: exit 0, no failed test, at least one test passed. */
	status: 'passed' | 'failed'
	exitCode: number
	counts: StepCounts
}

/** Announces a step about to run; answers what to call with its result once it ran. */
export type StepAnnouncer = (step: GateStep) => (result: StepResult) => void
