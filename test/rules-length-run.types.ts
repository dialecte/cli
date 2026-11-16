import type { RuleFinding } from '../src/lib/rules/check-code-rules.types.ts'

export type RulesJson = {
	findings: RuleFinding[]
	allowed?: Record<string, number>
	notJudged?: number
}

export type LengthFinding = Pick<RuleFinding, 'rule' | 'file' | 'line' | 'severity' | 'message'>
