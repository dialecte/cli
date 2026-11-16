import type { BriefWorkspace } from './brief-workspace.types.ts'

/** A scratch workspace (repository folder `cli`) and the git common folder of its repository. */
export type HealthInboxWorkspace = { workspace: BriefWorkspace; common: string }

/** What an inbox run of a health case takes: the words, the clock and the folder of scratch, a process never alive. */
export type InboxHealthRun = {
	workspace: HealthInboxWorkspace
	words?: string[]
	now?: Date
	tmp?: string
}

/** The times of a green hook record and of its re-run. */
export type DuplicateTimes = { greenAt: string; rerunAt: string }
