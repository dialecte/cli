/**
 * Runs test cases of a package with its own vitest (`node_modules/.bin/vitest` up to the repository root,
 * else `npx --no-install vitest run`; its projects as it declares them), filtered to the files and the case
 * names asked, and answers what the run saw through the cli's reporter.
 * Snapshots are never written (`--update=none`, CI): a test's expected value is its own. No results cache is
 * written either (`--cache=false`): the run leaves the tree as it found it.
 * The run goes through `runReportingChild`: stdin closed, stopped as stalled or past its bound.
 */
import { resolvePackageVitest } from './package-vitest.ts'
import { namePattern, reporterPath, runReportingChild } from './run-reporting-child.ts'
import { COLLECT_ONLY_PATTERN, REPORTER_FILE_NAMES } from './tdd.constants.ts'

import type { ReportedModule, RunnerParams, TestRunFailure } from './tdd.types.ts'

export async function runVitestCases(
	params: RunnerParams,
): Promise<ReportedModule[] | TestRunFailure> {
	const { filter } = params
	const nameFilter =
		filter === 'all'
			? []
			: ['-t', filter === 'collect' ? COLLECT_ONLY_PATTERN : namePattern(filter.names)]
	const { command, arguments: commandArguments } = resolvePackageVitest({ root: params.root })
	const reporter = reporterPath(REPORTER_FILE_NAMES)
	return runReportingChild({
		runner: 'vitest',
		command,
		args: [
			...commandArguments,
			...params.files,
			`--reporter=${reporter}`,
			'--includeTaskLocation',
			'--passWithNoTests',
			// a snapshot never writes its own expected value: a missing or different one fails
			'--update=none',
			// no results cache under node_modules: a run leaves the package's tree (and a base copy's linked
			// node_modules) as it found it
			'--cache=false',
			...nameFilter,
		],
		environment: { CI: 'true', FORCE_COLOR: '0', NO_COLOR: '1' },
		run: params,
	})
}
