import type { LandingRepository } from './land-lot.types.ts'
import type { StationLot } from './lot-station-workspace.types.ts'

/** A store lot for the `lot design` cases, and the real path of its design file. */
export type DesignLot = StationLot & { designFile: string }

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
