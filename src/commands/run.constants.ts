/** The flags of `dialecte run` that take a value. */
export const RUN_VALUE_FLAGS: ReadonlySet<string> = new Set([
	'in',
	'out',
	'expect',
	'package',
	'seed',
	'now',
	'timeout',
])

/** The flags of `dialecte run` that stand alone. */
export const RUN_BOOLEAN_FLAGS: ReadonlySet<string> = new Set(['prepare', 'json'])

export const RUN_USAGE =
	'usage: dialecte run <script.ts> [--in <file>] [--out <file>] [--prepare] [--expect <file>] [--seed <n>] [--now <iso>] [--package <name>] [--timeout <ms>] [--json]'

/** Exit codes: an answer, a failed run or unmet expectations, a usage error. */
export const EXIT_OK = 0
export const EXIT_FAILED = 1
export const EXIT_USAGE = 2
