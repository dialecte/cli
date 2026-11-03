/** An export subpath one segment deep (`./v2019C1`): a version candidate. */
export const VERSION_SUBPATH_PATTERN = /^\.\/[^/*]+$/

/** The entry a dialecte exports next to each version (`./v2019C1/test`). */
export const TEST_ENTRY = 'test'

export const NO_DIALECTE_INSTALLED =
	'no dialecte installed here (a dependency built on @dialecte/core exporting ./<version> with ./<version>/test): pass --namespace <Name> --entry <module>\n'
