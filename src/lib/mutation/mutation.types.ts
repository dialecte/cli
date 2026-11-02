import type { MUTATION_FAMILIES, REMOVABLE_FAMILIES } from './mutation.constants.ts'
import type { NodePath } from '@babel/traverse'

/** `"dialecte": { "mutation" }` in a package's package.json, defaults applied. */
export type MutationDeclaration = {
	/** Globs (package-relative, `/` separators) of the files the runner may mutate. */
	scope: string[]
	exclude: string[]
	/** Names of calls whose string and object arguments the error-text ignorer skips. */
	errorFactories: string[]
	fast: { vitestConfig: string }
	full?: { command: string }
}

export type MutationDeclarationResult =
	| { kind: 'none' }
	| { kind: 'declared'; declaration: MutationDeclaration }
	| { kind: 'invalid'; reason: string }

export type MutationTier = 'fast' | 'timeouts' | 'full'

/** The options object handed to StrykerJS (the part this runner sets). */
export type StrykerOptions = {
	mutate: string[]
	testRunner: string
	vitest?: { configFile: string; related: boolean }
	commandRunner?: { command: string }
	coverageAnalysis: string
	incremental?: boolean
	incrementalFile?: string
	ignorers: string[]
	reporters: string[]
	ignorePatterns: string[]
	plugins: string[]
	dialecteMutation: { errorFactories: string[] }
	jsonReporter: { fileName: string }
	tempDirName: string
	disableTypeChecks: boolean
	timeoutMS: number
	concurrency?: number
}

/** The part of a Stryker plugin declaration this package builds without importing `@stryker-mutator/api`. */
export type StrykerIgnorerPlugin = {
	kind: 'Ignore'
	name: string
	factory: IgnorerFactory
}

export type IgnorerFactory = ((options: IgnorerOptions) => {
	shouldIgnore: (path: never) => string | undefined
}) & {
	inject: readonly string[]
}

/** Why a path is skipped, or `undefined` to keep it mutable. */
export type IgnorerReasonOf = (params: {
	path: NodePath
	errorFactories: readonly string[]
}) => string | undefined

export type IgnorerOptions = { dialecteMutation?: { errorFactories?: string[] } }

export type MutationFamily = (typeof MUTATION_FAMILIES)[number]

type RemovableFamily = (typeof REMOVABLE_FAMILIES)[number]

type MutationRecordBase = {
	line: number
	mutation: string
	/** Why no output can differ; empty until someone writes it - an empty reason is never listed. */
	reason: string
	lineHash: string
	/** Absent on a migrated record: it keeps its reason until a hash is taken. */
	testsHash?: string
}

export type MutationRecord =
	| (MutationRecordBase & { family: RemovableFamily; removable: boolean })
	| (MutationRecordBase & {
			family: Exclude<MutationFamily, RemovableFamily>
			removable?: undefined
	  })

/** Per mutated file, per survivor key. */
export type MutationRecords = Readonly<Record<string, Readonly<Record<string, MutationRecord>>>>

/** scl's `equivalent-mutants.json`. */
export type LegacyRecords = Readonly<
	Record<string, Readonly<Record<string, { line: number; mutation: string; equivalent: string }>>>
>

/** The part of the StrykerJS JSON report the judge reads. */
export type MutationReport = {
	readonly files: Readonly<Record<string, ReportedFile>>
	/** Per test file, the tests of the run with the ids `coveredBy` refers to (numbered per run by Stryker). */
	readonly testFiles?: Readonly<Record<string, { readonly tests: readonly ReportedTest[] }>>
}
export type ReportedTest = { readonly id: string; readonly name: string }
export type ReportedFile = { readonly source: string; readonly mutants: readonly ReportedMutant[] }
export type ReportedMutant = {
	readonly id: string
	readonly mutatorName: string
	readonly replacement?: string
	readonly status: string
	/** Ids of the tests that run this mutant (Stryker's `coveredBy`, per-test coverage). */
	readonly coveredBy?: readonly string[]
	readonly location: { readonly start: Position; readonly end: Position }
}
export type Position = { readonly line: number; readonly column: number }

export type Survivor = {
	readonly file: string
	readonly key: string
	readonly line: number
	readonly mutation: string
	/** `file:line:column-line:column`, the form `--mutate` takes to re-mutate exactly this mutant. */
	readonly range: string
	/** Hash of the mutated line's text (see `hashLine`). */
	readonly lineHash: string
	/** Hash of the tests covering the mutant (see `hashTests`); absent when the report names none. */
	readonly testsHash?: string
}

export type Verdict = {
	readonly survivors: readonly Survivor[]
	/** Survivors the records do not list: no record, an empty reason, or an unknown family. */
	readonly unlisted: readonly Survivor[]
	/** Recorded mutants the run tested that no longer survive. */
	readonly stale: readonly { readonly file: string; readonly key: string }[]
}

export type MutateTarget = {
	readonly file: string
	readonly range?: { readonly start: Position; readonly end: Position }
}
