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
