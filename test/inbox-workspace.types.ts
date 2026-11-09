import type { BriefWorkspace } from './brief-workspace.types.ts'

/** What a lot of the inbox fixtures is: the state it is in and whether it is simulated. */
export type InboxLotKind =
	| 'person'
	| 'caller'
	| 'ready'
	| 'readyWithoutEntry'
	| 'failed'
	| 'working'
	| 'simulatedWorking'
	| 'simulatedQuestion'
	| 'committed'
	| 'canceled'

/** Two workspaces (repositories `scl` and `core`) holding lots, both stores in the store list. */
export type InboxWorkspaces = {
	scl: BriefWorkspace
	core: BriefWorkspace
	/** The real path of each lot folder, by lot name. */
	folders: Record<string, string>
}
