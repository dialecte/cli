/**
 * Runs test cases of a package with its own vitest (`npx --no-install vitest run`, its projects as it
 * declares them), filtered to the files and the case names asked, and answers what the run saw through the
 * cli's reporter. Snapshots are never written (`--update=none`, CI): a test's expected value is its own.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { stripVTControlCharacters } from 'node:util'

import {
	CASE_NAME_SEPARATOR,
	COLLECT_ONLY_PATTERN,
	REPORT_ENVIRONMENT_VARIABLE,
	REPORTER_FILE_NAMES,
	RUN_OUTPUT_TAIL_LINES,
	VITEST_COMMAND,
} from './tdd.constants.ts'

import type { ReportedModule } from './tdd.types.ts'

export function runTestCases(params: {
	root: string
	/** Test files, relative to the root. */
	files: readonly string[]
	/** The full names of the cases to run, every case of the files, or none (collect them only). */
	filter: { names: readonly string[] } | 'all' | 'collect'
}): ReportedModule[] | { failure: string } {
	const folder = mkdtempSync(join(tmpdir(), 'dialecte-tdd-'))
	const reportPath = join(folder, 'report.json')
	const { filter } = params
	const nameFilter =
		filter === 'all'
			? []
			: ['-t', filter === 'collect' ? COLLECT_ONLY_PATTERN : namePattern(filter.names)]
	try {
		const [command, ...commandArguments] = VITEST_COMMAND
		const execution = spawnSync(
			command,
			[
				...commandArguments,
				...params.files,
				`--reporter=${reporterPath()}`,
				'--includeTaskLocation',
				'--passWithNoTests',
				// a snapshot never writes its own expected value: a missing or different one fails
				'--update=none',
				...nameFilter,
			],
			{
				cwd: params.root,
				encoding: 'utf8',
				maxBuffer: 1e9,
				env: {
					...process.env,
					CI: 'true',
					FORCE_COLOR: '0',
					NO_COLOR: '1',
					[REPORT_ENVIRONMENT_VARIABLE]: reportPath,
				},
			},
		)
		if (!existsSync(reportPath)) {
			const output = stripVTControlCharacters(`${execution.stdout ?? ''}${execution.stderr ?? ''}`)
			return {
				failure: `vitest wrote no report (exit ${execution.status ?? 'none'}):\n${output.trimEnd().split('\n').slice(-RUN_OUTPUT_TAIL_LINES).join('\n')}`,
			}
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
