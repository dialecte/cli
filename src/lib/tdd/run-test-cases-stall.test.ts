import { chmodSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { createFakeClock } from '../../../test/fake-clock.ts'
import { createFakeTree } from '../../../test/fake-process-tree.ts'
import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { runTestCases } from './run-test-cases.ts'

import { describe, expect, it } from 'vitest'

/** A package whose `vitest` is a script that just sleeps. */
function packageWithHangingVitest(seconds: number): string {
	const root = temporaryFolder('dialecte-tdd-stall-')
	writeFileSync(join(root, 'package.json'), '{"name":"demo"}\n')
	mkdirSync(join(root, 'node_modules', '.bin'), { recursive: true })
	const fakeVitest = join(root, 'node_modules', '.bin', 'vitest')
	writeFileSync(fakeVitest, `#!/bin/sh\nsleep ${seconds}\n`)
	chmodSync(fakeVitest, 0o755)
	return root
}

describe('runTestCases stall', { timeout: 20_000 }, () => {
	it('a vitest run silent with no CPU gained for stallAfter → a failure saying stalled with the tree, not a wait for ever', async () => {
		const clock = createFakeClock()
		const tree = createFakeTree()

		const assertion = expect(
			runTestCases({
				root: packageWithHangingVitest(2),
				files: ['demo.test.ts'],
				filter: 'all',
				clock,
				watchdog: { stallAfter: 60_000, checkEvery: 10_000, ...tree },
			}),
		).resolves.toMatchObject({
			failure: expect.stringMatching(/stalled[\s\S]*node server\.js/),
		})
		await clock.whenPending(1)
		clock.advance(70_000)
		await assertion

		expect(tree.killed).toHaveLength(1)
	})
})
