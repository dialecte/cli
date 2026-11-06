/** `dialecte worktree prune`: a worktree that owns a mutation run is kept while the run runs or died unreported. */
import { join } from 'node:path'

import { deadPid } from '../../test/dead-pid.ts'
import { HOOKS_TREE } from '../../test/mutation-hooks.constants.ts'
import { finishRunning } from '../../test/mutation-hooks.ts'
import { PACKAGE_NAME } from '../../test/mutation-package.constants.ts'
import { SCRATCH_REPOSITORY_TIMEOUT } from '../../test/scratch-checks.constants.ts'
import {
	git,
	initializeRepository,
	temporaryFolder,
	writeFiles,
} from '../../test/scratch-repository.ts'
import { abandonRun, startRun } from '../lib/mutation/run-store.ts'
import { runWorktreeAdd, runWorktreePrune } from './worktree.ts'

import { describe, expect, it } from 'vitest'

import type { RunEntry } from '../lib/mutation/mutation.types.ts'

const BRANCH = 'feat/topic'
const OTHER_BRANCH = 'feat/running'

type Scenario = { workspace: string; core: string; worktree: string }

/** A workspace whose `core` has a worktree on `feat/topic` holding one commit, merged into main unless `merged` is false. */
function workspaceWithWorktree(params: { merged: boolean }): Scenario {
	const workspace = temporaryFolder('dialecte-prune-mutation-')
	const core = initializeRepository({
		root: join(workspace, 'core'),
		files: {
			'package.json': `${JSON.stringify({ name: PACKAGE_NAME })}\n`,
			'.gitignore': 'node_modules\n',
			'src/index.ts': 'export {}\n',
		},
	})
	const worktree = addWorktree({ workspace, core, branch: BRANCH, merged: params.merged })
	return { workspace, core, worktree }
}

/** `.worktrees/<index>-core-<name>` on `branch`, one commit of its own. */
function addWorktree(params: {
	workspace: string
	core: string
	branch: string
	merged: boolean
}): string {
	const { workspace, core, branch } = params
	const added = runWorktreeAdd({
		argv: [core, branch, '--json'],
		cwd: workspace,
		now: new Date(),
		colour: false,
	})
	expect(added.exitCode).toBe(0)
	const worktree = (JSON.parse(added.output) as { worktree: string }).worktree
	const file = `src/${branch.split('/').at(-1)}.ts`
	writeFiles({ root: worktree, files: { [file]: 'export {}\n' } })
	git({ root: worktree, args: ['add', file] })
	git({ root: worktree, args: ['commit', '-q', '-m', `feat: ${branch}`] })
	if (params.merged) git({ root: core, args: ['merge', '-q', '--ff-only', branch] })
	return worktree
}

/**
 * A second worktree of the workspace owning a running run: the one prune keeps for it, so a case about a run
 * that keeps nothing also holds the keep it is told apart from.
 */
function keptForRunningRun(params: { workspace: string; core: string }): { line: string } {
	const worktree = addWorktree({ ...params, branch: OTHER_BRANCH, merged: true })
	const run = startRun({
		root: worktree,
		pid: process.pid,
		lot: OTHER_BRANCH,
		tree: HOOKS_TREE,
		mode: 'changed',
	})
	return {
		line: `  keep    worktree  ${worktree}  (${OTHER_BRANCH}: mutation run ${run.runId} still running (pid ${process.pid}))`,
	}
}

/** A run started from the worktree: it owns it. */
function ownedRun(params: { worktree: string; pid: number }): RunEntry {
	return startRun({
		root: params.worktree,
		pid: params.pid,
		lot: BRANCH,
		tree: HOOKS_TREE,
		mode: 'changed',
	})
}

function prune(workspace: string) {
	return runWorktreePrune({
		argv: ['--root', workspace],
		cwd: workspace,
		scratchRoot: temporaryFolder('dialecte-scratch-root-'),
		isTerminal: false,
		confirm: async () => true,
	})
}

describe('worktree prune: mutation runs', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('a merged clean worktree owning a running run → kept: the run still runs', async () => {
		const { workspace, worktree } = workspaceWithWorktree({ merged: true })
		const run = ownedRun({ worktree, pid: process.pid })

		const result = await prune(workspace)

		expect(result.output.split('\n')).toContain(
			`  keep    worktree  ${worktree}  (${BRANCH}: mutation run ${run.runId} still running (pid ${process.pid}))`,
		)
		expect(result.output).not.toContain(`git worktree remove '${worktree}'`)
	})

	it('a merged clean worktree owning a died run → kept: rerun it or abandon it', async () => {
		const { workspace, worktree } = workspaceWithWorktree({ merged: true })
		const run = ownedRun({ worktree, pid: deadPid() })

		const result = await prune(workspace)

		expect(result.output.split('\n')).toContain(
			`  keep    worktree  ${worktree}  (${BRANCH}: mutation run ${run.runId} died before reporting: rerun or dialecte mutants abandon ${run.runId})`,
		)
		expect(result.output).not.toContain(`git worktree remove '${worktree}'`)
	})

	it('a worktree with a commit not in main owning a running run → kept for the run, not for the commit', async () => {
		const { workspace, worktree } = workspaceWithWorktree({ merged: false })
		const run = ownedRun({ worktree, pid: process.pid })

		const result = await prune(workspace)

		expect(result.output.split('\n')).toContain(
			`  keep    worktree  ${worktree}  (${BRANCH}: mutation run ${run.runId} still running (pid ${process.pid}))`,
		)
	})

	it('a merged clean worktree whose run reported → removed, while another worktree’s running run keeps that one', async () => {
		const { workspace, core, worktree } = workspaceWithWorktree({ merged: true })
		const run = ownedRun({ worktree, pid: process.pid })
		finishRunning({ root: worktree, run, survivors: [] })
		const kept = keptForRunningRun({ workspace, core })

		const result = await prune(workspace)

		expect(result.output.split('\n')).toContain(kept.line)
		expect(result.output.split('\n')).toContain(`  remove  worktree  ${worktree}`)
		expect(result.output).toContain(`cd '${core}' && git worktree remove '${worktree}'`)
	})

	it('a merged clean worktree whose died run was abandoned → removed, while another worktree’s running run keeps that one', async () => {
		const { workspace, core, worktree } = workspaceWithWorktree({ merged: true })
		const run = ownedRun({ worktree, pid: deadPid() })
		expect(abandonRun({ root: worktree, runId: run.runId })).toEqual({ ok: true })
		const kept = keptForRunningRun({ workspace, core })

		const result = await prune(workspace)

		expect(result.output.split('\n')).toContain(kept.line)
		expect(result.output.split('\n')).toContain(`  remove  worktree  ${worktree}`)
		expect(result.output).toContain(`cd '${core}' && git worktree remove '${worktree}'`)
	})
})
