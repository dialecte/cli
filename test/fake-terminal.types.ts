import type { LiveOutput } from '../src/lib/progress/step-progress.types.ts'

/** A terminal the tests read: lines written, and the live region (spinner, hook lines) redrawn in place. */
export type FakeTerminal = {
	output: LiveOutput
	/** What a person sees now: the lines written, then the live region. */
	screen(): string[]
	/** Every live region ever drawn (its lines), in order. */
	rewrites: string[][]
	/** Every line ever written, in order. */
	written: string[]
}
