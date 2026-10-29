import { spawnSync } from 'node:child_process'
import {
	existsSync,
	lstatSync,
	mkdirSync,
	readFileSync,
	readlinkSync,
	realpathSync,
	symlinkSync,
	utimesSync,
	writeFileSync,
} from 'node:fs'
import { join } from 'node:path'

import {
	git,
	initializeRepository,
	temporaryFolder,
	writeFiles,
} from '../../test/scratch-repository.ts'
import { runHandover } from './handover.ts'
import { runWorktreeAdd, runWorktreePrune } from './worktree.ts'

import { describe, expect, it } from 'vitest'

/** Scratch repositories, worktrees, copies: seconds on a loaded machine, never a measure of speed. */
const SCRATCH_WORKSPACE_TIMEOUT = 60_000

/** A workspace holding `core` (husky hooks folder, node_modules with a link to a sibling) and `cli`. */
function createWorkspace(): { workspace: string; core: string } {
	const workspace = temporaryFolder('dialecte-workspace-')
	initializeRepository({ root: join(workspace, 'cli'), files: { 'index.js': 'export {}\n' } })
	const core = initializeRepository({
		root: join(workspace, 'core'),
		files: {
			'.gitignore': 'node_modules\n.husky/_\n*.log\n.DS_Store\n.vitepress/cache\n.vitepress/dist\n',
			'src/index.ts': 'export {}\n',
		},
	})
	writeFiles({
		root: core,
		files: {
			'.husky/_/pre-commit': '#!/bin/sh\nexit 0\n',
			'node_modules/demo/index.js': 'module.exports = 1\n',
		},
	})
	mkdirSync(join(core, 'node_modules/@dialecte'))
	symlinkSync('../../../cli', join(core, 'node_modules/@dialecte/cli'))
	git({ root: core, args: ['config', 'core.hooksPath', '.husky/_'] })
	return { workspace, core }
}

describe('worktree add', { timeout: SCRATCH_WORKSPACE_TIMEOUT }, () => {
	it('a new branch → under .worktrees/, hooks folder copied, node_modules copied with its links, baseline written, card printed', () => {
		const { workspace, core } = createWorkspace()

		const result = runWorktreeAdd({
			argv: [core, 'feat/thing'],
			cwd: workspace,
			now: new Date('2026-10-29T10:00:00Z'),
			colour: false,
		})

		const worktree = join(workspace, '.worktrees', 'core-thing')
		expect(result.exitCode).toBe(0)
		expect(git({ root: worktree, args: ['rev-parse', '--abbrev-ref', 'HEAD'] }).trim()).toBe(
			'feat/thing',
		)
		expect(readFileSync(join(worktree, '.husky/_/pre-commit'), 'utf8')).toContain('exit 0')
		expect(lstatSync(join(worktree, 'node_modules')).isSymbolicLink()).toBe(false)
		expect(readFileSync(join(worktree, 'node_modules/demo/index.js'), 'utf8')).toBe(
			'module.exports = 1\n',
		)
		expect(realpathSync(join(worktree, 'node_modules/@dialecte/cli'))).toBe(
			realpathSync(join(workspace, 'cli')),
		)
		expect(readlinkSync(join(core, 'node_modules/@dialecte/cli'))).toBe('../../../cli')
		const gitFolder = git({ root: worktree, args: ['rev-parse', '--absolute-git-dir'] }).trim()
		expect(JSON.parse(readFileSync(join(gitFolder, 'dialecte-hygiene.json'), 'utf8'))).toEqual({
			stashCommits: [],
			head: git({ root: worktree, args: ['rev-parse', 'HEAD'] }).trim(),
			writtenAt: '2026-10-29T10:00:00.000Z',
		})
		expect(result.output).toMatch(/^│ branch +feat\/thing \(from main\) +│$/m)
		expect(result.output).toMatch(/^│ hooks +\.husky\/_ copied +│$/m)
		expect(result.output).toContain(`cd '${worktree}'`)
	})

	it('the worktree folder exists already → refused, nothing made', () => {
		const { workspace, core } = createWorkspace()
		mkdirSync(join(workspace, '.worktrees', 'core-thing'), { recursive: true })

		const result = runWorktreeAdd({
			argv: [core, 'feat/thing'],
			cwd: workspace,
			now: new Date(),
			colour: false,
		})

		expect(result).toMatchObject({ exitCode: 1 })
		expect(result.output).toContain('exists already')
		expect(git({ root: core, args: ['branch', '--list', 'feat/thing'] })).toBe('')
	})
})

