/** Options of `dialecte members` that take a value (the binding overrides every command shares). */
export const MEMBERS_VALUE_OPTIONS: readonly string[] = [
	'namespace',
	'entry',
	'version',
	'tsconfig',
	'constants-dir',
	'out',
]

export const MEMBERS_USAGE =
	'usage: dialecte members <expression> [--json] [--version <v>]  (in an app: --namespace <Name> --entry <module exporting it>)'
