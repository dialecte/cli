import { createFakeClock } from '../../../test/fake-clock.ts'
import { createFakeTree } from '../../../test/fake-process-tree.ts'
import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { isProcessAlive } from '../process-alive.ts'
import { sampleProcessTree } from './process-tree.ts'
import { runChild } from './run-child.ts'
import { streamCommand } from './stream-command.ts'
import { createSystemClock } from './system-clock.ts'

import { describe, expect, it } from 'vitest'

import type { ProcessSample } from './run-child.types.ts'

const REAL = { stallAfter: 500, checkEvery: 100, killGrace: 300 }
/** A pid no machine has: killing it is a no-op. */
const NO_SUCH_PID = 2_000_000_000

describe('runChild: a stalled run resolves once the tree is gone', { timeout: 60_000 }, () => {
	it.each([
		['a stopped child (state T, no CPU)', 'kill -STOP $$'],
		['a child trapping TERM', 'trap "" TERM; sleep 30'],
	])('%s → stalled, and every pid of the tree is dead when it resolves', async (_name, script) => {
		let pids: number[] = []

		const result = await runChild({
			command: 'sh',
			args: ['-c', script],
			cwd: temporaryFolder('dialecte-kill-'),
			clock: createSystemClock(),
			watchdog: REAL,
		})
		pids = result.stalled?.processes.map((sample) => sample.pid) ?? []

		expect(result.stalled).toBeDefined()
		expect(pids.length).toBeGreaterThanOrEqual(1)
		expect(pids.filter(isProcessAlive)).toEqual([])
	})

	it('the sampler missed the root → the root pid is killed all the same', async () => {
		let rootPid = 0
		const missed: ProcessSample[] = [
			{ pid: NO_SUCH_PID, state: 'S', cpuMilliseconds: 0, command: 'ghost' },
		]

		const result = await runChild({
			command: 'sleep',
			args: ['30'],
			cwd: temporaryFolder('dialecte-kill-'),
			clock: createSystemClock(),
			onProcessGroup: (pid) => (rootPid = pid),
			watchdog: { ...REAL, sampleTree: () => missed },
		})

		expect(result.stalled).toBeDefined()
		expect(rootPid).toBeGreaterThan(0)
		expect(isProcessAlive(rootPid)).toBe(false)
	})

	it('an orphaned grandchild keeping the output pipe open → watched and killed: it is dead after the stall resolves', async () => {
		let grandchild = 0

		const result = await runChild({
			command: 'sh',
			args: ['-c', 'sleep 30 & echo $!; exit 0'],
			cwd: temporaryFolder('dialecte-kill-'),
			clock: createSystemClock(),
			onLine: (line) => (grandchild = Number(line)),
			watchdog: REAL,
		})
		for (let attempt = 0; attempt < 20 && isProcessAlive(grandchild); attempt += 1)
			await new Promise((resolve) => setTimeout(resolve, 50))

		expect(result.stalled).toBeDefined()
		expect(grandchild).toBeGreaterThan(0)
		expect(isProcessAlive(grandchild)).toBe(false)
	})
})

describe('runChild: a sampler that fails', { timeout: 30_000 }, () => {
	it('flat CPU sampled at 10 s and 20 s, failed at 30 s to 50 s, flat again at 60 s → the failures neither restart the baseline nor count as a gain: stalled at 60 s', async () => {
		const clock = createFakeClock()
		const tree = createFakeTree()

		const assertion = expect(
			runChild({
				command: 'sleep',
				args: ['5'],
				cwd: temporaryFolder('dialecte-sampler-'),
				clock,
				watchdog: {
					stallAfter: 60_000,
					checkEvery: 10_000,
					kill: tree.kill,
					sampleTree: (params) =>
						clock.now() >= 30_000 && clock.now() < 60_000 ? undefined : tree.sampleTree(params),
				},
			}),
		).resolves.toMatchObject({ stalled: { processes: expect.any(Array) } })
		await clock.whenPending(1)
		clock.advance(60_000)
		await assertion

		expect(tree.killed).toHaveLength(1)
	})

	it('fails for the whole stallAfter → stalled, the report names the sampler failure, the root pid is killed', async () => {
		const clock = createFakeClock()
		const tree = createFakeTree()
		let rootPid = 0

		const assertion = expect(
			runChild({
				command: 'sleep',
				args: ['5'],
				cwd: temporaryFolder('dialecte-sampler-'),
				clock,
				watchdog: {
					stallAfter: 60_000,
					checkEvery: 10_000,
					kill: tree.kill,
					sampleTree: (params) => {
						rootPid = params.rootPid
						return undefined
					},
				},
			}),
		).resolves.toMatchObject({
			exitCode: undefined,
			stalled: { report: expect.stringMatching(/sampl/i) },
		})
		await clock.whenPending(1)
		clock.advance(70_000)
		await assertion

		expect(tree.killed).toEqual([[rootPid]])
	})

	it('a listing command that hangs → the sampler gives up with undefined in bounded time instead of hanging', () => {
		const startedAt = Date.now()

		expect(
			sampleProcessTree({
				rootPid: process.pid,
				lister: { command: 'sleep', args: ['20'], timeoutMilliseconds: 300 },
			}),
		).toBeUndefined()

		expect(Date.now() - startedAt).toBeLessThan(10_000)
	})
})

describe('output without a newline counts as output', { timeout: 30_000 }, () => {
	const PROGRESS = 'for i in $(seq 30); do printf "x\\r"; sleep 0.1; done; echo done'

	it('the same child through streamCommand with a 1.5 s heartbeat → no heartbeat line, no "silent since it started" hint', async () => {
		const lines: string[] = []

		await expect(
			streamCommand({
				command: 'sh',
				args: ['-c', PROGRESS],
				cwd: temporaryFolder('dialecte-progress-'),
				prefix: '',
				heartbeatLabel: '  … hook running',
				write: (line) => lines.push(line),
				clock: createSystemClock(),
				every: 1_500,
			}),
		).resolves.toMatchObject({ exitCode: 0 })

		expect(lines.filter((line) => /running|silent/.test(line))).toEqual([])
	})
})

describe('runChild with a kill that fails', { timeout: 10_000 }, () => {
	it('the injected kill rejects → it still settles as stalled, the kill error in the report, no unhandled rejection', async () => {
		const clock = createFakeClock()
		const tree = createFakeTree()
		const unhandled: unknown[] = []
		function collect(reason: unknown): void {
			unhandled.push(reason)
		}
		process.on('unhandledRejection', collect)
		let rootPid = 0

		const assertion = expect(
			runChild({
				command: 'sleep',
				args: ['5'],
				cwd: temporaryFolder('dialecte-kill-'),
				clock,
				onProcessGroup: (pid) => (rootPid = pid),
				watchdog: {
					stallAfter: 60_000,
					checkEvery: 10_000,
					sampleTree: tree.sampleTree,
					kill: () => Promise.reject(new Error('kill exploded')),
				},
			}),
		).resolves.toMatchObject({
			stalled: { report: expect.stringContaining('kill exploded') },
		})
		await clock.whenPending(1)
		clock.advance(70_000)
		try {
			await assertion
			await new Promise((resolve) => setTimeout(resolve, 100))
		} finally {
			process.off('unhandledRejection', collect)
			if (rootPid) process.kill(-rootPid, 'SIGKILL')
		}

		expect(unhandled).toEqual([])
	})
})
