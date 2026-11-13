import type { AgentsFileCheckState } from '../lib/stations/agents-file-check.types.ts'
import type { SUBCOMMAND_NAMES } from './skills.constants.ts'

export type SkillsSubcommand = (typeof SUBCOMMAND_NAMES)[number]

/** A markdown page of a skill: its SKILL.md or a reference page. */
export type SkillPage = {
	/** Relative to the package root: `skills/dialecte/references/core-api.md`. */
	file: string
	skillName: string
	isSkillFile: boolean
}

/** What `runSync` reports back: what became of the `AGENTS.md` section (`left-alone`: `--no-agents-file`). */
export type SyncResult = { agentsFile: AgentsFileCheckState | 'left-alone' }
