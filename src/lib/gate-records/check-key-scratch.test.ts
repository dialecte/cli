/** The copy of the index a check key writes its tree from is made under the scratch root. */
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { SCRATCH_REPOSITORY_TIMEOUT } from '../../../test/scratch-checks.constants.ts'
import { createScratchRepository, temporaryFolder } from '../../../test/scratch-repository.ts'
import { readIndexTree } from './check-key.ts'

import { describe, expect, it, vi } from 'vitest'

/** Whether the scratch root (missing before) exists once a check key read the repository's index tree. */
function rootMadeByIndexTree(root: string): boolean {
	readIndexTree({ root: createScratchRepository() })
	return existsSync(root)
}

describe('a check key commit index', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('the index tree read → its index copy made under DIALECTE_SCRATCH, the root made when missing', () => {
		const scratch = join(temporaryFolder('dialecte-check-key-scratch-'), 'root')
		vi.stubEnv('DIALECTE_SCRATCH', scratch)
		try {
			expect(rootMadeByIndexTree(scratch)).toBe(true)
		} finally {
			vi.unstubAllEnvs()
		}
	})
})
