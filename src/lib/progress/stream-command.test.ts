import { createFakeClock } from '../../../test/fake-clock.ts'
import { createFakeTree } from '../../../test/fake-process-tree.ts'
import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { streamCommand } from './stream-command.ts'

import { describe, expect, it } from 'vitest'

describe('streamCommand', { timeout: 20_000 }, () => {
	it('a command printing on both streams then exiting 3 → every line behind the prefix, exit 3', async () => {
		const lines: string[] = []

		const result = await streamCommand({
			command: 'sh',
			args: ['-c', 'echo one; echo two >&2; printf three; exit 3'],
			cwd: temporaryFolder('dialecte-stream-'),
			prefix: '  │ ',
			heartbeatLabel: '  … hook running',
			write: (line) => lines.push(line),
			clock: createFakeClock(),
			every: 30_000,
		})

		expect(result.exitCode).toBe(3)
		expect(lines.sort()).toEqual(['  │ one', '  │ three', '  │ two'])
	})

	it('a command reading its input → it gets the given text, never a terminal', async () => {
		const lines: string[] = []

		await streamCommand({
			command: 'sh',
			args: ['-c', 'read value; echo "got $value"; [ -t 0 ] && echo terminal || echo no-terminal'],
			cwd: temporaryFolder('dialecte-stream-'),
			input: 'message\n',
			prefix: '',
			heartbeatLabel: '',
			write: (line) => lines.push(line),
			clock: createFakeClock(),
			every: 30_000,
		})

		expect(lines).toEqual(['got message', 'no-terminal'])
	})

	it('a child silent for 95 s of the clock → a heartbeat at 30 s, 1 m and 1 m 30 s, the third with a hint', async () => {
		const clock = createFakeClock()
		const lines: string[] = []

		const running = streamCommand({
			command: 'sleep',
			args: ['1'],
			cwd: temporaryFolder('dialecte-stream-'),
			prefix: '  │ ',
			heartbeatLabel: '  … hook running',
			write: (line) => lines.push(line),
			clock,
			every: 30_000,
		})
		clock.advance(95_000)
		await running

		expect(lines).toEqual([
			'  … hook running 30 s',
			'  … hook running 1 m 0 s',
			'  … hook running 1 m 30 s - silent since it started: is it waiting for input, or running in watch mode (vitest without `run`)?',
		])
	})

	it('a hook command silent with no CPU gained for stallAfter → stalled with its tree, then the heartbeat and the sampler stop', async () => {
		const clock = createFakeClock()
		const tree = createFakeTree()
		const lines: string[] = []

		const assertion = expect(
			streamCommand({
				command: 'sleep',
				args: ['2'],
				cwd: temporaryFolder('dialecte-stream-'),
				prefix: '  │ ',
				heartbeatLabel: '  … hook running',
				write: (line) => lines.push(line),
				clock,
				every: 30_000,
				watchdog: { stallAfter: 60_000, checkEvery: 10_000, ...tree },
			}),
		).resolves.toMatchObject({
			stalled: { report: expect.stringContaining('node server.js') },
		})
		await clock.whenPending(2)
		clock.advance(70_000)
		await assertion
		const sampled = tree.samples()
		const printed = lines.length
		clock.advance(200_000)

		expect(tree.killed).toHaveLength(1)
		expect(tree.samples()).toBe(sampled)
		expect(lines).toHaveLength(printed)
		expect(clock.pending()).toBe(0)
	})
})
