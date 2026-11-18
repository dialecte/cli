import type { RISK_DERIVED_FROM, RISK_REASON_KINDS } from './risk.constants.ts'

/** The effort of a lot. */
export type Effort = 'low' | 'medium' | 'high'

/** The risk class of a lot. */
export type RiskClass = 'light' | 'medium' | 'high'

/** A declared glob a scope entry or a file reaches: the glob that holds it, or one it is broader than. */
export type DeclaredMatch = { kind: 'declared' | 'broad-scope'; glob: string }

/** One reason of a derived class. */
export type RiskReason = {
	kind: (typeof RISK_REASON_KINDS)[number]
	file?: string
	line?: number
	detail: string
}

/** A person's effort record. */
export type RiskEffortLine = {
	schema: 1
	kind: 'effort'
	at: string
	effort: Effort
	class?: RiskClass
	by: string
	reason?: string
}

/** A derivation's record. */
export type RiskDerivedLine = {
	schema: 1
	kind: 'derived'
	at: string
	class: RiskClass
	reasons: RiskReason[]
	from: (typeof RISK_DERIVED_FROM)[number]
}

/** A line of `risk.jsonl`. */
export type RiskLine = RiskEffortLine | RiskDerivedLine

/** What `risk.jsonl` holds, in file order. */
export type RiskRecords = {
	effort: RiskEffortLine[]
	derived: RiskDerivedLine[]
	/** Lines skipped: torn, not JSON, another schema or another kind. */
	skipped: number
}

/** A folder's effort against its class: the effective effort, the last lines, the class compared and whether below. */
export type RiskStanding = {
	effort: Effort | undefined
	/** The current effort line; undefined when the effort is the identity's or none. */
	effortLine: RiskEffortLine | undefined
	/** The last derived line. */
	derived: RiskDerivedLine | undefined
	/** The highest of the last derived class and the current effort line's class: the class the effort is held to. */
	comparedClass: RiskClass | undefined
	/** The effort's class is below `comparedClass`. */
	below: boolean
}

/** The cap of a folder and why. */
export type RiskCap = {
	cap: number
	effort: Effort | undefined
	class: RiskClass | undefined
	raisedBy: 'derived' | 'effort-class' | undefined
}

/** One added line of a diff: its line number in the new file and its text. */
export type RiskAddedLine = {
	line: number
	text: string
}

/** One changed file of a diff, as a derivation reads it. */
export type RiskDiffFile = {
	path: string
	added: RiskAddedLine[]
	addedCount: number
	removedCount: number
	/** Set for a `package.json` whose only change is `version`. */
	versionOnly?: boolean
}

/** Whether the public API of a package changed: `none` for a package that has a `bin` (not a runtime package). */
export type ApiChange = 'none' | 'unchanged' | 'changed' | 'unknown'

/**
 * What recording the class derived now gave: the derivation appended, or the warning line of a derivation that could
 * not run (nothing appended); neither when there is no work tree to read.
 */
export type LotRiskRecord = {
	derivation?: RiskDerivation
	warning?: string
}

/** A derived class and every reason for it. */
export type RiskDerivation = {
	class: RiskClass
	reasons: RiskReason[]
}

/** One destructive pattern: what a reason names and the expressions that find it in an added line. */
export type DestructivePattern = {
	detail: string
	expressions: RegExp[]
}

/** A git argument pair that drops work; `cluster` lets the flag match a longer flag starting with it. */
export type DestructiveGitPair = {
	first: string
	second: string
	cluster: boolean
}

/** One public API entry the change adds, removes or re-signs, by its route; where it is declared when the index says. */
export type ApiEntryChange = {
	path: string
	change: 'added' | 'removed' | 'signature'
	/** `src/<file>.ts:<line>` of the tree's entry (the base's for a removed one); absent when the index holds none. */
	declaredAt?: string
}

/**
 * The public API entries a change touches: none for a package with no runtime API (no package.json, a `bin`, no
 * `exports` map); unknown when the base cannot be read, an index does not parse, or an export source changed while
 * every index did not; else the entries compared, and whether any index file's bytes changed.
 */
export type ApiIndexDiff =
	| { kind: 'none' }
	| { kind: 'unknown'; why: string }
	| { kind: 'compared'; indexChanged: boolean; entries: ApiEntryChange[] }

/** One index file on both sides: its text at the base and in the worktree, each absent when that side lacks it. */
export type IndexSides = { path: string; base?: string; tree?: string }

/** What both comparisons read once: none, unknown, or the index files with whether their bytes and the sources changed. */
export type ApiSides =
	| { kind: 'none' }
	| { kind: 'unknown'; why: string }
	| { kind: 'read'; indexes: IndexSides[]; indexChanged: boolean; exportSourceChanged: boolean }
