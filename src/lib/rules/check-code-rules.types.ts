import type { RULE_NAMES } from './check-code-rules.constants.ts'
import type { ReferencePattern } from './committed-text.types.ts'
import type { OwnImportKind } from './unit-context.types.ts'
import type ts from 'typescript'

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
	/** For a function-wide rule: the 1-based line of the function's first token. */
	functionLine?: number
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
	queryNames?: ReadonlySet<string>
	/** The syntax tree of `text`, when the caller already parsed it (with parent nodes set): not parsed again. */
	sourceFile?: ts.SourceFile
	/** Given for a Dialecte change: the test rules of a Dialecte change run; absent, they do not. */
	testRules?: TestRulesContext
}

/** What the unit-under-test rules know about the package: core's API groups and how its own imports are read. */
export type UnitContext = {
	/** The API groups of core (`progress`, `perf`): a call through them is not a unit. */
	coreGroups: ReadonlySet<string>
	/** By the imported local name: a function of the package's own source is a unit, a test support one is not. */
	ownImports: ReadonlyMap<string, OwnImportKind>
}

/** The context of the rules that judge a Dialecte change: given only for a file that is one. */
export type TestRulesContext = {
	dialecteChange: true
	units: UnitContext
	/** The names the file imports that are XML literals in their module (an import followed one level). */
	xmlImports?: ReadonlySet<string>
}
