import type { LandingRepository } from './land-lot.types.ts'
import type { StationLot } from './lot-station-workspace.types.ts'

/** The fresh folders `TMPDIR` and `DIALECTE_SCRATCH` point at once isolated. */
export type IsolatedFolders = { temporary: string; scratch: string }

/**
 * A store lot for the `lot design` cases: the real path of its design file, a folder outside the design's for a review
 * a case names (made before the isolation: no scratch file), and the isolated temporary folders.
 */
export type DesignLot = StationLot & {
	designFile: string
	reviewFolder: string
	isolated: IsolatedFolders
}

/** A store lot whose own worktree is a vitest package, for the gate's cases. */
export type GatedLot = {
	root: string
	lotFolder: string
	name: string
	/** The file the package's counting `check` step appends a line to on each run. */
	counter: string
	/** The design file, in a folder of its own, in no git work tree. */
	designFile: string
}

/** A landing repository whose store lot has the repository's worktree, and the lot's design file. */
export type LandingLot = LandingRepository & { name: string; designFile: string }
