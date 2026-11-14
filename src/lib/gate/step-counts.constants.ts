import type { PytestSummaryWords } from './step-counts.types.ts'

/**
 * pytest's summary line, framed with `=` or quiet (`-q`): `2 failed, 5 passed in 1.03s`, `12 passed in 75.20s
 * (0:01:15)`, `no tests ran in 0.01s`. Group 1 is the counts part.
 */
export const PYTEST_SUMMARY_PATTERN =
	/^=*\s*((?:\d+ [a-z]+(?:, )?)+|no tests ran) in \d+(?:\.\d+)?s(?: \([^)]*\))?\s*=*\s*$/gm

/** The words of a pytest summary, and the count each one adds to; `null` is read but counted nowhere. */
export const PYTEST_SUMMARY_WORDS: PytestSummaryWords = {
	passed: 'passed',
	xpassed: 'passed',
	failed: 'failed',
	error: 'failed',
	errors: 'failed',
	skipped: 'skipped',
	xfailed: 'skipped',
	deselected: null,
	warning: null,
	warnings: null,
	rerun: null,
}
