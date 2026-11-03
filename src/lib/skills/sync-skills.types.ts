export type SkillSource = {
	/** Skill folder name = skill name. */
	name: string
	/** Absolute path of the skill folder. */
	path: string
	/** Package (or local repository folder) that ships it. */
	origin: string
	/** The version in the origin's package.json, when it has one. */
	version?: string
	/** `metadata.audience` of its SKILL.md: a contributor skill is installed only by a contributing sync. */
	audience: SkillAudience
}

export type SkillAudience = 'consumer' | 'contributor'

/** The skills a sync installs for its audience, and the contributor skills it leaves out. */
export type AudienceSelection = {
	selected: SkillSource[]
	leftOut: SkillSource[]
}

/** Per installed skill, the package and the version a sync took it from. */
export type SyncedVersions = Record<string, { package: string; version: string }>

/** What a sync leaves in each target folder: what it installed, and from which version. */
export type SyncManifest = {
	installed: string[]
	versions: SyncedVersions
	/** The model vendor of the project (`dialecte models`); unknown for a manifest written before it existed. */
	vendor?: string
	/** A sync with `--contributing` installed the contributor skills too: later syncs keep doing so. */
	contributing?: true
	/** The Claude Code station agent files (names in `.claude/agents`) a sync wrote: what a later sync may replace or remove. */
	stationAgents?: string[]
	/** A sync added the session-start check to `.claude/settings.json`. */
	sessionCheck?: true
	/** The session check created `.claude/settings.json`: removing the check removes the file when it ends up empty. */
	settingsCreated?: true
	/** The exact text the check added to `.claude/settings.json`: removing it gives the original bytes back. */
	sessionCheckInserted?: string
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
