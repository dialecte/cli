/** Runs the real cli (`node src/cli.ts`) as a process with a time bound, so rows can run side by side. */
import { execFile } from 'node:child_process'

import { MAX_OUTPUT_BYTES } from './forged-cli-run.constants.ts'
import { CLI_SOURCE } from './handover-store-scenario.constants.ts'

import type { CliProcessRun } from './forged-cli-run.types.ts'

/** The cli with `argv` in `cwd` (the environment of the test plus `env`), killed after `timeout` ms; never rejects: a kill is `timedOut`. */
export function runCliProcess(params: {
	argv: readonly string[]
	cwd: string
	timeout: number
	env?: Readonly<Record<string, string>>
}): Promise<CliProcessRun> {
	return new Promise(function started(resolve) {
		execFile(
			process.execPath,
			[CLI_SOURCE, ...params.argv],
			{
				cwd: params.cwd,
				encoding: 'utf8',
				timeout: params.timeout,
				maxBuffer: MAX_OUTPUT_BYTES,
				env: { ...process.env, ...params.env },
			},
			function finished(error, stdout, stderr) {
				resolve({
					exitCode: exitCodeOf(error),
					stdout,
					stderr,
					timedOut: error?.killed === true,
				})
			},
		)
	})
}

/** The exit code of a finished process: 0 without an error, the code when it is a number, else none (a signal). */
function exitCodeOf(error: { code?: unknown } | null): number | null {
	if (error === null) return 0
	return typeof error.code === 'number' ? error.code : null
}
