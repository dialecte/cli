import type { AllowedCounts } from './allow-comments.types.ts'
import type { RuleFinding } from './check-code-rules.types.ts'
import type { DialecteChangeEntry, DialecteChangeReader } from './dialecte-change.types.ts'
import type { OverLimitFile } from './file-lengths.types.ts'
import type { ImportReading } from './import-reading.types.ts'
import type { UnitContextReader } from './unit-context.types.ts'

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
	/** Each checked file with its Dialecte-change verdict, sorted by file. */
	dialecteChanges?: DialecteChangeEntry[]
	/** How many checked files were left out as not Dialecte changes; absent when none. */
	notJudged?: number
	/** The line saying the base came from the lot or the worktree (no gate base given); absent otherwise. */
	baseLine?: string
}

/**
 * The Dialecte-change scope of a run in a package: its reader, and whether only the Dialecte-change script files are
 * judged (an app's) or every file (core, a dialecte package, create, the cli, a contributor package).
 */
export type DialecteScope = {
	reader: DialecteChangeReader
	/** The run's import reading, shared by the scope and the unit context (a checked file's tree kept there). */
	reading: ImportReading
	judgesOnlyChanges: boolean
	/** The unit context of each test-shaped Dialecte-change file. */
	units: UnitContextReader
}

/** One file's result: its findings, what its opt-outs silenced, its verdict, and whether the rules judged it. */
export type FileCheck = {
	findings: RuleFinding[]
	allowed: AllowedCounts
	entry: DialecteChangeEntry | undefined
	judged: boolean
	/** The `.xml?raw` fixture files a test-shaped Dialecte change reads, judged once per run for their length. */
	fixtures?: string[]
	/** The checked test file when it is over its length limit, judged against the base with every such file. */
	overLimit?: OverLimitFile[]
}
