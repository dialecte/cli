import { PACKAGE_NAME } from '../../../test/mutation-package.constants.ts'
import { SCRATCH_REPOSITORY_TIMEOUT } from '../../../test/scratch-checks.constants.ts'
import { createScratchRepository } from '../../../test/scratch-repository.ts'
import { pendingOf } from './ledger.ts'
import { abandonRun, readRuns, startRun } from './run-store.ts'

import { describe, expect, it } from 'vitest'

const TREE = 'e'.repeat(40)
const OWNER_START = 'Mon Nov  2 10:00:00 2026'
const OTHER_START = 'Mon Nov  2 11:30:00 2026'

function repository(): string {
	return createScratchRepository({ 'package.json': `${JSON.stringify({ name: PACKAGE_NAME })}\n` })
}

/** A run whose owner, the live process `process.pid`, started at OWNER_START. */
function ownedRun(root: string): string {
	return startRun({
		root,
		pid: process.pid,
		lot: 'lot-owned',
		tree: TREE,
		mode: 'changed',
		startTimeOf: () => OWNER_START,
	}).runId
}

describe(
	'a run whose pid now belongs to another process',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it('the live process holding the pid started at another time → died', () => {
			const root = repository()
			const runId = ownedRun(root)

			expect(readRuns({ root, startTimeOf: () => OTHER_START })).toEqual([
				expect.objectContaining({ runId, state: 'died' }),
			])
		})

		it('→ listed as died by pendingOf, not as running', () => {
			const root = repository()
			ownedRun(root)

			expect(pendingOf({ root, startTimeOf: () => OTHER_START })).toMatchObject({
				died: [expect.objectContaining({ lot: 'lot-owned' })],
				running: [],
			})
		})

		it('→ abandon accepts it', () => {
			const root = repository()
			const runId = ownedRun(root)

			expect(abandonRun({ root, runId, startTimeOf: () => OTHER_START })).toEqual({ ok: true })
		})
	},
)
