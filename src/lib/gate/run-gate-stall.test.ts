import { createFakeClock } from '../../../test/fake-clock.ts'
import { createFakeTree } from '../../../test/fake-process-tree.ts'
import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { runGateSteps } from './run-gate.ts'

import { describe, expect, it } from 'vitest'

describe('runGateSteps stall', { timeout: 20_000 }, () => {
	it('a step silent with no CPU gained for stallAfter → failed as stalled with the duration and the tree, the next step not run', async () => {
		const clock = createFakeClock()
		const tree = createFakeTree()

		const assertion = expect(
			runGateSteps({
				root: temporaryFolder('dialecte-gate-stall-'),
				steps: [
					{ name: 'hang', run: 'sleep 2' },
					{ name: 'after', run: 'true' },
				],
				packageJson: {},
				clock,
				watchdog: { stallAfter: 60_000, checkEvery: 10_000, ...tree },
			}),
		).resolves.toMatchObject([
			{
				status: 'failed',
				reason: expect.stringMatching(/^stalled: no output, no CPU for 1 m/),
				tail: expect.stringContaining('node server.js'),
			},
			{ status: 'not-run' },
		])
		await clock.whenPending(1)
		clock.advance(70_000)
		await assertion

		expect(tree.killed).toHaveLength(1)
	})
})
