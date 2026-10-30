import { createFakeClock } from '../../../test/fake-clock.ts'
import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { runChild } from './run-child.ts'
import { streamCommand } from './stream-command.ts'

import { describe, expect, it, vi } from 'vitest'

vi.mock('./run-child.ts', () => ({ runChild: vi.fn() }))

describe('streamCommand hands over to runChild', () => {
	it('no watchdog given → runChild is called without a stallAfter override and its stalled result comes back', async () => {
		const clock = createFakeClock()
		vi.mocked(runChild).mockResolvedValue({
			exitCode: undefined,
			output: '',
			stalled: {
				processes: [
					{ pid: 424242, state: 'R', cpuMilliseconds: 120_000, command: 'node server.js' },
				],
				report: '  424242 R 2 m 0 s node server.js',
			},
		})

		await expect(
			streamCommand({
				command: 'true',
				args: [],
				cwd: temporaryFolder('dialecte-stream-'),
				prefix: '',
				heartbeatLabel: '',
				write: () => undefined,
				clock,
				every: 30_000,
			}),
		).resolves.toMatchObject({ stalled: { report: expect.stringContaining('node server.js') } })

		expect(runChild).toHaveBeenCalledTimes(1)
		expect(vi.mocked(runChild).mock.calls[0]?.[0].watchdog).toBeUndefined()
		expect(vi.mocked(runChild).mock.calls[0]?.[0].clock).toBe(clock)
	})
})
