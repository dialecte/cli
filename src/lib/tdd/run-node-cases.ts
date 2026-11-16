/**
 * Runs the node test files of a package with `node --test` through the cli's reporter: filtered to the case names
 * asked (`--test-name-pattern`), every case when collecting (node has no collect-only mode), and answers what the
 * run saw. The node running the cli runs them, with no node flag of its own; the run is never nested in a parent's
 * (`NODE_TEST_CONTEXT` removed), and its spec output is the tail a failed run shows.
 */
import { namePattern, reporterPath, runReportingChild } from './run-reporting-child.ts'
import { NODE_REPORTER_FILE_NAMES, NODE_TEST_CONTEXT_VARIABLE } from './tdd.constants.ts'

import type { ReportedModule, RunnerParams, TestRunFailure } from './tdd.types.ts'

export function runNodeCases(params: RunnerParams): Promise<ReportedModule[] | TestRunFailure> {
	const { filter } = params
	const nameFilter =
		filter === 'all' || filter === 'collect'
			? []
			: [`--test-name-pattern=${namePattern(filter.names)}`]
	return runReportingChild({
		runner: 'node',
		command: process.execPath,
		args: [
			'--test',
			// the cli's reporter yields nothing: it writes the report itself, to DIALECTE_TDD_REPORT
			`--test-reporter=${reporterPath(NODE_REPORTER_FILE_NAMES)}`,
			'--test-reporter-destination=stdout',
			'--test-reporter=spec',
			'--test-reporter-destination=stdout',
			...nameFilter,
			...params.files,
		],
		environment: { CI: 'true', FORCE_COLOR: '0', NO_COLOR: '1' },
		unset: [NODE_TEST_CONTEXT_VARIABLE],
		run: params,
	})
}
