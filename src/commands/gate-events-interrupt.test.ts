/**
 * A gate killed after its start (33L0 section 4 "Interrupted steps", case 79): by SIGINT or SIGTERM its `step.end`
 * says `outcome: "interrupted"` with no exit and its heavy marker is gone; by SIGKILL it leaves a start and no end.
 * The gate runs as a child process of the test (the cli's own source), its step a shell sleeping until the signal.
 */
import { spawn } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { SCRATCH_REPOSITORY_TIMEOUT } from '../../test/scratch-checks.constants.ts'
import { temporaryFolder } from '../../test/scratch-repository.ts'
import { createStepLot, markerFilesIn, seenFile, stepEventsOf } from '../../test/step-events-lot.ts'
import { GATE_SCOPE_FOLDER_PREFIX } from '../lib/gate/selection.constants.ts'
import { isProcessAlive } from '../lib/process-alive.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

const CLI_SOURCE = join(import.meta.dirname, '..', 'cli.ts')

/**
 * What the case keeps of its timeout for its cleanup. Its waits share the rest: a wider bound than the 60 s each wait
 * had (the case's timeout less this margin), still a guard against a hang, never a measure of speed - a gate that
 * starts its step late on a loaded runner gets far more time before the case fails.
 */
const CLEANUP_MARGIN_MS = 30_000

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/**
 * Waits until `check` holds; past `deadline`, fails with the time waited since `startedAt` and the kinds of the step
 * events `seen` answers, so a repeat on a loaded runner says how far the gate got.
 */
async function waitFor(params: {
	check: () => boolean
	deadline: number
	startedAt: number
	seen: () => string[]
}): Promise<void> {
	while (!params.check()) {
		if (Date.now() > params.deadline)
			throw new Error(
				`still waiting after ${Date.now() - params.startedAt} ms; step events seen: ${JSON.stringify(params.seen())}`,
			)
		await new Promise((resolveWait) => setTimeout(resolveWait, 100))
	}
}

/** The pid the step wrote, once the file holds a whole number. */
function pidIn(file: string): number | undefined {
	if (!existsSync(file)) return undefined
	const text = readFileSync(file, 'utf8').trim()
	return /^\d+$/.test(text) ? Number(text) : undefined
}

/**
 * Runs `gate --full` of a lot whose step sleeps (`scoped`: the step is a scoped one), its temporary folder `tmp`,
 * sends `signal` to the cli once the step runs, waits for the end, and answers what the lot's file and marker folder
 * hold. Whatever happens, the cli and the step's child are killed.
 */
async function interruptedGate(params: {
	signal: NodeJS.Signals
	scoped?: boolean
	tmp?: string
	/** What must hold before the signal is sent, beside the step running. */
	ready?: () => boolean
}) {
	const { signal } = params
	const startedAt = Date.now()
	const deadline = startedAt + SCRATCH_REPOSITORY_TIMEOUT - CLEANUP_MARGIN_MS
	const pidFile = seenFile()
	const lot = createStepLot({
		full: [
			{
				name: 'hang',
				run: `sleep 60 & echo $! > '${pidFile}'; wait`,
				...(params.scoped && { scoped: true }),
			},
		],
	})
	const run = spawn(process.execPath, [CLI_SOURCE, 'gate', '--full'], {
		cwd: lot.worktree,
		env: params.tmp === undefined ? process.env : { ...process.env, TMPDIR: params.tmp },
		stdio: 'ignore',
	})
	let childPid: number | undefined
	function seen(): string[] {
		return stepEventsOf(lot).map((event) => event.kind)
	}
	try {
		const exited = new Promise<number | null>((resolveExit) => run.on('exit', resolveExit))
		await waitFor({
			check: () => pidIn(pidFile) !== undefined && (params.ready?.() ?? true),
			deadline,
			startedAt,
			seen,
		})
		childPid = pidIn(pidFile)
		run.kill(signal)
		const exitCode = await exited
		if (childPid !== undefined) {
			const pid = childPid
			await waitFor({
				check: () => !isProcessAlive(pid) || signal === 'SIGKILL',
				deadline,
				startedAt,
				seen,
			})
		}
		return { exitCode, lot, events: stepEventsOf(lot), markers: markerFilesIn(lot.markerFolder) }
	} finally {
		run.kill('SIGKILL')
		if (childPid !== undefined && isProcessAlive(childPid)) process.kill(childPid, 'SIGKILL')
	}
}

describe('gate --full killed after its start', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	for (const signal of ['SIGINT', 'SIGTERM'] as const)
		it(`${signal} while a step runs → the end says interrupted with no exit but a duration, the marker is gone`, async () => {
			const { exitCode, events, markers } = await interruptedGate({ signal })

			expect({
				nonZero: exitCode !== 0,
				kinds: events.map((event) => event.kind),
				outcome: events[1]?.outcome,
				hasExit: 'exit' in (events[1] ?? {}),
				duration: typeof events[1]?.durationMs,
				heavy: events[1]?.heavy,
				pairedRun: events[0]?.run === events[1]?.run,
				markers,
			}).toEqual({
				nonZero: true,
				kinds: ['step.start', 'step.end'],
				outcome: 'interrupted',
				hasExit: false,
				duration: 'number',
				heavy: true,
				pairedRun: true,
				markers: [],
			})
		})

	it('SIGKILL while a step runs → a start and no end (nothing could write one)', async () => {
		const { events } = await interruptedGate({ signal: 'SIGKILL' })

		expect(events.map((event) => event.kind)).toEqual(['step.start'])
	})

	it('SIGTERM while a scoped step runs → the gate-scope folder the run made is removed', async () => {
		const tmp = temporaryFolder('dialecte-gate-tmp-')
		function scopeFolders(): string[] {
			return readdirSync(tmp).filter((name) => name.startsWith(GATE_SCOPE_FOLDER_PREFIX))
		}
		let made = 0

		await interruptedGate({
			signal: 'SIGTERM',
			scoped: true,
			tmp,
			ready: function scopeFolderMade() {
				made = scopeFolders().length
				return made > 0
			},
		})

		expect({ made, left: scopeFolders() }).toEqual({ made: 1, left: [] })
	})
})
