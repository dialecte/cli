import type { ModelTierName } from '../models/model-tiers.types.ts'
import type { STATION_NAMES } from './station-agents.constants.ts'

export type StationName = (typeof STATION_NAMES)[number]

/** What a station may do: read files; review = read and run commands; edit = read, edit, run commands. */
export type StationAccess = 'read' | 'review' | 'edit'

/** One station of a lot that spawns an agent: the envelope the agent runs in; its definition lives in `dialecte-lot`'s references/stations.md. */
export type StationDefinition = {
	name: StationName
	tier: ModelTierName
	/** What the station may do; the Claude adapter maps it to tool names. */
	access: StationAccess
	/** When the orchestrator should spawn it: what the host shows next to the agent's name. */
	description: string
}

/** A file of the project that `skills sync` writes for an agent host. */
export type StationAgentFile = {
	/** File name inside the host's agents folder: `dialecte-reviewer.md`. */
	name: string
	content: string
}

/** What `skills sync` writes for Claude Code, or why it writes nothing. */
export type StationAgentPlan =
	| { kind: 'files'; files: StationAgentFile[] }
	| { kind: 'skipped'; reason: string }

/** What a sync did with the station agent files. */
export type StationAgentReport = {
	written: string[]
	removed: string[]
	/** A file of the same name the user owns: left untouched. */
	conflicts: string[]
	/** One line saying why nothing was written; undefined when files were written. */
	skippedReason?: string
}
