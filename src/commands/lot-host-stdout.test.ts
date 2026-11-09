/**
 * The streams of the host verbs through the cli process (R1-1): every answer exit of `wait`, `result`, `status`,
 * `answer` and `stop` (0, 1, 3, 4, 5) prints its output on standard output with standard error empty; only a usage
 * or refusal exit 2 goes to standard error.
 */
import { runCliSplit } from '../../test/lot-handover-workspace.ts'
import { createStartWorkspace } from '../../test/lot-start-workspace.ts'
import { CLI_SURFACE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { CliRun } from '../../test/lot-handover-workspace.types.ts'
import type { StartWorkspace } from '../../test/lot-start-workspace.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** The exit code, whether standard error is empty, and the standard output read as JSON (undefined when it is not). */
function streamsOf(run: CliRun): { exitCode: number | null; stderrEmpty: boolean; json: unknown } {
	let json: unknown
	try {
		json = JSON.parse(run.stdout)
	} catch {
		json = undefined
	}
	return { exitCode: run.exitCode, stderrEmpty: run.stderr === '', json }
}

/** A simulated lot of `scenario` started through the cli; its workspace and name. */
function startedThroughCli(scenario: string): { start: StartWorkspace; name: string } {
	const start = createStartWorkspace()
	const started = runCliSplit({
		argv: ['lot', 'start', start.workspace.briefPath, '--simulate', scenario, '--json'],
		cwd: start.cwd,
	})
	return { start, name: (JSON.parse(started.stdout) as { lot: string }).lot }
}

describe(
	'the host verbs: standard output and standard error',
	{ timeout: CLI_SURFACE_CASE_TIMEOUT },
	() => {
		it('a question lot: wait --json exits 3 with the status on stdout and stderr empty; a usage error still exits 2 on stderr', () => {
			const { start, name } = startedThroughCli('question')

			expect({
				wait: streamsOf(
					runCliSplit({ argv: ['lot', 'wait', name, '--json'], cwd: start.repository }),
				),
				usage: (function usageRun() {
					const run = runCliSplit({ argv: ['lot', 'wait'], cwd: start.repository })
					return { exitCode: run.exitCode, stdout: run.stdout, stderrHolds: run.stderr !== '' }
				})(),
			}).toMatchObject({
				wait: { exitCode: 3, stderrEmpty: true, json: { lot: name, state: 'input-required' } },
				usage: { exitCode: 2, stdout: '', stderrHolds: true },
			})
		})

		it('the same lot: result --json exits 3 with the open questions on stdout, stderr empty', () => {
			const { start, name } = startedThroughCli('question')
			runCliSplit({ argv: ['lot', 'wait', name, '--json'], cwd: start.repository })

			expect(
				streamsOf(runCliSplit({ argv: ['lot', 'result', name, '--json'], cwd: start.repository })),
			).toMatchObject({
				exitCode: 3,
				stderrEmpty: true,
				json: { state: 'input-required', questions: [{ id: 'q1' }] },
			})
		})

		it('a slow lot: wait --timeout 1 --json exits 5 with the status on stdout, stderr empty', () => {
			const { start, name } = startedThroughCli('slow')

			expect(
				streamsOf(
					runCliSplit({
						argv: ['lot', 'wait', name, '--timeout', '1', '--json'],
						cwd: start.repository,
					}),
				),
			).toMatchObject({ exitCode: 5, stderrEmpty: true, json: { lot: name, state: 'working' } })
		})

		it('a failure lot: wait --json exits 1 and status --json exits 0, both on stdout with stderr empty', () => {
			const { start, name } = startedThroughCli('failure')

			expect({
				wait: streamsOf(
					runCliSplit({ argv: ['lot', 'wait', name, '--json'], cwd: start.repository }),
				),
				status: streamsOf(
					runCliSplit({ argv: ['lot', 'status', name, '--json'], cwd: start.repository }),
				),
			}).toMatchObject({
				wait: { exitCode: 1, stderrEmpty: true, json: { state: 'failed' } },
				status: { exitCode: 0, stderrEmpty: true, json: { state: 'failed' } },
			})
		})
	},
)
