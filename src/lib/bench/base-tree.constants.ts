/** The purpose of the scratch folder a base tree is exported into: `<scratch root>/bench-base<random>`. */
export const BASE_TREE_PURPOSE = 'bench-base'

/** The install of a base tree whose lock the head's `node_modules` does not install: its lock, nothing run. */
export const BASE_TREE_INSTALL_ARGS: readonly string[] = [
	'ci',
	'--ignore-scripts',
	'--no-audit',
	'--no-fund',
]

/** Why a base tree could not be made: `{commit}`, `{paths}`, `{reason}` filled. */
export const BASE_TREE_REFUSALS = {
	export: 'the base tree: {commit} cannot be exported ({reason})',
	missing:
		'the base tree: its sibling dependencies {paths} cannot be linked (missing beside the head)',
	leaving: 'the base tree: its sibling dependencies {paths} leave the scratch folder',
	install: 'the base tree: npm ci failed ({reason})',
} as const

/** The reason of a command that printed nothing: its exit status. */
export const SILENT_FAILURE = 'exit {status}'
