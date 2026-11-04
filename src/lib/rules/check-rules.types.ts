import type { RuleFinding } from './check-code-rules.types.ts'

/** What a rules run found: the files it read, its error and warning counts, each finding. */
export type RulesCheck = {
	files: string[]
	errors: number
	warnings: number
	findings: RuleFinding[]
}
