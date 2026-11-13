/** `worktree add` and `worktree prune` take the base branch from the shared resolver (origin/HEAD, main, master, config). */
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import {
	addOriginBranch,
	commitEmpty,
	commitOf,
	developAheadOfMain,
	makeDevelopOriginDefault,
	pointOriginHeadAt,
} from '../../test/rule-gaps-base-branch.ts'
import { git, initializeRepository, temporaryFolder } from '../../test/scratch-repository.ts'
import { WORKSPACE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { NO_BASE_BRANCH_FOUND } from '../lib/gate/gate-base.constants.ts'
import { readHygieneBaseline } from '../lib/worktree/hygiene.ts'
import { runWorktreeAdd, runWorktreePrune } from './worktree.ts'

import { describe, expect, it } from 'vitest'

const NOW = new Date('2026-11-11T10:00:00Z')

/** `worktree add` of `feat/thing` in `core`, a throw coming back as the result it left. */
function addThing(params: { workspace: string; core: string; from?: string }): {
	exitCode: number | undefined
	output: string
} {
	try {
		return runWorktreeAdd({
			argv: [
				params.core,
				'feat/thing',
				...(params.from === undefined ? [] : ['--from', params.from]),
			],
			cwd: params.workspace,
			now: NOW,
			colour: false,
		})
	} catch (error) {
		return {
			exitCode: undefined,
			output: `threw: ${error instanceof Error ? error.message : String(error)}`,
		}
	}
}

/** `worktree prune` of the workspace, without `--yes`: the plan only. */
function planPrune(workspace: string) {
	return runWorktreePrune({
		argv: ['--root', workspace],
		cwd: workspace,
		scratchRoot: temporaryFolder('dialecte-scratch-root-'),
		isTerminal: false,
		confirm: async () => true,
	})
}

/** On `branch`, a commit made on a new branch `name`, then `branch` checked out again and `name` merged into it. */
function mergeBranchInto(params: { root: string; branch: string; name: string }): void {
	const { root } = params
	git({ root, args: ['switch', '-q', '-c', params.name] })
	commitEmpty({ root, message: `feat: ${params.name}` })
	git({ root, args: ['switch', '-q', params.branch] })
	git({ root, args: ['merge', '-q', '--ff-only', params.name] })
}

describe('worktree add: where a new branch starts', { timeout: WORKSPACE_CASE_TIMEOUT }, () => {
	it('no --from, origin/HEAD names develop which is ahead of main → the new branch starts at the tip of develop', () => {
		const workspace = temporaryFolder('dialecte-workspace-')
		const core = join(workspace, 'core')
		const { develop } = developAheadOfMain({ root: core })
		makeDevelopOriginDefault(core)
		git({ root: core, args: ['switch', '-q', 'main'] })

		const result = addThing({ workspace, core })

		expect(result.exitCode).toBe(0)
		expect(commitOf({ root: core, rev: 'feat/thing' })).toBe(develop)
	})

	it('no --from and no base branch found (no main, no master, no origin/HEAD) → refused with the resolver’s ask, no worktree, no branch and no index taken: the next add, once main exists, is 0001', () => {
		const workspace = temporaryFolder('dialecte-workspace-')
		const core = initializeRepository({ root: join(workspace, 'core') })
		git({ root: core, args: ['branch', '-m', 'main', 'trunk'] })

		const result = addThing({ workspace, core })

		expect(result).toEqual({
			exitCode: 1,
			output: expect.stringContaining(NO_BASE_BRANCH_FOUND),
		})
		expect(existsSync(join(workspace, '.worktrees', '0001-core-thing'))).toBe(false)
		expect(git({ root: core, args: ['branch', '--list', 'feat/thing'] })).toBe('')
		git({ root: core, args: ['branch', 'main'] })
		expect(addThing({ workspace, core })).toMatchObject({ exitCode: 0 })
		expect(existsSync(join(workspace, '.worktrees', '0001-core-thing'))).toBe(true)
	})
})

describe(
	'worktree add: the branch the worktree was cut from is recorded in its baseline',
	{ timeout: WORKSPACE_CASE_TIMEOUT },
	() => {
		/** The hygiene baseline of the worktree `add` made. */
		function baselineOf(workspace: string) {
			return readHygieneBaseline(join(workspace, '.worktrees', '0001-core-thing'))
		}

		it('--from feat/x → the baseline’s from is feat/x', () => {
			const workspace = temporaryFolder('dialecte-workspace-')
			const core = initializeRepository({ root: join(workspace, 'core') })
			git({ root: core, args: ['branch', 'feat/x'] })

			expect(addThing({ workspace, core, from: 'feat/x' }).exitCode).toBe(0)
			expect(baselineOf(workspace)).toMatchObject({ from: 'feat/x' })
		})

		it('no --from, main is the resolved base branch → the baseline’s from is main', () => {
			const workspace = temporaryFolder('dialecte-workspace-')
			const core = initializeRepository({ root: join(workspace, 'core') })

			expect(addThing({ workspace, core }).exitCode).toBe(0)
			expect(baselineOf(workspace)).toMatchObject({ from: 'main' })
		})

		it('no --from, the base branch is found on origin only → the baseline’s from is origin/develop', () => {
			const workspace = temporaryFolder('dialecte-workspace-')
			const core = join(workspace, 'core')
			developAheadOfMain({ root: core })
			makeDevelopOriginDefault(core)
			git({ root: core, args: ['switch', '-q', 'main'] })
			git({ root: core, args: ['branch', '-q', '-D', 'develop'] })

			expect(addThing({ workspace, core }).exitCode).toBe(0)
			expect(baselineOf(workspace)).toMatchObject({ from: 'origin/develop' })
		})
	},
)

describe(
	'worktree prune: the branch merged work is compared with',
	{ timeout: WORKSPACE_CASE_TIMEOUT },
	() => {
		it('origin/HEAD names develop and main is gone, a branch merged into develop and one not → the merged one listed for removal, the other not', async () => {
			const workspace = temporaryFolder('dialecte-workspace-')
			const core = initializeRepository({ root: join(workspace, 'core') })
			git({ root: core, args: ['branch', '-m', 'main', 'develop'] })
			makeDevelopOriginDefault(core)
			mergeBranchInto({ root: core, branch: 'develop', name: 'old-merged' })
			git({ root: core, args: ['switch', '-q', '-c', 'old-unmerged'] })
			commitEmpty({ root: core, message: 'feat: elsewhere' })
			git({ root: core, args: ['switch', '-q', 'develop'] })

			const result = await planPrune(workspace)

			expect(result.exitCode).toBe(0)
			expect(result.output.split('\n')).toEqual(
				expect.arrayContaining(['  remove  branch  old-merged']),
			)
			expect(result.output).not.toContain('old-unmerged')
		})

		it('no base branch found (no main, no master, no origin/HEAD) → the repository skipped with the resolver’s ask, nothing listed', async () => {
			const workspace = temporaryFolder('dialecte-workspace-')
			const core = initializeRepository({ root: join(workspace, 'core') })
			git({ root: core, args: ['branch', '-m', 'main', 'trunk'] })
			mergeBranchInto({ root: core, branch: 'trunk', name: 'old-merged' })

			const result = await planPrune(workspace)

			expect(result.exitCode).toBe(0)
			expect(result.output).toContain(`skipped, ${NO_BASE_BRANCH_FOUND}`)
			expect(result.output).not.toContain('old-merged')
		})

		it('origin/HEAD names develop but only origin has it (no local develop) → the repository skipped, no local branch develop, nothing listed', async () => {
			const workspace = temporaryFolder('dialecte-workspace-')
			const core = initializeRepository({ root: join(workspace, 'core') })
			mergeBranchInto({ root: core, branch: 'main', name: 'old-merged' })
			addOriginBranch({ root: core, branch: 'develop', at: 'main' })
			pointOriginHeadAt({ root: core, branch: 'develop' })

			const result = await planPrune(workspace)

			expect(result.exitCode).toBe(0)
			expect(result.output).toContain('skipped, no local branch develop')
			expect(result.output).not.toContain('old-merged')
		})
	},
)
