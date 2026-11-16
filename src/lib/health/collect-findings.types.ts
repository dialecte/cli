import type {
	HealthFinding,
	HealthRepository,
	HealthWindow,
	ScratchFolder,
} from './health.types.ts'

/** What `collectFindings` reads: the repositories, the scratch folders, the window and whether a process is alive. */
export type CollectFindingsParams = {
	repositories: readonly HealthRepository[]
	scratch: readonly ScratchFolder[]
	window: HealthWindow
	isAlive: (pid: number) => boolean
}

/** What `renderFindings` prints: the findings (already sorted) and the window's start as the header says it. */
export type RenderFindingsParams = {
	findings: readonly HealthFinding[]
	since: string
}
