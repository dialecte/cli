import type { ModelTierName } from '../models/model-tiers.types.ts'
import type { STATION_NAMES } from './station-agents.constants.ts'

export type StationName = (typeof STATION_NAMES)[number]

/** One station of a lot that spawns an agent: the envelope the agent runs in, never the station's own text. */
export type StationDefinition = {
	name: StationName
	tier: ModelTierName
	/** Claude Code tool names the agent may use; every other tool is unavailable to it. */
	tools: readonly string[]
	/** When the orchestrator should spawn it: what the host shows next to the agent's name. */
	description: string
	/** Two to four lines: the station of `dialecte-lot` it plays, and what it leaves. */
	role: readonly string[]
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
