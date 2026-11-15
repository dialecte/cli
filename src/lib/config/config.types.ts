import type { DialecteField } from '../package-json.types.ts'

export type ConfigLayer = 'project' | 'personal'

/** One key of the registry: its layer, whether a personal `repos:` entry may override it, its variable, its check. */
export type ConfigKeySpec = {
	/** A top-level key: 'gate', 'load', 'editor', ... */
	key: string
	layer: ConfigLayer
	/** Personal keys a `repos:` entry may set (false for corpora and every project key). */
	repoOverride: boolean
	/** The variable that wins over every file. */
	environment?: string
	description: string
	/** What is wrong with a value, undefined when it holds. */
	problemOf: (value: unknown) => string | undefined
}

export type ConfigSource =
	| { kind: 'environment'; variable: string }
	| { kind: 'repo'; file: string; line: number; repo: string }
	| { kind: 'personal'; file: string; line: number }
	| { kind: 'project'; file: string; line: number }

export type ConfigValue = { key: string; value: unknown; source: ConfigSource }

export type ConfigFinding = { file: string; line: number; key?: string; problem: string }

export type ConfigContext = {
	/** The package root holding `.dialecterc`. */
	root: string
	environment: Readonly<Record<string, string | undefined>>
	platform: NodeJS.Platform
	home: string
	/** Defaults to CONFIG_KEYS. */
	keys?: readonly ConfigKeySpec[]
	/** The layers to resolve (default both); `['project']` skips the repository key (`repo` is then undefined). */
	layers?: readonly ConfigLayer[]
}

export type ResolvedConfig = {
	/** `<root>/.dialecterc` */
	projectFile: string
	personalFile: string
	/** The repository key; undefined when the personal layer is not resolved (`layers: ['project']`). */
	repo?: { key: string; from: 'remote' | 'path' }
	/** One per key with a value, in registry order. */
	values: ConfigValue[]
	/** What every reader refuses. */
	refusals: ConfigFinding[]
	/** Refusals plus unknown keys (what check reports). */
	findings: ConfigFinding[]
}

export type ConfigEntry = { key: string; value: unknown; line: number }

export type ConfigRepoEntry = { repo: string; line: number; entries: ConfigEntry[] }

export type ConfigFileRead =
	| { missing: true; file: string }
	| {
			missing: false
			file: string
			entries: ConfigEntry[]
			repos: ConfigRepoEntry[]
			findings: ConfigFinding[]
	  }

/**
 * The project keys' values as their checks and `dialecterc.schema.json` describe them (`readProjectSettings`): the
 * keys of the registry's project layer, the shapes `DialecteField` already names reused (the settings-types test
 * pins both).
 */
export type ProjectSettings = {
	profile?: DialecteField['profile']
	baseBranch?: DialecteField['baseBranch']
	gate?: DialecteField['gate']
	contrib?: DialecteField['contrib']
	tdd?: DialecteField['tdd']
	references?: { allow?: string[]; patterns?: string[] }
	mutation?: Record<string, unknown>
	generatedDocs?: DialecteField['generatedDocs']
	risk?: DialecteField['risk']
	rebuiltIgnored?: DialecteField['rebuiltIgnored']
	tsconfig?: string
	namespace?: string
	entry?: string
	constantsDir?: string
	out?: string
}

/** The personal keys' values as their checks and `config-yml.schema.json` describe them (`readPersonalSettings`): the keys of the registry's personal layer. */
export type PersonalSettings = {
	editor?: string
	load?: { budget?: number }
	personProcesses?: string[]
	forbiddenWords?: string[]
	consumerNames?: string[]
	corpora?: Record<string, { xsd: string; instances?: string }>
}
