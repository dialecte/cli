import type { RULE_NAMES } from './check-code-rules.constants.ts'
import type { ReferencePattern } from './committed-text.types.ts'

export type RuleName = (typeof RULE_NAMES)[number]

export type RuleSeverity = 'error' | 'warning'

export type RuleFinding = {
	/** As given, relative to the package root when `rules` picked it. */
	file: string
	/** 1-based. */
	line: number
	/** 1-based. */
	column: number
	rule: RuleName
	severity: RuleSeverity
	message: string
}

/** What a file is for, from its name: the rules that apply depend on it. */
export type FileKind =
	| 'implementation'
	| 'types'
	| 'constants'
	| 'config'
	| 'eval-fixture'
	| 'test'
	| 'declaration'
	| 'generated'
	| 'text'

export type CheckCodeRulesParams = {
	file: string
	text: string
	referencePatterns: readonly ReferencePattern[]
}
