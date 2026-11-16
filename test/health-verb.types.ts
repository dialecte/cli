/** What a verb case runs `health` on: a common dir, the words, the clock, where the cwd is, whether it is listed. */
export type RunHealthOnParams = {
	common: string
	argv?: string[]
	now?: Date
	/** The folder `health` runs from: elsewhere (no repository) unless `repository`. */
	cwd?: 'elsewhere' | 'repository'
	/** The common dir's store is on the store list (default true). */
	listed?: boolean
	/** Folders made in the scratch folder `health` reads: their name and how long before `now` they were modified. */
	scratch?: { name: string; ageMs: number }[]
}

/** What a case compares of a `health` run. */
export type VerbSummary = { exitCode: number; lines: string[] }

/** What a case compares of a finding: its rule, its severity and its time. */
export type FindingKey = { rule: string; severity: string; at: string }

/** What a rehearsal's end event and its plan file hold of the lots. */
export type RehearsedLot = { lot: number; tree: string; decision: string }
