import type { StartWorkspace } from './lot-start-workspace.types.ts'

/** What a spawned `dialecte lot` left: its exit code and both streams. */
export type LotRun = {
	status: number | null
	stdout: string
	stderr: string
	/** The process was killed by the spawn's timeout. */
	timedOut: boolean
}

/** A scratch workspace holding a started lot, whose repository pins a cli version. */
export type FloorLotWorkspace = {
	start: StartWorkspace
	/** A folder with no package.json above it: where the case runs `lot`. */
	elsewhere: string
	/** The lot folder (real path). */
	lotFolder: string
}
