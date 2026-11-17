/** The hand-over's own temporary folders are made under the scratch root. */
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { SCRATCH_REPOSITORY_TIMEOUT } from '../../../test/scratch-checks.constants.ts'
import { createScratchRepository, git, temporaryFolder } from '../../../test/scratch-repository.ts'
import { readLotDiff } from './review-diff.ts'

import { describe, expect, it, vi } from 'vitest'

/** Whether the scratch root (missing before) exists once the lot's diff of a repository was read. */
function rootMadeByLotDiff(scratch: string): boolean {
	const root = createScratchRepository({ 'a.txt': 'a\n' })
	readLotDiff({ root, head: git({ root, args: ['rev-parse', 'HEAD'] }).trim() })
	return existsSync(scratch)
}

describe('the hand-over scratch folders', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it("the lot's diff read for a review → its index copy made under DIALECTE_SCRATCH", () => {
		const scratch = join(temporaryFolder('dialecte-handover-scratch-'), 'root')
		vi.stubEnv('DIALECTE_SCRATCH', scratch)
		try {
			expect(rootMadeByLotDiff(scratch)).toBe(true)
		} finally {
			vi.unstubAllEnvs()
		}
	})
})
