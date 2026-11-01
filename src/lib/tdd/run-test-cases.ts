/**
 * Runs test cases of a package with its own vitest (`npx --no-install vitest run`, its projects as it
 * declares them), filtered to the files and the case names asked, and answers what the run saw through the
 * cli's reporter. Snapshots are never written (`--update=none`, CI): a test's expected value is its own.
 * The run goes through `runChild`: stdin closed, and stopped as stalled when it prints nothing and its
 * processes gain no CPU for `stallAfter`.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { runChild } from '../progress/run-child.ts'
import { stallReason } from '../progress/stall-reason.ts'
import { tailOf } from '../progress/tail-of.ts'
import {
	CASE_NAME_SEPARATOR,
	COLLECT_ONLY_PATTERN,
	REPORT_ENVIRONMENT_VARIABLE,
	REPORTER_FILE_NAMES,
	RUN_OUTPUT_TAIL_LINES,
	VITEST_COMMAND,
} from './tdd.constants.ts'

import type { Clock } from '../progress/clock.types.ts'
import type { Watchdog } from '../progress/run-child.types.ts'
import type { ReportedModule } from './tdd.types.ts'

export async function runTestCases(params: {
	root: string
	/** Test files, relative to the root. */
	files: readonly string[]
	/** The full names of the cases to run, every case of the files, or none (collect them only). */
	filter: { names: readonly string[] } | 'all' | 'collect'
	/** Added to the run's environment (the machine lock's holder variable while it is held). */
	environment?: Record<string, string>
	/** Default: the system clock. */
	clock?: Clock
	/** Default: stalled after 10 min, sampled every 5 s, with the machine's tools. */
	watchdog?: Watchdog
}): Promise<ReportedModule[] | { failure: string }> {
	const folder = mkdtempSync(join(tmpdir(), 'dialecte-tdd-'))
	const reportPath = join(folder, 'report.json')
	const { filter } = params
	const nameFilter =
		filter === 'all'
			? []
			: ['-t', filter === 'collect' ? COLLECT_ONLY_PATTERN : namePattern(filter.names)]
	try {
		const [command, ...commandArguments] = VITEST_COMMAND
		const execution = await runChild({
			command,
			args: [
				...commandArguments,
				...params.files,
				`--reporter=${reporterPath()}`,
				'--includeTaskLocation',
				'--passWithNoTests',
				// a snapshot never writes its own expected value: a missing or different one fails
				'--update=none',
				...nameFilter,
			],
			cwd: params.root,
			environment: {
				CI: 'true',
				FORCE_COLOR: '0',
				NO_COLOR: '1',
				[REPORT_ENVIRONMENT_VARIABLE]: reportPath,
				...params.environment,
			},
			clock: params.clock,
			watchdog: params.watchdog,
		})
		const tail = tailOf({ output: execution.output, lines: RUN_OUTPUT_TAIL_LINES })
		if (execution.stalled)
			return {
				failure:
					`vitest ${stallReason({ watchdog: params.watchdog })}; its processes, killed:\n${execution.stalled.report}\n${tail}`.trimEnd(),
			}
		if (!existsSync(reportPath))
			return {
				failure: `vitest wrote no report (exit ${execution.exitCode ?? 'none'}):\n${tail}`,
			}
		return JSON.parse(readFileSync(reportPath, 'utf8')) as ReportedModule[]
	} finally {
		rmSync(folder, { recursive: true, force: true })
	}
}

/** vitest matches `-t` against the titles joined with spaces: the exact names, nothing else. */
function namePattern(names: readonly string[]): string {
	const alternatives = names.map((name) =>
		name
			.split(CASE_NAME_SEPARATOR)
			.join(' ')
			.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
	)
	return `^(?:${alternatives.join('|')})$`
}

/** The reporter next to the bundled cli (`tdd-reporter.js`), or next to this file in the sources. */
function reporterPath(): string {
	const folder = dirname(fileURLToPath(import.meta.url))
	const found = REPORTER_FILE_NAMES.map((name) => join(folder, name)).find((path) =>
		existsSync(path),
	)
	if (!found) throw new Error(`the tdd reporter is missing next to ${folder}`)
	return found
}
