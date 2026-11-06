/**
 * `dialecte worktree prune`: what it costs in git processes. A workspace of many hand-overs and repositories
 * spawned two `rev-parse --git-common-dir` per hand-over and repository, and read each hand-over's state up to
 * three times: minutes on a real workspace. The counts are pinned from git's own trace (`GIT_TRACE2_EVENT`).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { noRepositoryCli } from '../../test/repository-cli-probe.ts'
import {
	git,
	initializeRepository,
	temporaryFolder,
	writeFiles,
} from '../../test/scratch-repository.ts'
import { runHandover } from './handover.ts'
import { runWorktreeAdd, runWorktreePrune } from './worktree.ts'

import { describe, expect, it, vi } from 'vitest'

const HANDOVERS = 4
const REPOSITORIES = ['cli', 'core', 'scl']

/** The argument lists of the git processes the trace file holds, each process once (its children left out). */
function tracedGitCalls(traceFile: string): string[][] {
	if (!existsSync(traceFile)) return []
	return readFileSync(traceFile, 'utf8')
		.split('\n')
		.filter(Boolean)
		.map(function parse(line) {
			return JSON.parse(line) as { event: string; sid: string; argv?: string[] }
		})
		.filter(function isTopLevelStart(event) {
			return event.event === 'start' && !event.sid.includes('/')
		})
		.map(function argumentsOf(event) {
			return event.argv ?? []
		})
}

/**
 * A workspace of three repositories; `core` has one worktree per hand-over (`feat/topic-<n>`, made by `worktree
 * add`), each with a pending hand-over written in `_commit-plan/topic-<n>/`.
 */
function createWorkspaceWithHandovers(): { workspace: string; branches: string[] } {
	const workspace = temporaryFolder('dialecte-prune-cost-')
	for (const name of REPOSITORIES)
		initializeRepository({ root: join(workspace, name), files: { 'src/index.ts': 'export {}\n' } })
	const core = join(workspace, 'core')
	const branches = Array.from({ length: HANDOVERS }, (_, index) => `feat/topic-${index + 1}`)
	for (const branch of branches) {
		const added = runWorktreeAdd({
			argv: [core, branch, '--json'],
			cwd: workspace,
			now: new Date(),
			colour: false,
		})
		expect(added.exitCode).toBe(0)
		const worktree = (JSON.parse(added.output) as { worktree: string }).worktree
		writeFiles({ root: worktree, files: { 'CHANGELOG.md': `# ${branch}\n` } })
		const plan = join(workspace, '_commit-plan', branch.replace('/', '-'))
		mkdirSync(plan, { recursive: true })
		writeFileSync(
			join(plan, 'lots.json'),
			JSON.stringify({
				repository: worktree,
				branch,
				head: git({ root: worktree, args: ['rev-parse', 'HEAD'] }).trim(),
				lots: [{ paths: ['CHANGELOG.md'], message: `docs(changelog): ${branch}` }],
			}),
		)
		expect(
			runHandover({
				argv: [join(plan, 'lots.json')],
				cliPath: '/opt/cli.js',
				probe: noRepositoryCli,
			}).exitCode,
		).toBe(0)
	}
	return { workspace, branches }
}

describe('worktree prune: git processes', () => {
	it('4 pending hand-overs of core among 3 repositories → --git-common-dir once per hand-over and twice per repository, each hand-over branch read once', async () => {
		const { workspace, branches } = createWorkspaceWithHandovers()
		const traceFile = join(temporaryFolder('dialecte-prune-trace-'), 'trace.json')
		vi.stubEnv('GIT_TRACE2_EVENT', traceFile)
		let exitCode: number
		try {
			exitCode = (
				await runWorktreePrune({
					argv: ['--root', workspace, '--json'],
					cwd: workspace,
					scratchRoot: temporaryFolder('dialecte-scratch-root-'),
					isTerminal: false,
					confirm: async function never() {
						return false
					},
				})
			).exitCode
		} finally {
			vi.unstubAllEnvs()
		}

		const calls = tracedGitCalls(traceFile)
		const branchReads = branches.map(function readsOf(branch) {
			return calls.filter(function readsBranch(argv) {
				return argv.includes('--verify') && argv.includes(`refs/heads/${branch}`)
			}).length
		})
		const commonFolderReads = calls.filter(function readsCommonFolder(argv) {
			return argv.includes('--git-common-dir')
		}).length
		// one per hand-over (whose repository it is), and per repository one for itself and one for its mutation runs
		expect({ exitCode, branchReads, commonFolderReads }).toEqual({
			exitCode: 0,
			branchReads: branches.map(function once() {
				return 1
			}),
			commonFolderReads: HANDOVERS + 2 * REPOSITORIES.length,
		})
	})
})
