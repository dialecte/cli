export const VERB_KINDS = ['query', 'transaction'] as const

/** A namespace or verb name: camelCase, starting with a lowercase letter. */
export const VERB_NAME_PATTERN = /^[a-z][A-Za-z0-9]*$/

/** The registry of a dialecte's extension modules in `extensions/index.ts`: `SCL_EXTENSION_MODULES`. */
export const EXTENSION_REGISTRY_PATTERN = /_EXTENSION_MODULES$/

/** The root element a generated dialecte declares in `definition/constants.generated.ts`. */
export const ROOT_ELEMENT_PATTERN = /export const ROOT_ELEMENT = '([^']+)'/

/** What each kind of verb takes first, and the group it is registered under. */
export const KIND_SHAPES = {
	query: { firstParameter: 'query: Core.Query<Config>', group: 'Queries', moduleKey: 'query' },
	transaction: {
		firstParameter: 'tx: Core.Transaction<Config>',
		group: 'Transactions',
		moduleKey: 'transaction',
	},
} as const

/** Options of `new verb` followed by a value, which is not one of the command's words. */
export const OPTIONS_WITH_VALUE: readonly string[] = ['--version', '--format-config']
