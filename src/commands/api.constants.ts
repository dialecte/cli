export const API_SUBCOMMANDS = ['find', 'show'] as const

/** Options of `dialecte api` that take a value: their value is not a word of the need. */
export const API_VALUE_OPTIONS: readonly string[] = ['package', 'limit']

/** How many methods `api find` lists without `--limit`: enough to choose, few enough to read. */
export const DEFAULT_FIND_LIMIT = 5

export const API_USAGE =
	'usage: dialecte api find "<need>" [--package <name>] [--limit 5] [--json] | dialecte api show <path> [--json]'
