import { chmodSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { createFakeClock } from '../../../test/fake-clock.ts'
import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { runChild } from '../progress/run-child.ts'
import { runTestCases } from './run-test-cases.ts'

import { describe, expect, it, vi } from 'vitest'

vi.mock('../progress/run-child.ts', () => ({ runChild: vi.fn() }))

describe('runTestCases hands over to runChild', () => {
	it('no watchdog given → runChild is called without a stallAfter override; its stalled result is a stalled failure with the tree', async () => {
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
		const root = temporaryFolder('dialecte-tdd-stall-')
		writeFileSync(join(root, 'package.json'), '{"name":"demo"}\n')
		mkdirSync(join(root, 'node_modules', '.bin'), { recursive: true })
		const fakeVitest = join(root, 'node_modules', '.bin', 'vitest')
		writeFileSync(fakeVitest, '#!/bin/sh\ntrue\n')
		chmodSync(fakeVitest, 0o755)

		await expect(
			runTestCases({ root, files: ['demo.test.ts'], filter: 'all', clock }),
		).resolves.toMatchObject({ failure: expect.stringMatching(/stalled[\s\S]*node server\.js/) })

		expect(runChild).toHaveBeenCalledTimes(1)
		expect(vi.mocked(runChild).mock.calls[0]?.[0].watchdog).toBeUndefined()
		expect(vi.mocked(runChild).mock.calls[0]?.[0].clock).toBe(clock)
	})
})
