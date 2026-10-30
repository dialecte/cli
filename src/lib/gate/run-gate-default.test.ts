import { createFakeClock } from '../../../test/fake-clock.ts'
import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { runChild } from '../progress/run-child.ts'
import { runGateSteps } from './run-gate.ts'

import { describe, expect, it, vi } from 'vitest'

vi.mock('../progress/run-child.ts', () => ({ runChild: vi.fn() }))

describe('runGateSteps hands over to runChild', () => {
	it('no watchdog given → runChild is called without a stallAfter override; its stalled result fails the step as stalled with the tree', async () => {
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
			runGateSteps({
				root: temporaryFolder('dialecte-gate-stall-'),
				steps: [{ name: 'hang', run: 'true' }],
				packageJson: {},
				clock,
			}),
		).resolves.toMatchObject([
			{
				status: 'failed',
				reason: expect.stringMatching(/^stalled/),
				tail: expect.stringContaining('node server.js'),
			},
		])

		expect(runChild).toHaveBeenCalledTimes(1)
		expect(vi.mocked(runChild).mock.calls[0]?.[0].watchdog).toBeUndefined()
		expect(vi.mocked(runChild).mock.calls[0]?.[0].clock).toBe(clock)
	})
})
