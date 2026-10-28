export type SkillSource = {
	/** Skill folder name = skill name. */
	name: string
	/** Absolute path of the skill folder. */
	path: string
	/** Package (or local repository folder) that ships it. */
	origin: string
	/** The version in the origin's package.json, when it has one. */
	version?: string
}

/** Per installed skill, the package and the version a sync took it from. */
export type SyncedVersions = Record<string, { package: string; version: string }>

/** What a sync leaves in each target folder: what it installed, and from which version. */
export type SyncManifest = {
	installed: string[]
	versions: SyncedVersions
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
