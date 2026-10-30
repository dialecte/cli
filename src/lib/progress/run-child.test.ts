import { createFakeClock } from '../../../test/fake-clock.ts'
import { createFakeTree } from '../../../test/fake-process-tree.ts'
import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { runChild } from './run-child.ts'
import { createSystemClock } from './system-clock.ts'

import { describe, expect, it } from 'vitest'

function isAlive(pid: number): boolean {
	try {
		process.kill(pid, 0)
		return true
	} catch {
		return false
	}
}

const WATCHED = { stallAfter: 60_000, checkEvery: 10_000 }

describe('runChild', { timeout: 20_000 }, () => {
	it('a child that reads stdin → gets end-of-file at once and exits', async () => {
		const clock = createFakeClock()
		const tree = createFakeTree()

		await expect(
			runChild({
				command: 'cat',
				args: [],
				cwd: temporaryFolder('dialecte-child-'),
				clock,
				watchdog: { ...WATCHED, ...tree },
			}),
		).resolves.toEqual({ exitCode: 0, output: '' })
	})

	it('a child silent with no CPU gained for stallAfter → stalled, the tree listed with pid, state, cpu and command, every process killed', async () => {
		const clock = createFakeClock()
		const tree = createFakeTree()

		const assertion = expect(
			runChild({
				command: 'sleep',
				args: ['5'],
				cwd: temporaryFolder('dialecte-child-'),
				clock,
				watchdog: { ...WATCHED, ...tree },
			}),
		).resolves.toMatchObject({
			exitCode: undefined,
			stalled: {
				processes: expect.arrayContaining([expect.objectContaining({ pid: 424242 })]),
				report: expect.stringMatching(/424242.*\bR\b.*2 m 0 s.*node server\.js/),
			},
		})
		await clock.whenPending(1)
		clock.advance(70_000)
		await assertion

		expect(tree.killed).toHaveLength(1)
		expect(tree.killed[0]).toContain(424242)
	})

	it('a child silent but gaining CPU → not stalled, runs to its end', async () => {
		const clock = createFakeClock()
		const tree = createFakeTree()
		let cpu = 0
		tree.setCpu(() => (cpu += 1_000))

		const assertion = expect(
			runChild({
				command: 'sleep',
				args: ['1'],
				cwd: temporaryFolder('dialecte-child-'),
				clock,
				watchdog: { ...WATCHED, ...tree },
			}),
		).resolves.toEqual({ exitCode: 0, output: '' })
		await clock.whenPending(1)
		clock.advance(600_000)
		await assertion

		expect(tree.killed).toEqual([])
	})

	it.each([
		['stdout', 'echo one; sleep 1; echo two; sleep 2', 'one\ntwo\n'],
		['stderr', 'echo one >&2; sleep 1; echo two >&2; sleep 2', 'one\ntwo\n'],
	])(
		'%s output during the wait → the silence restarts from the last output',
		async (_stream, script, output) => {
			const clock = createFakeClock()
			const tree = createFakeTree()
			const waiters: Record<string, () => void> = {}
			const seen = new Map<string, Promise<void>>()
			for (const line of ['one', 'two'])
				seen.set(line, new Promise<void>((resolve) => (waiters[line] = resolve)))

			const assertion = expect(
				runChild({
					command: 'sh',
					args: ['-c', script],
					cwd: temporaryFolder('dialecte-child-'),
					onLine: (line) => waiters[line]?.(),
					clock,
					watchdog: { ...WATCHED, ...tree },
				}),
			).resolves.toEqual({ exitCode: 0, output })
			await seen.get('one')
			clock.advance(50_000)
			await seen.get('two')
			clock.advance(50_000)
			await assertion

			expect(tree.killed).toEqual([])
		},
	)

	it('a watched child exiting 3 → its exit code, no stalled', async () => {
		const clock = createFakeClock()
		const tree = createFakeTree()

		await expect(
			runChild({
				command: 'sh',
				args: ['-c', 'echo bad; exit 3'],
				cwd: temporaryFolder('dialecte-child-'),
				clock,
				watchdog: { ...WATCHED, ...tree },
			}),
		).resolves.toEqual({ exitCode: 3, output: 'bad\n' })
	})

	it('the child has exited → the watchdog is stopped: 2x stallAfter later nothing is killed and the tree is not sampled again', async () => {
		const clock = createFakeClock()
		const tree = createFakeTree()

		await expect(
			runChild({
				command: 'true',
				args: [],
				cwd: temporaryFolder('dialecte-child-'),
				clock,
				watchdog: { ...WATCHED, ...tree },
			}),
		).resolves.toMatchObject({ exitCode: 0 })
		const sampled = tree.samples()
		clock.advance(120_000)

		expect(tree.samples()).toBe(sampled)
		expect(tree.killed).toEqual([])
		expect(clock.pending()).toBe(0)
	})

	it('no stallAfter given → 9 m 59 s of silence is not stalled, 10 m is', async () => {
		const clock = createFakeClock()
		const tree = createFakeTree()

		const assertion = expect(
			runChild({
				command: 'sleep',
				args: ['5'],
				cwd: temporaryFolder('dialecte-child-'),
				clock,
				watchdog: { sampleTree: tree.sampleTree, kill: tree.kill },
			}),
		).resolves.toMatchObject({ stalled: { report: expect.stringContaining('node server.js') } })
		await clock.whenPending(1)
		clock.advance(599_000)
		expect(tree.killed).toEqual([])
		clock.advance(1_000)
		await assertion

		expect(tree.killed).toHaveLength(1)
	})

	it('no checkEvery given → the tree is sampled every 5 s', async () => {
		const clock = createFakeClock()
		const tree = createFakeTree()
		let cpu = 0
		tree.setCpu(() => (cpu += 1_000))

		const assertion = expect(
			runChild({
				command: 'sleep',
				args: ['1'],
				cwd: temporaryFolder('dialecte-child-'),
				clock,
				watchdog: { sampleTree: tree.sampleTree, kill: tree.kill },
			}),
		).resolves.toMatchObject({ exitCode: 0 })
		await clock.whenPending(1)
		clock.advance(60_000)
		await assertion

		expect(tree.samples()).toBeGreaterThanOrEqual(12)
		expect(tree.samples()).toBeLessThanOrEqual(13)
	})

	it('no watchdog given → the default watches with the real tools: 20 m of the clock (2x the default) stalls and kills the real child', async () => {
		const clock = createFakeClock()
		let pids: number[] = []

		const assertion = expect(
			runChild({ command: 'sleep', args: ['5'], cwd: temporaryFolder('dialecte-child-'), clock }),
		).resolves.toMatchObject({
			stalled: {
				processes: expect.toSatisfy(function remember(processes: { pid: number }[]) {
					pids = processes.map((sample) => sample.pid)
					return pids.length >= 1
				}),
			},
		})
		await clock.whenPending(1)
		clock.advance(1_200_000)
		await assertion
		await new Promise((resolve) => setTimeout(resolve, 300))

		expect(pids.filter(isAlive)).toEqual([])
	}, 60_000)

	it('a real `sh -c` child running sleep (a tree) with a tiny stallAfter → stalled within seconds, the sleep process and the shell gone', async () => {
		const startedAt = Date.now()
		let pids: number[] = []
		let sleepPid = 0

		await expect(
			runChild({
				command: 'sh',
				args: ['-c', 'sleep 30; true'],
				cwd: temporaryFolder('dialecte-child-'),
				clock: createSystemClock(),
				watchdog: { stallAfter: 500, checkEvery: 100 },
			}),
		).resolves.toMatchObject({
			stalled: {
				processes: expect.toSatisfy(function remember(
					processes: { pid: number; command: string }[],
				) {
					pids = processes.map((sample) => sample.pid)
					sleepPid = processes.find((sample) => sample.command.startsWith('sleep 30'))?.pid ?? 0
					return processes.length >= 2 && sleepPid !== 0
				}),
			},
		})

		expect(Date.now() - startedAt).toBeLessThan(10_000)
		await new Promise((resolve) => setTimeout(resolve, 300))
		expect(isAlive(sleepPid)).toBe(false)
		expect(pids.filter(isAlive)).toEqual([])
	})
})
