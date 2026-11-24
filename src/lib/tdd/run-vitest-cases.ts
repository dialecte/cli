/**
 * Runs test cases of a package with its own vitest (`node_modules/.bin/vitest` up to the repository root,
 * else `npx --no-install vitest run`; its projects as it declares them), filtered to the files and the case
 * names asked, and answers what the run saw through the cli's reporter.
 * Snapshots are never written (`--update=none`, CI): a test's expected value is its own. No results cache is
 * written either (`--cache=false`): the run leaves the tree as it found it.
 * The run goes through `runReportingChild`: stdin closed, stopped as stalled or past its bound. With a selection of CI's
 * projects (`RunnerParams.vitestSelection`), the files a CI project holds run with a `--project` per CI name, the
 * others in a second run on the time the first left.
 */
import { realpathSync } from 'node:fs'
import { resolve } from 'node:path'

import { resolvePackageVitest } from './package-vitest.ts'
import { namePattern, reporterPath, runReportingChild } from './run-reporting-child.ts'
import {
	COLLECT_ONLY_PATTERN,
	REPORTER_FILE_NAMES,
	VITEST_PROJECT_FLAG,
	VITEST_RUN_ENVIRONMENT,
} from './tdd.constants.ts'

import type { ReportedModule, RunnerParams, TestRunFailure } from './tdd.types.ts'

export async function runVitestCases(
	params: RunnerParams,
): Promise<ReportedModule[] | TestRunFailure> {
	// read on its first use: the probe's time shows inside this run's step
	const selection = await params.vitestSelection?.select()
	// the projects could not be read: the vitest run answers why, as its step
	if (selection && 'failure' in selection) return selection
	if (selection?.ci.kind !== 'projects')
		return runOnce({ params, files: params.files, projects: [] })
	// the files a CI project holds run in CI's projects (as CI names them); the others where their config holds them
	const held = params.files.filter((file) => selection.held.includes(file))
	const others = params.files.filter((file) => !selection.held.includes(file))
	const startedAt = Date.now()
	const inProjects = held.length
		? await runOnce({ params, files: held, projects: selection.ci.names })
		: []
	if ('failure' in inProjects) return inProjects
	const timeoutMs =
		params.timeoutMs === undefined
			? undefined
			: Math.max(0, params.timeoutMs - (Date.now() - startedAt))
	const outside = others.length
		? await runOnce({
				params: { ...params, ...(timeoutMs !== undefined && { timeoutMs }) },
				files: others,
				projects: [],
			})
		: []
	if ('failure' in outside) return outside
	return inFileOrder({
		root: params.root,
		files: params.files,
		modules: [...inProjects, ...outside],
	})
}

/** One vitest run of `files`, with a `--project` per name (none: every project holding them). */
async function runOnce(params: {
	params: RunnerParams
	files: readonly string[]
	projects: readonly string[]
}): Promise<ReportedModule[] | TestRunFailure> {
	const run = params.params
	const { filter } = run
	const nameFilter =
		filter === 'all'
			? []
			: ['-t', filter === 'collect' ? COLLECT_ONLY_PATTERN : namePattern(filter.names)]
	const { command, arguments: commandArguments } = resolvePackageVitest({ root: run.root })
	const reporter = reporterPath(REPORTER_FILE_NAMES)
	return runReportingChild({
		runner: 'vitest',
		command,
		args: [
			...commandArguments,
			...params.files,
			...params.projects.flatMap((name) => [VITEST_PROJECT_FLAG, name]),
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
		environment: { ...VITEST_RUN_ENVIRONMENT },
		run,
	})
}

/** The modules of the two runs in the order of the run's files (a module's file is absolute). */
function inFileOrder(params: {
	root: string
	files: readonly string[]
	modules: readonly ReportedModule[]
}): ReportedModule[] {
	// vitest reports a module under the root's real path
	const root = realpathSync.native(params.root)
	const order = new Map(params.files.map((file, index) => [resolve(root, file), index]))
	return [...params.modules].sort(
		(left, right) =>
			(order.get(left.file) ?? params.files.length) -
			(order.get(right.file) ?? params.files.length),
	)
}
