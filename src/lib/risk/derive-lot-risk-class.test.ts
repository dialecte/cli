/** `deriveLotRiskClass`: a store lot's class is derived against its lot base read from git, never the base recorded at its start. */
import { createBriefWorkspace, writeStoreLot } from '../../../test/brief-workspace.ts'
import { addWorktreeFolder } from '../../../test/lot-stores.ts'
import { commitFiles } from '../../../test/rules-lot-worktree.ts'
import { git } from '../../../test/scratch-repository.ts'
import { SCRATCH_GIT_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { deriveLotRiskClass } from './derive-lot-risk-class.ts'

import { describe, expect, it } from 'vitest'

const LOT_NAME = '0090-repo-risk'
const RISKY_FILE = 'src/risky/rule.ts'
const OWN_RISKY_FILE = 'src/risky/own.ts'
const RELEASED_RISKY_FILE = 'src/risky/released.ts'
const RELEASE_TAG = 'demo-package@v0.2.0'

describe('deriveLotRiskClass: the lot base', { timeout: SCRATCH_GIT_CASE_TIMEOUT }, () => {
	it('a lot rebased onto a main that added a file of a declared high area since the cut → derived against the fork point: high for its own file of the area, the file main added no reason', () => {
		const workspace = createBriefWorkspace()
		const { repository } = workspace
		commitFiles({
			root: repository,
			files: {
				'package.json': `${JSON.stringify({ name: 'demo-package', dialecte: { risk: { high: ['src/risky/**'] } } })}\n`,
			},
			message: 'chore: package',
		})
		const cut = git({ root: repository, args: ['rev-parse', 'HEAD'] }).trim()
		const worktree = addWorktreeFolder({ workspace, folderName: LOT_NAME })
		commitFiles({
			root: worktree,
			files: { [OWN_RISKY_FILE]: 'export {}\n' },
			message: 'feat: own',
		})
		commitFiles({
			root: repository,
			files: { [RISKY_FILE]: 'export {}\n' },
			message: 'feat: risky',
		})
		git({ root: worktree, args: ['rebase', '-q', 'main'] })
		const folder = writeStoreLot({
			workspace,
			name: LOT_NAME,
			scope: ['src/'],
			worktree,
			repository,
			base: { ref: 'main', commit: cut },
		})

		const derivation = deriveLotRiskClass({ folder, cwd: worktree })

		expect({
			class: derivation?.class,
			reasonFiles: (derivation?.reasons ?? []).flatMap((reason) =>
				'file' in reason && typeof reason.file === 'string' ? [reason.file] : [],
			),
		}).toEqual({ class: 'high', reasonFiles: [OWN_RISKY_FILE] })
	})

	it('a lot with no base branch found (the tdd base is HEAD), a release tag on its own history → derived against the shared fallback, the tag: high for the file of the area it committed after the tag, not the one before', () => {
		const workspace = createBriefWorkspace()
		const { repository } = workspace
		commitFiles({
			root: repository,
			files: {
				'package.json': `${JSON.stringify({ name: 'demo-package', dialecte: { risk: { high: ['src/risky/**'] } } })}\n`,
			},
			message: 'chore: package',
		})
		const cut = git({ root: repository, args: ['rev-parse', 'HEAD'] }).trim()
		const worktree = addWorktreeFolder({ workspace, folderName: LOT_NAME })
		commitFiles({
			root: worktree,
			files: { [RELEASED_RISKY_FILE]: 'export {}\n' },
			message: 'feat: released',
		})
		git({ root: worktree, args: ['tag', RELEASE_TAG] })
		commitFiles({
			root: worktree,
			files: { [OWN_RISKY_FILE]: 'export {}\n' },
			message: 'feat: own',
		})
		git({ root: repository, args: ['branch', '-m', 'main', 'trunk'] })
		const folder = writeStoreLot({
			workspace,
			name: LOT_NAME,
			scope: ['src/'],
			worktree,
			repository,
			base: { ref: 'main', commit: cut },
		})

		const derivation = deriveLotRiskClass({ folder, cwd: worktree })

		expect({
			class: derivation?.class,
			reasonFiles: (derivation?.reasons ?? []).flatMap((reason) =>
				'file' in reason && typeof reason.file === 'string' ? [reason.file] : [],
			),
		}).toEqual({ class: 'high', reasonFiles: [OWN_RISKY_FILE] })
	})
})
