import type { LotEvent } from '../src/lib/events/event.types.ts'
import type { GateStep } from '../src/lib/gate/gate-config.types.ts'
import type { BriefWorkspace } from './brief-workspace.types.ts'

/** What the package of a lot repository declares for its gates and contrib. */
export type StepLotPackage = {
	fast?: StepList
	full?: StepList
	release?: StepList
	/** `dialecte.contrib.steps`; also makes the package a contributor. */
	contribSteps?: StepList
	/** More keys of the `dialecte` block (a `mutation` declaration, ...). */
	extraDialecte?: Record<string, unknown>
	/** More top-level keys of `package.json` (`type`, ...). */
	extraPackage?: Record<string, unknown>
	/** More files committed with the package, by path. */
	files?: Record<string, string>
}

/** Steps, or steps that need the marker folder of the case (known once its workspace exists). */
export type StepList = GateStep[] | ((markerFolder: string, eventsFile: string) => GateStep[])

/** A scratch repository holding a committed package, a lot whose identity names a real worktree of it. */
export type StepLot = {
	workspace: BriefWorkspace
	name: string
	lotFolder: string
	/** Where the lot's events go (it may not exist yet). */
	eventsFile: string
	/** The real path of the lot's own worktree, where the steps run. */
	worktree: string
	/** The folder where heavy-step markers go (it may not exist yet). */
	markerFolder: string
}

/** The step events of a lot (`step.*` kinds), in file order. */
export type StepEvents = LotEvent[]
