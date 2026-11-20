import { API_PROBE_FILE } from '../../commands/coverage.constants.ts'

/** The counts the bench reads from `tsc --extendedDiagnostics`: deterministic on one checker, timings left out. */
export const METRICS = ['Instantiations', 'Types', 'Symbols'] as const

/**
 * The first TypeScript major that checks with several checkers (tsgo); it counts instantiations per checker, so the
 * total shifts with how files fall across checkers. One checker gives one count.
 */
export const NATIVE_COMPILER_MAJOR = 7

/** The arguments that pin tsgo to one checker. */
export const SINGLE_CHECKER_ARGS: readonly string[] = ['--checkers', '1']

/** The folder a whole-program emit writes its declarations to, in the measured tree, removed after. */
export const EMIT_FOLDER = '.bench-dts'

/** The per-file configuration written in the measured tree, removed after: `{file}` the file with `/` and `.` as `_`. */
export const ISOLATED_TSCONFIG_NAME = '.bench-{file}.tsconfig.json'

/** The scenarios of a version, as the table names them. */
export const SCENARIOS = {
	check: 'whole-program (check)',
	emit: 'whole-program (emit)',
	consumer: 'consumer: {name}',
} as const

/** The probes `dialecte coverage` writes into a version's generated folder, by scenario. */
export const PROBE_SCENARIOS: Readonly<Record<string, string>> = {
	'baseline (import)': 'baseline.ts',
	'coverage: surface': 'coverage.surface.generated.ts',
	'coverage: calls': 'coverage.calls.generated.ts',
	'coverage: deep': 'coverage.deep.generated.ts',
	'coverage: api': API_PROBE_FILE,
}

/** A hand-written consumer of a version's types (`benchmarks/types/<version>/*.ts`), its type tests left out. */
export const CONSUMER_EXTENSION = '.ts'
export const TYPE_TEST_EXTENSION = '.test-d.ts'

/** Why a tree cannot be measured: `{version}`, `{reason}`, `{scenario}`, `{output}` filled. */
export const MEASURE_REFUSALS = {
	probes: 'the probes of [{version}] cannot be generated ({reason})',
	discovery: '[{version}] method discovery failed ({reason})',
	noCount: '{scenario}: the compiler gave no count ({output})',
} as const
