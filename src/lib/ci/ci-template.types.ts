/** The CI template: the files a package's CI is made of, and what selects them. */

/** How a workflow runs the cli: from the sources (the cli's own package) or as the installed devDependency. */
export type CliInvocation = 'source' | 'installed'

/**
 * What the package already says about its CI: the cli's invocation, and which optional jobs and steps it has
 * (a `type-bench:check` script, a `doc:build` script, a Playwright devDependency, a `mode` input in its own
 * `_test.yml`, a `skills:check` script).
 */
export type CiFacts = {
	cli: CliInvocation
	typePerf: boolean
	docs: boolean
	playwright: boolean
	testMode: boolean
	skillsCheck: boolean
}

/** Template files by path relative to the package root, with their text. */
export type CiFiles = ReadonlyMap<string, string>

/** The repository's own `_test.yml` against what ci.yml needs of it. */
export type TestContract = {
	present: boolean
	mode: boolean
	findings: readonly string[]
}

/** A package's facts, or why the template cannot be rendered for it. */
export type CiFactsRead = { facts: CiFacts; contract: TestContract } | { refusal: string }

/** One managed path that differs between the disk and the template. */
export type CiChange =
	| { kind: 'create'; path: string; after: string }
	| { kind: 'update'; path: string; before: string; after: string }
	| { kind: 'delete'; path: string }

/** What a sync would do: the changes, and the workflow files the repository owns. */
export type CiPlan = {
	changes: readonly CiChange[]
	own: readonly string[]
}

/** One line of a diff: kept, removed or added, with its line number in each text. */
export type DiffLine = {
	kind: ' ' | '-' | '+'
	text: string
	oldNumber: number
	newNumber: number
}
