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

/** The subject of the host check's git line. */
export const GIT_SUBJECT = 'git'

/** What the host check's version lines say; `{x}` filled per line. */
export const HOST_VERSION_TEXTS = {
	asRecorded: '{version}, as recorded',
	newer: '{version}, newer than the recorded {recorded}',
	older: '{version}, older than the recorded {recorded}: a read may differ from the record',
	absent: '{absent} is not installed (recorded {recorded})',
	gitFloor: 'git {floor} or later needed, found {line}',
} as const

/** The fix of a tool older than its record. */
export const UPGRADE_TOOL_FIX = 'upgrade {tool} to {recorded} or later'

/** The subject of `doctor --host`'s line when no vendor can be probed. */
export const HOST_SUBJECT = 'host'

/** How the command map's usage line of `doctor --host` starts: the line a usage error prints. */
export const HOST_USAGE_START = 'dialecte doctor --host'

/** `--vendor` given with no name. */
export const VENDOR_NEEDS_NAME = 'doctor: --vendor needs a vendor name'

/** `--vendor=<name>`, a form the cli does not read: the name goes in the next word. */
export const VENDOR_EQUALS_FORM = 'doctor: --vendor takes its name as the next word, not after ='

/** How the `=` form of `--vendor` starts. */
export const VENDOR_EQUALS_PREFIX = '--vendor='

/** The leading number of a version's dotted part (`1-pre` → `1`). */
export const LEADING_DIGITS = /^\d+/
