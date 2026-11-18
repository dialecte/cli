/** `lotGitDeclaredHighOf`: the shared areas a lot is held to are never read at HEAD, so a glob the lot dropped still holds it. */
import { createBriefWorkspace, writeStoreLot } from '../../../test/brief-workspace.ts'
import { addWorktreeFolder } from '../../../test/lot-stores.ts'
import { commitFiles } from '../../../test/rules-lot-worktree.ts'
import { git } from '../../../test/scratch-repository.ts'
import { SCRATCH_GIT_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { lotGitDeclaredHighOf } from './base-declared.ts'

import { describe, expect, it } from 'vitest'

const LOT_NAME = '0091-repo-shared'
const SHARED_GLOB = 'src/shared/**'

/** A package.json whose `dialecte.risk.high` lists `globs`. */
function manifestOf(globs: string[]): string {
	return `${JSON.stringify({ name: 'demo-package', dialecte: { risk: { high: globs } } })}\n`
}

describe('lotGitDeclaredHighOf: no lot base', { timeout: SCRATCH_GIT_CASE_TIMEOUT }, () => {
	it('a lot that dropped a shared area from its package.json, no base branch found (the tdd base is HEAD), main dropped it too → the area its recorded commit declares still holds it', () => {
		const workspace = createBriefWorkspace()
		const { repository } = workspace
		commitFiles({
			root: repository,
			files: { 'package.json': manifestOf([SHARED_GLOB]) },
			message: 'chore: package',
		})
		const cut = git({ root: repository, args: ['rev-parse', 'HEAD'] }).trim()
		const worktree = addWorktreeFolder({ workspace, folderName: LOT_NAME })
		commitFiles({
			root: worktree,
			files: { 'package.json': manifestOf([]) },
			message: 'chore: drop the area',
		})
		commitFiles({
			root: repository,
			files: { 'package.json': manifestOf([]) },
			message: 'chore: main drops the area',
		})
		git({ root: repository, args: ['branch', '-m', 'main', 'trunk'] })
		const lotFolder = writeStoreLot({
			workspace,
			name: LOT_NAME,
			scope: ['src/'],
			worktree,
			repository,
			base: { ref: 'main', commit: cut },
		})

		const declared = lotGitDeclaredHighOf({ lotFolder })

		expect(declared.globs).toEqual([SHARED_GLOB])
	})
})
