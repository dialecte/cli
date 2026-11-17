/** The gate's scope folder is made under the scratch root, with the marker prune and health read. */
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { SCRATCH_REPOSITORY_TIMEOUT } from '../../../test/scratch-checks.constants.ts'
import { createScratchRepository, git, temporaryFolder } from '../../../test/scratch-repository.ts'
import { createScopeRun, removeScopeRun } from './selection.ts'

import { describe, expect, it, vi } from 'vitest'

/** Where the scope folder of a run sits, and whether it holds its scratch marker; the run removed after. */
function scopeFolderPlacement(): { parent: string; marked: boolean } {
	const root = createScratchRepository()
	const head = git({ root, args: ['rev-parse', 'HEAD'] }).trim()
	const run = createScopeRun({ root, scope: { base: head, tree: head } })
	try {
		return { parent: dirname(run.folder), marked: existsSync(join(run.folder, 'scratch.json')) }
	} finally {
		removeScopeRun(run)
	}
}

describe('the gate scope folder', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('a scope run → its folder made under DIALECTE_SCRATCH, with its scratch.json', () => {
		const scratch = temporaryFolder('dialecte-scope-scratch-')
		vi.stubEnv('DIALECTE_SCRATCH', scratch)
		try {
			expect(scopeFolderPlacement()).toEqual({ parent: scratch, marked: true })
		} finally {
			vi.unstubAllEnvs()
		}
	})
})
