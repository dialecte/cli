/**
 * The host verbs through the cli process, as a shell runs them (33S sections 6 and 7): `dialecte inbox --json` over an
 * empty state, and `lot start --simulate ready` then `lot wait --timeout 60` with the system clock (the ready
 * scenario's steps are due at once, so no waiting is needed).
 */
import { isolateStateFolder, runCliSplit } from '../../test/lot-handover-workspace.ts'
import { createStartWorkspace } from '../../test/lot-start-workspace.ts'
import { temporaryFolder } from '../../test/scratch-repository.ts'
import { CLI_SURFACE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { CliRun } from '../../test/lot-handover-workspace.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** A run's exit code and its output (standard output then standard error) read as JSON; undefined when it is not. */
function jsonOf(run: CliRun): { exitCode: number | null; json: unknown } {
	try {
		return { exitCode: run.exitCode, json: JSON.parse(run.output) }
	} catch {
		return { exitCode: run.exitCode, json: undefined }
	}
}

describe('the host verbs through the cli', { timeout: CLI_SURFACE_CASE_TIMEOUT }, () => {
	it('dialecte inbox --json with no store anywhere -> exit 1, the empty JSON', () => {
		isolateStateFolder()

		expect(
			jsonOf(
				runCliSplit({ argv: ['inbox', '--json'], cwd: temporaryFolder('dialecte-inbox-cli-') }),
			),
		).toEqual({
			exitCode: 1,
			json: { waiting: [], working: 0, simulated: 0, damaged: [] },
		})
	})

	it('lot start --simulate ready --json, then lot wait <name> --timeout 60 --json -> exit 0 both times, the lot ready', () => {
		const start = createStartWorkspace()
		const started = jsonOf(
			runCliSplit({
				argv: ['lot', 'start', start.workspace.briefPath, '--simulate', 'ready', '--json'],
				cwd: start.cwd,
			}),
		)
		const name = (started.json as { lot?: string } | undefined)?.lot ?? ''

		expect(started).toMatchObject({ exitCode: 0, json: { runner: 'simulated' } })
		expect(
			jsonOf(
				runCliSplit({
					argv: ['lot', 'wait', name, '--timeout', '60', '--json'],
					cwd: start.repository,
				}),
			),
		).toMatchObject({ exitCode: 0, json: { lot: name, state: 'ready' } })
	})
})
