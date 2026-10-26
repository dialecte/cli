export type SkillSource = {
	/** Skill folder name = skill name. */
	name: string
	/** Absolute path of the skill folder. */
	path: string
	/** Package (or local repository folder) that ships it. */
	origin: string
}

export type SyncMode = 'link' | 'copy'

export type SyncReport = {
	installed: string[]
	/** Previously installed by sync, no longer shipped by any source. */
	removed: string[]
	/** A folder of the same name the user owns: left untouched. */
	conflicts: string[]
}

export type DiscoveredSkillSources = {
	sources: SkillSource[]
	/** Dependencies with no installed folder (not installed yet, or resolved elsewhere). */
	missingDependencies: string[]
}
