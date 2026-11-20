/** The base of the change reaches the type-bench step of a gate run alone: no other step reads it. */
import { createFakeClock } from '../../../test/fake-clock.ts'
import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { CHANGE_BASE_VARIABLES } from '../change-base.constants.ts'
import { runChild } from '../progress/run-child.ts'
import { runGateSteps } from './run-gate.ts'

import { describe, expect, it, vi } from 'vitest'

vi.mock('../progress/run-child.ts', () => ({ runChild: vi.fn() }))

const CHANGE_BASE = 'c'.repeat(40)

describe('runGateSteps: the change base', () => {
	it('a change base → the type-bench step gets DIALECTE_CHANGE_BASE; another step does not, and has it unset', async () => {
		vi.mocked(runChild).mockResolvedValue({ exitCode: 0, output: '' })

		await expect(
			runGateSteps({
				root: temporaryFolder('dialecte-gate-change-base-'),
				steps: [
					{ name: 'type-bench', run: 'npm run type-bench:check' },
					{ name: 'docs', run: 'npm run doc:build' },
				],
				packageJson: { scripts: { 'type-bench:check': 'true', 'doc:build': 'true' } },
				clock: createFakeClock(),
				changeBase: CHANGE_BASE,
			}).then(function childrenOf() {
				return vi.mocked(runChild).mock.calls.map(([child]) => ({
					handed: child.environment?.[CHANGE_BASE_VARIABLES.handed],
					unset: child.unset?.includes(CHANGE_BASE_VARIABLES.handed) === true,
				}))
			}),
		).resolves.toEqual([
			{ handed: CHANGE_BASE, unset: false },
			{ handed: undefined, unset: true },
		])
	})
})
