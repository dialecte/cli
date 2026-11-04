/** The scope every Dialecte package is published under. */
export const DIALECTE_SCOPE = '@dialecte/'

export const CORE_PACKAGE = '@dialecte/core'

export const SYNC_COMMAND = 'npx @dialecte/cli skills sync'

export const INSTALL_COMMAND = 'npm install'

/** Two cores installed side by side: dialectes pin core exactly, so the app follows the dialecte's pin. */
export const ALIGN_CORE_FIX =
	'align @dialecte/core with the version the dialecte pins (or upgrade the dialecte), then npm install'

/**
 * What changes for a caller between core generations, newest first: the first whose `from` the installed
 * core reaches describes it.
 */
export const CORE_API_GENERATIONS: readonly {
	from: [number, number]
	name: string
	says: string
}[] = [
	{
		from: [0, 7],
		name: '0.7',
		says: 'import inside the store (project.importFile answers { documentId, diagnostics }), per-file IO hook session, createTestHelpers',
	},
	{
		from: [0, 0],
		name: '0.6',
		says: 'import and IO hooks before the store owned them: read the skills of this version, not the latest docs',
	},
]

/** How many checkout folders one line names. */
export const CHECKOUT_LIST_LIMIT = 8

/** The subject of the station agents' line. */
export const STATION_AGENTS_SUBJECT = 'station agents'

/** The subject of the profile's lines. */
export const PROFILE_SUBJECT = 'profile'

/** A consumer declaring `allowReferences`: every tag is allowed in a consumer already. */
export const CONSUMER_ALLOWS_REFERENCES = 'allowReferences is the consumer default: remove it'

/** A contributor whose `dialecte.gate.full` still runs `{steps}`, which `dialecte contrib` runs. */
export const CONTRIBUTOR_GATE_STEPS =
	'dialecte.gate.full holds {steps}: dialecte contrib runs them, move them to dialecte.contrib.steps (or drop them for the defaults)'

/**
 * A contributor whose skills in `{folder}` were synced without the contributor skills; the line's only fix is the
 * command it names.
 */
export const CONTRIBUTOR_SKILLS_NOT_SYNCED =
	'{folder} lacks the contributor skills: dialecte skills sync installs them in a contributor'