/** A pid no process holds any more: a child that already exited. */
function deadPid(): number {
	return spawnSync('true').pid
}

/** A rehearsal clone left in `scratchRoot`, its marker naming the process that made it. */
function makeRehearsalClone(params: { scratchRoot: string; name: string; pid?: number }): string {
	const clone = join(params.scratchRoot, params.name)
	mkdirSync(join(clone, '.git'), { recursive: true })
	if (params.pid !== undefined)
		writeFileSync(
			join(clone, '.git', 'dialecte-rehearsal.json'),
			JSON.stringify({ pid: params.pid, startedAt: '2026-10-29T10:00:00.000Z' }),
		)
	return clone
}

function commitIn(params: { root: string; file: string; message: string }): void {
	writeFiles({ root: params.root, files: { [params.file]: 'export {}\n' } })
	git({ root: params.root, args: ['add', params.file] })
	git({ root: params.root, args: ['commit', '-q', '-m', params.message] })
}

/** A workspace with a worktree per situation `prune` tells apart. */
function createPruneWorkspace(): {
	workspace: string
	core: string
	worktrees: Record<string, string>
} {
	const { workspace, core } = createWorkspace()
	const worktrees: Record<string, string> = {}
	for (const name of ['merged', 'unmerged', 'dirty', 'pending']) {
		expect(
			runWorktreeAdd({
				argv: [core, `feat/${name}`],
				cwd: workspace,
				now: new Date(),
				colour: false,
			}).exitCode,
		).toBe(0)
		worktrees[name] = join(workspace, '.worktrees', `core-${name}`)
	}
	commitIn({ root: worktrees.merged, file: 'src/merged.ts', message: 'feat: merged' })
	git({ root: core, args: ['merge', '-q', '--ff-only', 'feat/merged'] })
	writeFiles({ root: worktrees.unmerged, files: { 'src/new.ts': 'export {}\n' } })
	git({ root: worktrees.unmerged, args: ['add', 'src/new.ts'] })
	git({ root: worktrees.unmerged, args: ['commit', '-q', '-m', 'feat: not merged'] })
	writeFiles({ root: worktrees.dirty, files: { 'src/index.ts': 'export const dirty = 1\n' } })
	git({ root: core, args: ['checkout', '-q', '-b', 'old-merged'] })
	commitIn({ root: core, file: 'src/old.ts', message: 'feat: old, merged' })
	git({ root: core, args: ['checkout', '-q', 'main'] })
	git({ root: core, args: ['merge', '-q', '--ff-only', 'old-merged'] })
	git({ root: core, args: ['branch', 'old-unmerged'] })
	git({ root: core, args: ['checkout', '-q', 'old-unmerged'] })
	git({ root: core, args: ['commit', '-q', '--allow-empty', '-m', 'feat: elsewhere'] })
	git({ root: core, args: ['checkout', '-q', 'main'] })

	writeFiles({ root: worktrees.pending, files: { 'CHANGELOG.md': '# Changelog\n' } })
	const pendingPlan = join(workspace, '_commit-plan', 'pending-topic')
	mkdirSync(pendingPlan, { recursive: true })
	writeFileSync(
		join(pendingPlan, 'lots.json'),
		JSON.stringify({
			repository: worktrees.pending,
			branch: 'feat/pending',
			head: git({ root: worktrees.pending, args: ['rev-parse', 'HEAD'] }).trim(),
			lots: [{ paths: ['CHANGELOG.md'], message: 'docs(changelog): pending' }],
		}),
	)
	expect(
		runHandover({ argv: [join(pendingPlan, 'lots.json')], cliPath: '/opt/cli.js' }).exitCode,
	).toBe(0)
	return { workspace, core, worktrees }
}

