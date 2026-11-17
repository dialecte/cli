export const METRICS = [
	'Instantiations',
	'Types',
	'Symbols',
	'Memory used',
	'Check time',
	'Total time',
]
// Deterministic metrics only — these are what get persisted to the committed baseline. Timing
// ('Check time'/'Total time') and 'Memory used' vary run-to-run, so persisting them would churn
// the baseline on every `bench`; the --check gate compares Instantiations regardless.
export const STABLE_METRICS = ['Instantiations', 'Types', 'Symbols']
export const THRESHOLD = 0.05
// The first TypeScript major that checks with several checkers (tsgo); it counts instantiations per
// checker, so the total shifts with how files fall across checkers. One checker gives one count.
export const NATIVE_COMPILER_MAJOR = 7
export const SINGLE_CHECKER_ARGS = ['--checkers', '1']
// `bench --check` against a baseline from another compiler or version, or one that records none.
export const EXIT_COMPILER_MISMATCH = 3
// `bench --check` with no baseline.json to compare with.
export const EXIT_NO_BASELINE = 2
export const RE_BASELINE = 're-baseline in its own commit'
