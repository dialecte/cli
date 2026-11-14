import type { RunQuery } from './run.types.ts'

/** The name of the in-memory project a run opens. */
export const RUN_PROJECT_NAME = 'dialecte-run'

/** The seed of the ids a run mints when none is given. */
export const DEFAULT_RUN_SEED = 0

/** How long a script may run before the run gives up on it. */
export const DEFAULT_RUN_TIMEOUT_IN_MILLISECONDS = 120_000

/** The name `collectCatalogues` gives core's error catalogue (every other catalogue is named by its export). */
export const CORE_CATALOGUE_NAME = 'core'

/** The packages of the `@dialecte` scope that are not dialectes. */
export const NON_DIALECTE_PACKAGES: ReadonlySet<string> = new Set([
	'@dialecte/core',
	'@dialecte/cli',
	'@dialecte/create',
])

/** The query of a run that failed before its document was open: no element to locate. */
export const NO_DOCUMENT_QUERY: RunQuery = {
	any: {
		getRecord: async function noRecord() {
			return undefined
		},
	},
}

/** The project methods that write: refused under `--prepare`, which commits nothing. */
export const PREPARE_REFUSED_PROJECT_METHODS: ReadonlySet<string> = new Set([
	'import',
	'importFile',
	'initEmptyDocument',
	'removeDocument',
	'undo',
	'redo',
	'addBlob',
	'attachBlob',
	'detachBlob',
	'removeBlob',
	'close',
	'destroy',
	'getDatabaseInstance',
])

/** The transaction methods only the runner calls: a script's callback is refused them, in every mode. */
export const RUNNER_ONLY_TRANSACTION_METHODS: ReadonlySet<string> = new Set([
	'commit',
	'finishStaging',
	'clearStagedOperations',
])
