/**
 * `gate --fast --no-reuse` records the deliberate re-run on its `step.end`: `noReuse: true`; the first run, given no
 * flag, carries none. One scratch repository with a lot store (slow, one case). No fixture file: the lot is built by
 * test/step-events-lot.ts.
 */
import { SCRATCH_REPOSITORY_TIMEOUT } from '../../test/scratch-checks.constants.ts'
import { createStepLot, eventsOfStep } from '../../test/step-events-lot.ts'
import { runGate } from './gate.ts'

import { describe, expect, it } from 'vitest'

describe('gate --no-reuse', () => {
	it(
		'gate --fast then gate --fast --no-reuse → the second step.end holds noReuse: true, the first none',
		{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
		async () => {
			const lot = createStepLot({ fast: [{ name: 'one', run: 'echo one' }] })

			await runGate({ cwd: lot.worktree, argv: [] })
			await runGate({ cwd: lot.worktree, argv: ['--no-reuse'] })
			const ends = eventsOfStep({ lot, step: 'gate-fast' }).filter(
				(event) => event.kind === 'step.end',
			)

			expect(ends.map((end) => end.noReuse)).toEqual([undefined, true])
		},
	)
})
