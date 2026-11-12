/** `lot close` holds a worktree's HEAD reflog against the shared resolver's base branch (origin/HEAD, main, master, config). */
import { existsSync, realpathSync } from 'node:fs'
import { join } from 'node:path'

import { makeDevelopOriginDefault } from '../../test/rule-gaps-base-branch.ts'
import {
	git,
	initializeRepository,
	isolateGitConfig,
	temporaryFolder,
	writeFiles,
} from '../../test/scratch-repository.ts'
import { HANDOVER_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { LOCK_TEXT } from '../../test/worktree-pool.constants.ts'
import {
	createFakeNodeModules,
	createRecordingSpawner,
	trashedNamesOf,
} from '../../test/worktree-pool.ts'
import {
	handoverStoreOf,
	recordHandoverState,
	registerHandover,
} from '../lib/handover/handover-store.ts'
import { runLotClose } from './lot-close.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

const NOW = new Date('2026-11-11T10:00:00Z')

type Scenario = { repository: string; worktreesFolder: string; worktree: string; name: string }

/**
 * A main checkout `repo` on `main` whose origin default branch is `develop` (a local `develop` at the same commit),
 * and a committed hand-over worktree on `feat/x` whose HEAD reflog reaches one commit made on a detached HEAD, the
 * worktree switched back to its branch afterwards. `detached` is that commit.
 */
function createScenarioWithDetachedCommit(): Scenario & { detached: string } {
	isolateGitConfig()
	const workspace = realpathSync(temporaryFolder('dialecte-lot-close-base-'))
	const repository = initializeRepository({
		root: join(workspace, 'repo'),
		files: {
			'.gitignore': 'node_modules\n',
			'package.json': '{ "name": "demo" }\n',
			'package-lock.json': LOCK_TEXT,
			'src/a.ts': 'a\n',
		},
	})
	git({ root: repository, args: ['branch', 'develop'] })
	makeDevelopOriginDefault(repository)
	const worktreesFolder = join(workspace, '.worktrees')
	const worktree = join(worktreesFolder, '0001-repo-x')
	git({ root: repository, args: ['worktree', 'add', '-q', '-b', 'feat/x', worktree] })
	writeFiles({ root: worktree, files: { 'src/x.ts': 'export {}\n' } })
	git({ root: worktree, args: ['add', '-A'] })
	git({ root: worktree, args: ['commit', '-q', '-m', 'feat: x'] })
	createFakeNodeModules({ folder: join(worktree, 'node_modules'), marker: 'lot x\n' })
	const folder = realpathSync(temporaryFolder('dialecte-handover-'))
	const name = registerHandover({ root: worktree, folder, branch: 'feat/x', now: NOW })
	recordHandoverState({ store: handoverStoreOf(repository), folder, state: 'committed' })
	git({ root: worktree, args: ['switch', '-q', '--detach'] })
	writeFiles({ root: worktree, files: { 'src/detached.ts': 'export {}\n' } })
	git({ root: worktree, args: ['add', '-A'] })
	git({ root: worktree, args: ['commit', '-q', '-m', 'wip: detached'] })
	const detached = git({ root: worktree, args: ['rev-parse', 'HEAD'] }).trim()
	git({ root: worktree, args: ['switch', '-q', 'feat/x'] })
	return { repository, worktreesFolder, worktree, name, detached }
}

function close(scenario: Scenario) {
	const { spawner } = createRecordingSpawner()
	return runLotClose({
		cwd: scenario.repository,
		argv: [scenario.name],
		now: NOW,
		spawner,
		listProcesses: () => [],
		scratchRoots: [],
	})
}

describe(
	'lot close: the base branch of the reflog rule',
	{ timeout: HANDOVER_CASE_TIMEOUT },
	() => {
		afterEach(function restoreEnvironment() {
			vi.unstubAllEnvs()
		})

		it('origin/HEAD names develop, a detached commit held by no branch → kept, the reason names develop, not main, nothing moved', () => {
			const scenario = createScenarioWithDetachedCommit()

			const outcome = close(scenario)

			expect(outcome.exitCode).toBe(1)
			expect(outcome.output).toContain(
				'its HEAD reflog reaches 1 commit(s) that neither feat/x, develop nor a remote-tracking ref holds',
			)
			expect(existsSync(scenario.worktree)).toBe(true)
			expect(trashedNamesOf(scenario.worktreesFolder)).toEqual([])
		})

		it('origin/HEAD names develop, the detached commit held by develop → the reflog is no reason, closed', () => {
			const scenario = createScenarioWithDetachedCommit()
			git({ root: scenario.repository, args: ['branch', '-f', 'develop', scenario.detached] })

			const outcome = close(scenario)

			expect(outcome.exitCode).toBe(0)
			expect(existsSync(scenario.worktree)).toBe(false)
		})
	},
)
