import type { RuleFinding } from './check-code-rules.types.ts'

/** What a rules run found: the files it read, its error and warning counts, each finding. */
export type RulesCheck = {
	files: string[]
	errors: number
	warnings: number
	findings: RuleFinding[]
	/** A contributor whose machine holds no forbidden words list: the user file the list would be read from. */
	noForbiddenWordsList?: string
}