describe('worktree prune', { timeout: SCRATCH_WORKSPACE_TIMEOUT }, () => {
	it('without --yes → merged clean worktree and merged branch listed with their commands; unmerged, dirty, pending kept; nothing removed', async () => {
		const { workspace, core, worktrees } = createPruneWorkspace()
		const scratchRoot = temporaryFolder('dialecte-scratch-root-')
		makeRehearsalClone({ scratchRoot, name: 'dialecte-rehearse-abc123', pid: deadPid() })

		const result = await runWorktreePrune({
			argv: ['--root', workspace],
			cwd: workspace,
			scratchRoot,
			isTerminal: false,
			confirm: async () => true,
		})

		expect(result.exitCode).toBe(0)
		const lines = result.output.split('\n')
		expect(lines).toEqual(
			expect.arrayContaining([
				`  remove  worktree  ${worktrees.merged}`,
				`  keep    worktree  ${worktrees.unmerged}  (feat/unmerged: 1 commit(s) not in main)`,
				`  keep    worktree  ${worktrees.dirty}  (feat/dirty: uncommitted changes)`,
				`  keep    worktree  ${worktrees.pending}  (feat/pending: a hand-over is pending in it)`,
				'  remove  branch  old-merged',
				`cd '${core}' && git worktree remove '${worktrees.merged}'`,
				`cd '${core}' && git branch -d 'feat/merged'`,
				`cd '${core}' && git branch -d 'old-merged'`,
				`cd '${scratchRoot}' && rm -rf 'dialecte-rehearse-abc123'`,
			]),
		)
		expect(result.output).not.toContain('old-unmerged')
		expect(result.output).not.toMatch(/branch -d 'feat\/(unmerged|dirty|pending)'/)
		expect(existsSync(worktrees.merged)).toBe(true)
	})

	it('--yes on a terminal, confirmed → the merged worktree, its branch and the clone removed; the rest untouched', async () => {
		const { workspace, core, worktrees } = createPruneWorkspace()
		const scratchRoot = temporaryFolder('dialecte-scratch-root-')
		makeRehearsalClone({ scratchRoot, name: 'dialecte-rehearse-abc123', pid: deadPid() })
		const questions: string[] = []

		const result = await runWorktreePrune({
			argv: ['--root', workspace, '--yes'],
			cwd: workspace,
			scratchRoot,
			isTerminal: true,
			confirm: async (question) => {
				questions.push(question)
				return true
			},
		})

		expect(result.exitCode).toBe(0)
		expect(questions).toEqual(['Remove these 4 item(s)? [y/N] '])
		expect(existsSync(worktrees.merged)).toBe(false)
		expect(git({ root: core, args: ['branch', '--list', 'feat/merged', 'old-merged'] })).toBe('')
		expect(existsSync(join(scratchRoot, 'dialecte-rehearse-abc123'))).toBe(false)
		for (const name of ['unmerged', 'dirty', 'pending'])
			expect(existsSync(worktrees[name])).toBe(true)
		expect(git({ root: core, args: ['branch', '--list', 'old-unmerged'] }).trim()).toBe(
			'old-unmerged',
		)
	})

	it('--yes without a terminal → refused, nothing removed', async () => {
		const { workspace, worktrees } = createPruneWorkspace()

		const result = await runWorktreePrune({
			argv: ['--root', workspace, '--yes'],
			cwd: workspace,
			scratchRoot: temporaryFolder('dialecte-scratch-root-'),
			isTerminal: false,
			confirm: async () => true,
		})

		expect(result.exitCode).toBe(2)
		expect(result.output).toContain('asks for a confirmation on a terminal')
		expect(existsSync(worktrees.merged)).toBe(true)
	})

	it('a hand-over whose lots are all committed → its folder removed by the commands', async () => {
		const { workspace, worktrees } = createPruneWorkspace()
		writeFiles({ root: worktrees.pending, files: {} })
		spawnSync('git', ['add', 'CHANGELOG.md'], { cwd: worktrees.pending })
		spawnSync('git', ['commit', '-q', '-m', 'docs(changelog): pending'], { cwd: worktrees.pending })

		const result = await runWorktreePrune({
			argv: ['--root', workspace],
			cwd: workspace,
			scratchRoot: temporaryFolder('dialecte-scratch-root-'),
			isTerminal: false,
			confirm: async () => true,
		})

		expect(result.output).toContain(
			`cd '${join(workspace, '_commit-plan')}' && rm -rf 'pending-topic'`,
		)
	})

	it('a worktree just made and a branch never committed on → kept, saying they have no commit of their own', async () => {
		const { workspace, core } = createWorkspace()
		expect(
			runWorktreeAdd({ argv: [core, 'feat/fresh'], cwd: workspace, now: new Date(), colour: false })
				.exitCode,
		).toBe(0)
		git({ root: core, args: ['branch', 'feat/started'] })

		const result = await runWorktreePrune({
			argv: ['--root', workspace],
			cwd: workspace,
			scratchRoot: temporaryFolder('dialecte-scratch-root-'),
			isTerminal: false,
			confirm: async () => true,
		})

		expect(result.output.split('\n')).toEqual(
			expect.arrayContaining([
				`  keep    worktree  ${join(workspace, '.worktrees', 'core-fresh')}  (feat/fresh: no commit of its own in its reflog)`,
				'  keep    branch  feat/started  (no commit of its own in its reflog)',
			]),
		)
		expect(result.output).not.toContain('git worktree remove')
		expect(result.output).not.toContain('git branch -d')
	})

	it('a merged clean worktree holding an ignored file outside node_modules → kept, naming the file', async () => {
		const { workspace, worktrees } = createPruneWorkspace()
		writeFiles({ root: worktrees.merged, files: { 'notes.log': 'local notes\n' } })

		const result = await runWorktreePrune({
			argv: ['--root', workspace],
			cwd: workspace,
			scratchRoot: temporaryFolder('dialecte-scratch-root-'),
			isTerminal: false,
			confirm: async () => true,
		})

		expect(result.output.split('\n')).toContain(
			`  keep    worktree  ${worktrees.merged}  (feat/merged: ignored files git worktree remove would delete: notes.log)`,
		)
		expect(result.output).not.toContain(`git worktree remove '${worktrees.merged}'`)
	})

	it('rehearsal clones: a dead one removed; one whose process runs, and one without a marker, kept with why', async () => {
		const { workspace } = createWorkspace()
		const scratchRoot = temporaryFolder('dialecte-scratch-root-')
		makeRehearsalClone({ scratchRoot, name: 'dialecte-rehearse-dead', pid: deadPid() })
		makeRehearsalClone({ scratchRoot, name: 'dialecte-rehearse-live', pid: process.pid })
		makeRehearsalClone({ scratchRoot, name: 'dialecte-rehearse-bare' })

		const result = await runWorktreePrune({
			argv: ['--root', workspace],
			cwd: workspace,
			scratchRoot,
			isTerminal: false,
			confirm: async () => true,
		})

		const lines = result.output.split('\n')
		expect(lines).toEqual(
			expect.arrayContaining([
				`  remove  ${join(scratchRoot, 'dialecte-rehearse-dead')}`,
				`  keep    ${join(scratchRoot, 'dialecte-rehearse-live')}  (its rehearsal still runs: pid ${process.pid})`,
				`  keep    ${join(scratchRoot, 'dialecte-rehearse-bare')}  (no rehearsal marker: not made by this cli, or still starting)`,
				`cd '${scratchRoot}' && rm -rf 'dialecte-rehearse-dead'`,
			]),
		)
		expect(result.output).not.toContain("rm -rf 'dialecte-rehearse-live'")
		expect(result.output).not.toContain("rm -rf 'dialecte-rehearse-bare'")
	})

	it('a workspace child whose .git is a file → no crash; the main checkout on a merged branch → that branch kept', async () => {
		const { workspace, core } = createWorkspace()
		mkdirSync(join(workspace, 'linked'))
		writeFileSync(join(workspace, 'linked', '.git'), 'gitdir: /nowhere\n')
		git({ root: core, args: ['checkout', '-q', '-b', 'feat/here'] })
		commitIn({ root: core, file: 'src/here.ts', message: 'feat: here' })
		git({ root: core, args: ['checkout', '-q', 'main'] })
		git({ root: core, args: ['merge', '-q', '--ff-only', 'feat/here'] })
		git({ root: core, args: ['checkout', '-q', 'feat/here'] })

		const result = await runWorktreePrune({
			argv: ['--root', workspace],
			cwd: workspace,
			scratchRoot: temporaryFolder('dialecte-scratch-root-'),
			isTerminal: false,
			confirm: async () => true,
		})

		expect(result.exitCode).toBe(0)
		expect(result.output).not.toContain("git branch -d 'feat/here'")
	})

	it('a committed hand-over at the root of _commit-plan, or holding other folders → never removed', async () => {
		const { workspace, worktrees } = createPruneWorkspace()
		writeFiles({ root: worktrees.merged, files: { 'CHANGELOG.md': '# Changelog\n' } })
		const plans = join(workspace, '_commit-plan')
		for (const folder of [plans, join(plans, 'group')]) {
			mkdirSync(folder, { recursive: true })
			writeFileSync(
				join(folder, 'lots.json'),
				JSON.stringify({
					repository: worktrees.merged,
					branch: 'feat/merged',
					head: git({ root: worktrees.merged, args: ['rev-parse', 'HEAD'] }).trim(),
					lots: [{ paths: ['CHANGELOG.md'], message: 'docs(changelog): merged' }],
				}),
			)
		}
		mkdirSync(join(plans, 'group', 'inner'))
		for (const folder of [plans, join(plans, 'group')]) {
			writeFileSync(join(folder, 'commit.sh'), '#!/bin/sh\n')
			for (const name of ['files.txt', 'files.sha256', 'files.deleted', 'lots.sha256'])
				writeFileSync(join(folder, name), name === 'files.txt' ? 'CHANGELOG.md\n' : '')
		}
		commitIn({ root: worktrees.merged, file: 'CHANGELOG.md', message: 'docs(changelog): merged' })

		const result = await runWorktreePrune({
			argv: ['--root', workspace],
			cwd: workspace,
			scratchRoot: temporaryFolder('dialecte-scratch-root-'),
			isTerminal: false,
			confirm: async () => true,
		})

		expect(result.output).not.toMatch(/rm -rf '(_commit-plan|group)'/)
	})

	it('prune reading a worktree whose files changed only in mtime → its index left byte for byte', async () => {
		const { workspace, worktrees } = createPruneWorkspace()
		const later = new Date(Date.now() + 120_000)
		utimesSync(join(worktrees.merged, 'src/index.ts'), later, later)
		const gitFolder = git({
			root: worktrees.merged,
			args: ['rev-parse', '--absolute-git-dir'],
		}).trim()
		const before = readFileSync(join(gitFolder, 'index'))

		await runWorktreePrune({
			argv: ['--root', workspace],
			cwd: workspace,
			scratchRoot: temporaryFolder('dialecte-scratch-root-'),
			isTerminal: false,
			confirm: async () => true,
		})

		expect(readFileSync(join(gitFolder, 'index')).equals(before)).toBe(true)
	})

	it('a branch reset onto a newer main after a commit of its own → kept: its reflog is the way back to that commit', async () => {
		const { workspace, core } = createWorkspace()
		git({ root: core, args: ['checkout', '-q', '-b', 'feat/reset'] })
		commitIn({ root: core, file: 'src/lost.ts', message: 'feat: only in the reflog' })
		git({ root: core, args: ['checkout', '-q', 'main'] })
		commitIn({ root: core, file: 'src/newer.ts', message: 'feat: main moves on' })
		git({ root: core, args: ['branch', '-f', 'feat/reset', 'main'] })

		const result = await runWorktreePrune({
			argv: ['--root', workspace],
			cwd: workspace,
			scratchRoot: temporaryFolder('dialecte-scratch-root-'),
			isTerminal: false,
			confirm: async () => true,
		})

		expect(result.output.split('\n')).toContain(
			'  keep    branch  feat/reset  (its reflog still reaches 1 commit(s) not in main)',
		)
		expect(result.output).not.toContain("git branch -d 'feat/reset'")
	})

	it('ignored files that are rebuilt (.DS_Store, .vitepress cache and dist) → removed; twelve logs → kept, the reason capped', async () => {
		const { workspace, core, worktrees } = createPruneWorkspace()
		writeFiles({
			root: worktrees.merged,
			files: {
				'.DS_Store': 'x',
				'src/.DS_Store': 'x',
				'.vitepress/cache/deps.json': '{}',
				'.vitepress/dist/index.html': '<html/>',
			},
		})
		const logs = Object.fromEntries(
			Array.from({ length: 12 }, (_, index) => [
				`logs/${String(index + 1).padStart(2, '0')}.log`,
				'x',
			]),
		)
		const flooded = join(workspace, '.worktrees', 'core-flooded')
		expect(
			runWorktreeAdd({
				argv: [core, 'feat/flooded'],
				cwd: workspace,
				now: new Date(),
				colour: false,
			}).exitCode,
		).toBe(0)
		commitIn({ root: flooded, file: 'src/flooded.ts', message: 'feat: flooded' })
		git({ root: core, args: ['merge', '-q', '--ff-only', 'feat/flooded'] })
		writeFiles({ root: flooded, files: logs })

		const result = await runWorktreePrune({
			argv: ['--root', workspace],
			cwd: workspace,
			scratchRoot: temporaryFolder('dialecte-scratch-root-'),
			isTerminal: false,
			confirm: async () => true,
		})

		const lines = result.output.split('\n')
		expect(lines).toContain(`  remove  worktree  ${worktrees.merged}`)
		expect(lines).toContain(
			`  keep    worktree  ${flooded}  (feat/flooded: 12 ignored files git worktree remove would delete, first: logs/01.log, logs/02.log, logs/03.log)`,
		)
	})
})
