/**
 * `lot start` on a file system that folds case: a brief naming its repository in another case than the folder has is
 * the same repository, not "not a git repository". Skipped where the file system tells the cases apart.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { briefWith } from '../../test/brief-workspace.ts'
import { createStartWorkspace, withJson } from '../../test/lot-start-workspace.ts'
import { LOT_NAME, START_NOW } from '../../test/lot-start.constants.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { runLot } from './lot.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

describe('lot start, the repository in another case', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('--dry-run of a brief naming ../../REPO for the folder repo -> the same repository: exit 0, the lot and its worktree named with the folder case (repo)', ({
		skip,
	}) => {
		const start = createStartWorkspace({ brief: briefWith({ repository: '../../REPO' }) })
		if (!existsSync(join(start.workspace.workspace, 'REPO'))) skip()

		expect(
			withJson(
				runLot({
					cwd: start.cwd,
					argv: ['start', start.workspace.briefPath, '--dry-run', '--json'],
					now: START_NOW,
				}),
			),
		).toMatchObject({
			exitCode: 0,
			json: {
				dryRun: true,
				lot: LOT_NAME,
				worktree: join(start.worktreesFolder, LOT_NAME),
			},
		})
	})
})
