import type { StartWorkspace } from './lot-start-workspace.types.ts'

/** A lot (real or simulated) in a scratch workspace, with a lots file for the hand-over written into its folder. */
export type LotHandoverWorkspace = {
	start: StartWorkspace
	/** The lot's full name. */
	lotName: string
	/** The real path of the lot folder. */
	lotFolder: string
	/** The real path of the lot's worktree (a simulated lot has none: the main checkout stands in for it). */
	worktree: string
	/** A lots file whose repository is `worktree` and whose branch is the worktree's. */
	lotsPath: string
}

/** The cli run as a process: the streams apart, and together. */
export type CliRun = {
	exitCode: number | null
	stdout: string
	stderr: string
	output: string
}

/** Every byte a refused command must leave alone: the lot folder, the registry, the repositories' locks. */
export type StoreBytes = {
	lot: Record<string, string>
	registry: Record<string, string>
	locks: (string | undefined)[]
}
