/**
 * What the runners share: a run of a runner's process (vitest, node --test) through the cli's reporter, which
 * writes what the run saw to a file of a fresh folder (`DIALECTE_TDD_REPORT`). The run goes through `runChild`:
 * stdin closed, and stopped as stalled when it prints nothing and its processes gain no CPU for `stallAfter`; past
 * `timeoutMs`, its process group is killed. A run that wrote no report answers a failure naming its runner, with
 * the last lines it printed.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { childLinesOf } from '../print/relayed.ts'
import { formatDuration } from '../progress/format-duration.ts'
import { runChild } from '../progress/run-child.ts'
import { stallReason } from '../progress/stall-reason.ts'
import {
	CASE_NAME_SEPARATOR,
	REPORT_ENVIRONMENT_VARIABLE,
	REPORT_LINE_SEPARATOR,
	RUN_OUTPUT_TAIL_LINES,
} from './tdd.constants.ts'

import type { ReportedModule, ReportingRun, TestRunFailure } from './tdd.types.ts'

/** Runs the runner's process once and answers the modules its reporter wrote, or why it could not. */
export async function runReportingChild(
	params: ReportingRun,
): Promise<ReportedModule[] | TestRunFailure> {
	const { runner, run } = params
	const folder = mkdtempSync(join(tmpdir(), 'dialecte-tdd-'))
	const reportPath = join(folder, 'report.json')
	// each input as a JSON file beside the report, its path in its variable
	const inputs = Object.fromEntries(
		Object.entries(params.inputs ?? {}).map(([variable, value], index) => {
			const path = join(folder, `input-${index}.json`)
			writeFileSync(path, JSON.stringify(value))
			return [variable, path]
		}),
	)
	let timer: ReturnType<typeof setTimeout> | undefined
	let timedOut = false
	try {
		const { timeoutMs } = run
		const execution = await runChild({
			// past the bound, the whole group is stopped: the run settles with what it printed
			...(timeoutMs !== undefined && {
				onProcessGroup: function boundRun(pid: number) {
					timer = setTimeout(function stopRun() {
						timedOut = true
						killGroup(pid)
					}, timeoutMs)
				},
			}),
			command: params.command,
			args: params.args,
			cwd: params.cwd ?? run.root,
			environment: { ...params.environment, ...inputs, [REPORT_ENVIRONMENT_VARIABLE]: reportPath },
			...(params.unset && { unset: params.unset }),
			clock: run.clock,
			watchdog: run.watchdog,
		})
		const tail = tailLinesOf(execution.output)
		if (timedOut)
			return {
				failure: `${runner} ran past its bound of ${formatDuration(run.timeoutMs ?? 0)}: stopped`,
				tail,
			}
		if (execution.stalled)
			return {
				failure: `${runner} ${stallReason({ watchdog: run.watchdog })}; its processes, killed: ${oneLineReport(execution.stalled.report)}`,
				tail,
			}
		if (!existsSync(reportPath))
			return { failure: `${runner} wrote no report (exit ${execution.exitCode ?? 'none'}):`, tail }
		return JSON.parse(readFileSync(reportPath, 'utf8')) as ReportedModule[]
	} finally {
		if (timer) clearTimeout(timer)
		rmSync(folder, { recursive: true, force: true })
	}
}

/** A runner's name filter (vitest `-t`, node `--test-name-pattern`) matches the titles joined with spaces: the exact names, nothing else. */
export function namePattern(names: readonly string[]): string {
	const alternatives = names.map((name) =>
		name
			.split(CASE_NAME_SEPARATOR)
			.join(' ')
			.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
	)
	return `^(?:${alternatives.join('|')})$`
}

/** A reporter next to the bundled cli (`<name>.js`), or next to this file in the sources (`<name>.ts`). */
export function reporterPath(fileNames: readonly string[]): string {
	const folder = dirname(fileURLToPath(import.meta.url))
	const found = fileNames.map((name) => join(folder, name)).find((path) => existsSync(path))
	if (!found) throw new Error(`the tdd reporter ${fileNames[0]} is missing next to ${folder}`)
	return found
}

/** The last lines the runner printed, as it printed them: they are relayed, their colours kept. */
function tailLinesOf(output: string): string[] {
	const text = output.trimEnd()
	return text === '' ? [] : childLinesOf(text).slice(-RUN_OUTPUT_TAIL_LINES)
}

/** The report of the killed processes, one line per process folded into the one line of the failure. */
function oneLineReport(report: string): string {
	return childLinesOf(report)
		.map((line) => line.trim())
		.filter(Boolean)
		.join(REPORT_LINE_SEPARATOR)
}

/** Stops the run's process group (the child is its leader); a group already gone is no error. */
function killGroup(pid: number): void {
	try {
		process.kill(-pid, 'SIGKILL')
	} catch {
		// the group ended on its own
	}
}
