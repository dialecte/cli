import type { JudgedCase } from '../tdd/tdd.types.ts'
import type { GateStep } from './gate-config.types.ts'

export type GateMode = 'fast' | 'full'

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
	/** A vitest test step that failed: its one serial rerun. */
	rerun?: StepRerun
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
