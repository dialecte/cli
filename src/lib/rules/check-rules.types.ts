import type { AllowedCounts } from './allow-comments.types.ts'
import type { RuleFinding } from './check-code-rules.types.ts'

/** What a rules run found: the files it read, its error and warning counts, each finding. */
export type RulesCheck = {
	files: string[]
	errors: number
	warnings: number
	findings: RuleFinding[]
	/** The findings the `dialecte-allow` opt-outs silenced, per rule (only rules with a count above 0); absent when none. */
	allowed?: AllowedCounts
	/** A contributor whose machine holds no forbidden words list: the user file the list would be read from. */
	noForbiddenWordsList?: string
	/** The line saying `query-in-loop` did not run, an API index being unreadable: the file and why. */
	queryInLoopNotRun?: string
}
