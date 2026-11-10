/**
 * A rehearsal killed after its start (33L0 section 4 "Interrupted steps", D10): the rehearsal's own signal handler
 * writes `step.end` with `outcome: "interrupted"` before the process exits, and its marker is gone. The rehearsal
 * runs as a child process of the test (the cli's own source), from the worktree of another lot, its hook a shell
 * sleeping until the signal.
 */
import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

import { SCRATCH_REPOSITORY_TIMEOUT } from '../../test/scratch-checks.constants.ts'
import { temporaryFolder } from '../../test/scratch-repository.ts'
import {
	HANDOVER_CLI_SOURCE,
	HANDOVER_WAIT_BOUND_MS,
} from '../../test/step-events-handover.constants.ts'
import { createHandoverLot } from '../../test/step-events-handover.ts'
import { eventsOfStep, markerFilesIn, seenFile, stepEventsOf } from '../../test/step-events-lot.ts'
import { isProcessAlive } from '../lib/process-alive.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ChildProcess } from 'node:child_process'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** Waits until `check` holds; with a `child`, fails at once when it has exited meanwhile; fails at the bound. */
async function waitFor(params: {
	check: () => boolean
	bound: number
	child?: ChildProcess
}): Promise<void> {
	const deadline = Date.now() + params.bound
	while (!params.check()) {
		if (params.child && (params.child.exitCode !== null || params.child.signalCode !== null))
			throw new Error('the child exited before the point the case waits for')
		if (Date.now() > deadline) throw new Error(`still waiting after ${params.bound} ms`)
		await new Promise((resolveWait) => setTimeout(resolveWait, 100))
	}
}

/** The pid the hook wrote, once the file holds a whole number. */
function pidIn(file: string): number | undefined {
	if (!existsSync(file)) return undefined
	const text = readFileSync(file, 'utf8').trim()
	return /^\d+$/.test(text) ? Number(text) : undefined
}

describe(
	'handover run --rehearse killed after its start',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		for (const signal of ['SIGINT', 'SIGTERM'] as const)
			it(`${signal} while the hook runs in the clone → the end says interrupted with no exit but a duration, no parts, reuse none, no state hash, written before the process exits, the marker is gone`, async () => {
				const pidFile = seenFile()
				const lot = createHandoverLot({
					hookScript: `sleep 600 & echo $! > '${pidFile}'; wait`,
				})
				// the child's own temporary folder: the hook log an interrupted run leaves goes with it
				const childTemporary = temporaryFolder('dialecte-child-tmp-')
				const run = spawn(
					process.execPath,
					[HANDOVER_CLI_SOURCE, 'handover', 'run', lot.folder, '--rehearse'],
					{
						cwd: lot.bystander.worktree,
						env: { ...process.env, TMPDIR: childTemporary },
						stdio: 'ignore',
					},
				)
				let sleeperPid: number | undefined
				try {
					await waitFor({
						check: () => pidIn(pidFile) !== undefined,
						bound: HANDOVER_WAIT_BOUND_MS,
						child: run,
					})
					sleeperPid = pidIn(pidFile)
					run.kill(signal)
					await waitFor({
						check: () => run.exitCode !== null || run.signalCode !== null,
						bound: HANDOVER_WAIT_BOUND_MS,
					})
					const events = eventsOfStep({ lot, step: 'rehearsal' })

					expect({
						exited: run.exitCode !== 0,
						kinds: events.map((event) => event.kind),
						outcome: events[1]?.outcome,
						hasExit: 'exit' in (events[1] ?? {}),
						duration: typeof events[1]?.durationMs,
						heavy: events[1]?.heavy,
						parts: events[1]?.parts ?? [],
						reuse: events[1]?.reuse,
						stateHash: events[1]?.stateHash,
						pairedRun: events[0]?.run === events[1]?.run && events[0]?.run !== undefined,
						markers: markerFilesIn(lot.markerFolder),
						bystander: stepEventsOf({ eventsFile: lot.bystander.eventsFile }),
					}).toEqual({
						exited: true,
						kinds: ['step.start', 'step.end'],
						outcome: 'interrupted',
						hasExit: false,
						duration: 'number',
						heavy: true,
						parts: [],
						reuse: 'none',
						stateHash: null,
						pairedRun: true,
						markers: [],
						bystander: [],
					})
				} finally {
					run.kill('SIGKILL')
					if (sleeperPid !== undefined && isProcessAlive(sleeperPid))
						process.kill(sleeperPid, 'SIGKILL')
				}
			})
	},
)
