import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { PACKAGE_NAME, SCOPE_FILE } from '../../../test/mutation-package.constants.ts'
import { reportedRun, survivorOf } from '../../../test/mutation-package.ts'
import { SCRATCH_REPOSITORY_TIMEOUT } from '../../../test/scratch-checks.constants.ts'
import { createScratchRepository } from '../../../test/scratch-repository.ts'
import { commonGitDirOf } from '../../../test/scratch-tree.ts'
import { updateLedger } from './ledger.ts'
import { MUTATION_STORE_FOLDER } from './mutation.constants.ts'

import { describe, expect, it, vi } from 'vitest'

const LOCK_FILE = 'ledger.lock'

vi.mock('node:fs', async function failingOwnerWrite(importOriginal) {
	const actual = await importOriginal<typeof import('node:fs')>()
	return {
		...actual,
		writeSync: () => {
			throw new Error('disk full')
		},
	}
})

describe('a lock whose owner cannot be written', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('→ the update fails with the write error and leaves no lock behind', () => {
		const root = createScratchRepository({
			'package.json': `${JSON.stringify({ name: PACKAGE_NAME })}\n`,
		})
		const run = reportedRun({ root, runId: 'r1', survivors: [survivorOf({ key: 'k1' })] })

		expect(() => updateLedger({ root, run, records: {}, targets: [SCOPE_FILE] })).toThrow(
			/disk full/,
		)
		expect(existsSync(join(commonGitDirOf(root), MUTATION_STORE_FOLDER, LOCK_FILE))).toBe(false)
	})
})
