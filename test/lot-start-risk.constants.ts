/** The manifest of the scratch repository: a tool (a `bin`) that declares its store folder high. */
export const DECLARING_PACKAGE_JSON = `{
	"name": "scratch",
	"version": "1.0.0",
	"bin": { "scratch": "scratch.js" },
	"dialecte": { "risk": { "high": ["src/lib/store/**"] } }
}
`

/** The manifest of a scratch repository that declares nothing. */
export const PLAIN_PACKAGE_JSON = `{
	"name": "scratch",
	"version": "1.0.0",
	"bin": { "scratch": "scratch.js" }
}
`

/** The declared glob, a scope entry it holds, a scope entry that may reach it, and one away from it. */
export const DECLARED_GLOB = 'src/lib/store/**'
export const DECLARED_SCOPE = 'src/lib/store/publish.ts'
export const FOLDER_SCOPE = 'src/lib/store/'
export const BROAD_SCOPE = 'src/**'
/** A literal path inside the broad scope: the path of the lot. */
export const BROAD_LOT_PATH = 'src/x.ts'
export const AWAY_SCOPE = 'src/dataflow/'

/** The reasons of a derived high class for the declared scope and for the broad scope. */
export const DECLARED_REASONS = [{ kind: 'declared', file: DECLARED_SCOPE, detail: DECLARED_GLOB }]
export const FOLDER_REASONS = [{ kind: 'declared', file: 'src/lib/store', detail: DECLARED_GLOB }]
export const BROAD_REASONS = [
	{ kind: 'broad-scope', detail: `broad scope: may touch ${DECLARED_GLOB}` },
]

/** What a refused start leaves: nothing. */
export const NOTHING_CREATED = { claims: [], lots: [], worktrees: [], storeList: undefined }
