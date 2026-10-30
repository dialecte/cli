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
}

/** Announces a step about to run (after its lock); answers what to call with its result once it ran. */
export type StepAnnouncer = (step: GateStep) => (result: StepResult) => void

/** Takes the machine lock for a heavy step: a release, or why the step cannot run. */
export type StepLock = (step: GateStep) => { release(): void } | { refusal: string }
