/**
 * A warning of the step recorder said to a standard error that nobody reads (the pipe is closed): the gate answers as
 * it does when the file is writable, its standard output intact. The gate runs as a child process of the test (the
 * cli's own source), its events file blocked by a folder so that one warning fires.
 */
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { SCRATCH_REPOSITORY_TIMEOUT } from '../../test/scratch-checks.constants.ts'
import { createStepLot } from '../../test/step-events-lot.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

const CLI_SOURCE = join(import.meta.dirname, '..', 'cli.ts')

/**
 * How long the case waits for the gate to exit: a guard against a hang, never a measure of speed (a gate starts in a
 * few seconds on a loaded machine; a minute is far above that).
 */
const WAIT_BOUND_MS = 60_000

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/**
 * Runs `gate --fast --json` of a lot with one step as a child process; with `blocked`, a folder stands at the lot's
 * events file (a warning fires); with `closedStderr`, the reading end of the child's standard error is closed before
 * it can write. The exit code and the standard output. Whatever happens, the child is killed.
 */
async function gateOf(params: { blocked: boolean; closedStderr: boolean }) {
	const lot = createStepLot({ fast: [{ name: 'one', run: 'echo one' }] })
	if (params.blocked) mkdirSync(lot.eventsFile)
	const run = spawn(process.execPath, [CLI_SOURCE, 'gate', '--fast', '--json'], {
		cwd: lot.worktree,
		env: process.env,
		stdio: ['ignore', 'pipe', 'pipe'],
	})
	try {
		if (params.closedStderr) run.stderr.destroy()
		let output = ''
		run.stdout.on('data', (chunk: Buffer) => {
			output += chunk.toString('utf8')
		})
		const exited = new Promise<number | null>((resolveExit) => run.on('close', resolveExit))
		const bound = new Promise<never>((_, reject) =>
			setTimeout(
				() => reject(new Error(`the gate still runs after ${WAIT_BOUND_MS} ms`)),
				WAIT_BOUND_MS,
			),
		)
		const exitCode = await Promise.race([exited, bound])
		return { exitCode, output }
	} finally {
		run.kill('SIGKILL')
	}
}

describe(
	'gate --fast with a closed standard error',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it('a warning fires and the standard error pipe is closed → the exit of a writable file, the standard output one whole JSON document', async () => {
			const reference = await gateOf({ blocked: false, closedStderr: false })
			const closed = await gateOf({ blocked: true, closedStderr: true })

			expect({
				sameExit: closed.exitCode === reference.exitCode,
				exitCode: closed.exitCode,
				json: ((text) => {
					try {
						return Object.keys(JSON.parse(text)).sort()
					} catch {
						return 'not JSON'
					}
				})(closed.output),
			}).toEqual({
				sameExit: true,
				exitCode: 0,
				json: ((text) => Object.keys(JSON.parse(text)).sort())(reference.output),
			})
		})
	},
)
