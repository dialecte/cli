import { spawnSync } from 'node:child_process'
import {
	chmodSync,
	existsSync,
	lstatSync,
	mkdirSync,
	readFileSync,
	readlinkSync,
	rmSync,
	realpathSync,
	symlinkSync,
	utimesSync,
	writeFileSync,
} from 'node:fs'
import { join } from 'node:path'

import { deadPid } from '../../test/dead-pid.ts'
import { noRepositoryCli } from '../../test/repository-cli-probe.ts'
import {
	git,
	initializeRepository,
	temporaryFolder,
	writeFiles,
} from '../../test/scratch-repository.ts'
import { WORKSPACE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { createRecordingSpawner } from '../../test/worktree-pool.ts'
import { shellQuote } from '../lib/shell-quote.ts'
import { runHandover } from './handover.ts'
import { runWorktreeAdd, runWorktreePrune } from './worktree.ts'

import { describe, expect, it } from 'vitest'

import type { ProcessFolder } from '../lib/worktree/worktree.types.ts'

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

/** `worktree add` at a fixed time; a throw comes back as the result it left instead of a card. */
function addOrThrown(params: { argv: string[]; cwd: string }): {
	exitCode: number | undefined
	output: string
} {
	try {
		return runWorktreeAdd({ ...params, now: new Date('2026-11-06T10:00:00Z'), colour: false })
	} catch (error) {
		return {
			exitCode: undefined,
			output: `threw: ${error instanceof Error ? error.message : String(error)}`,
		}
	}
}

describe('worktree add', { timeout: WORKSPACE_CASE_TIMEOUT }, () => {
	it('a new branch → under .worktrees/, hooks folder copied, node_modules copied with its links, baseline written, card printed', () => {
		const { workspace, core } = createWorkspace()

		const result = runWorktreeAdd({
			argv: [core, 'feat/thing'],
			cwd: workspace,
			now: new Date('2026-10-29T10:00:00Z'),
			colour: false,
		})

		const worktree = join(workspace, '.worktrees', '0001-core-thing')
		expect(result.exitCode).toBe(0)
		expect(existsSync(worktree)).toBe(true)
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
			from: 'main',
			writtenAt: '2026-10-29T10:00:00.000Z',
		})
		expect(result.output).toMatch(/^│ branch +feat\/thing \(from main\) +│$/m)
		expect(result.output).toMatch(/^│ hooks +\.husky\/_ copied +│$/m)
		expect(result.output).toContain(`cd '${worktree}'`)
	})

	it('a second worktree, then a third after the second was removed → 0002, then 0003: a number is never taken again', () => {
		const { workspace, core } = createWorkspace()
		const now = new Date('2026-11-06T10:00:00Z')
		const worktrees = join(workspace, '.worktrees')

		const first = runWorktreeAdd({ argv: [core, 'feat/one'], cwd: workspace, now, colour: false })
		const second = runWorktreeAdd({ argv: [core, 'feat/two'], cwd: workspace, now, colour: false })
		expect(existsSync(join(worktrees, '0002-core-two'))).toBe(true)
		git({ root: core, args: ['worktree', 'remove', join(worktrees, '0002-core-two')] })
		const third = runWorktreeAdd({ argv: [core, 'feat/three'], cwd: workspace, now, colour: false })

		expect([first.exitCode, second.exitCode, third.exitCode]).toEqual([0, 0, 0])
		expect(existsSync(join(worktrees, '0001-core-one'))).toBe(true)
		expect(existsSync(join(worktrees, '0003-core-three'))).toBe(true)
		expect(
			git({ root: join(worktrees, '0003-core-three'), args: ['branch', '--show-current'] }).trim(),
		).toBe('feat/three')
	})

	it('cli then core in one workspace, beside an unnumbered worktree folder and the sibling link core → 0001-cli-x then 0002-core-y; the unnumbered folder and the link keep their names', () => {
		const { workspace, core } = createWorkspace()
		const worktrees = join(workspace, '.worktrees')
		mkdirSync(join(worktrees, 'cli-old'), { recursive: true })
		symlinkSync('../core', join(worktrees, 'core'))
		const now = new Date('2026-11-06T10:00:00Z')

		const first = runWorktreeAdd({
			argv: [join(workspace, 'cli'), 'feat/x', '--json'],
			cwd: workspace,
			now,
			colour: false,
		})
		const second = runWorktreeAdd({
			argv: [core, 'feat/y', '--json'],
			cwd: workspace,
			now,
			colour: false,
		})

		expect(
			[first, second].map(function folderOf(result) {
				return (JSON.parse(result.output) as { worktree?: string }).worktree
			}),
		).toEqual([join(worktrees, '0001-cli-x'), join(worktrees, '0002-core-y')])
		expect(existsSync(join(worktrees, 'cli-old'))).toBe(true)
		expect(readlinkSync(join(worktrees, 'core'))).toBe('../core')
	})

	it('--from on a branch that exists → refused, exit 1, no index taken: the next worktree is 0001', () => {
		const { workspace, core } = createWorkspace()
		git({ root: core, args: ['branch', 'feat/there'] })
		const now = new Date('2026-11-06T10:00:00Z')

		const refused = runWorktreeAdd({
			argv: [core, 'feat/there', '--from', 'main'],
			cwd: workspace,
			now,
			colour: false,
		})
		const next = runWorktreeAdd({
			argv: [core, 'feat/next', '--json'],
			cwd: workspace,
			now,
			colour: false,
		})

		expect(refused).toMatchObject({ exitCode: 1, output: expect.stringContaining('--from') })
		expect((JSON.parse(next.output) as { index?: string }).index).toBe('0001')
	})

	it('.worktrees/.index is a file → refused, exit 1 naming it; no worktree, no branch made', () => {
		const { workspace, core } = createWorkspace()
		const claims = join(workspace, '.worktrees', '.index')
		mkdirSync(join(workspace, '.worktrees'), { recursive: true })
		writeFileSync(claims, 'not a folder\n')

		const result = addOrThrown({ argv: [core, 'feat/thing'], cwd: workspace })

		expect(result).toEqual({ exitCode: 1, output: expect.stringContaining(claims) })
		expect(git({ root: core, args: ['branch', '--list', 'feat/thing'] })).toBe('')
	})

	it('--json → the index and the numbered worktree; the card names the numbered folder', () => {
		const { workspace, core } = createWorkspace()
		const now = new Date('2026-11-06T10:00:00Z')

		const json = runWorktreeAdd({
			argv: [core, 'feat/one', '--json'],
			cwd: workspace,
			now,
			colour: false,
		})
		const card = runWorktreeAdd({ argv: [core, 'feat/two'], cwd: workspace, now, colour: false })

		expect(JSON.parse(json.output)).toMatchObject({
			index: '0001',
			worktree: join(workspace, '.worktrees', '0001-core-one'),
			branch: 'feat/one',
		})
		expect(card.output).toMatch(
			new RegExp(
				`^│ worktree +${join(workspace, '.worktrees', '0002-core-two').replaceAll('.', '\\.')} +│$`,
				'm',
			),
		)
		expect(card.output).toContain(`cd '${join(workspace, '.worktrees', '0002-core-two')}'`)
	})

	it('a new worktree → .dialecte/ is excluded: a hand-written lot file never shows as untracked', () => {
		const { workspace, core } = createWorkspace()

		const result = runWorktreeAdd({
			argv: [core, 'feat/thing'],
			cwd: workspace,
			now: new Date('2026-10-30T10:00:00Z'),
			colour: false,
		})

		const worktree = join(workspace, '.worktrees', '0001-core-thing')
		expect(existsSync(worktree)).toBe(true)
		writeFiles({ root: worktree, files: { '.dialecte/lot.json': '{}\n' } })
		expect(result.exitCode).toBe(0)
		expect(git({ root: worktree, args: ['status', '--porcelain'] })).toBe('')
		expect(
			git({ root: worktree, args: ['check-ignore', '--no-index', '.dialecte/lot.json'] }).trim(),
		).toBe('.dialecte/lot.json')
	})

	it('two worktrees added in the same repository → .dialecte/ is listed once in the exclude file', () => {
		const { workspace, core } = createWorkspace()
		const now = new Date('2026-10-30T10:00:00Z')

		const first = runWorktreeAdd({ argv: [core, 'feat/one'], cwd: workspace, now, colour: false })
		const second = runWorktreeAdd({ argv: [core, 'feat/two'], cwd: workspace, now, colour: false })

		const exclude = readFileSync(join(core, '.git', 'info', 'exclude'), 'utf8')
		expect([first.exitCode, second.exitCode]).toEqual([0, 0])
		expect(exclude.split('\n').filter((line) => line === '.dialecte/')).toEqual(['.dialecte/'])
	})

	for (const damage of ['has no node_modules', 'was deleted from disk (prunable)'])
		it(`--from <branch> whose worktree ${damage} → node_modules copied from the main checkout`, () => {
			const { workspace, core } = createWorkspace()
			const base = join(workspace, '.worktrees', 'core-base')
			git({ root: core, args: ['worktree', 'add', '--quiet', '-b', 'feat/base', base, 'main'] })
			if (damage.startsWith('was')) rmSync(base, { recursive: true, force: true })

			const result = runWorktreeAdd({
				argv: [core, 'feat/child', '--from', 'feat/base'],
				cwd: workspace,
				now: new Date('2026-10-30T10:00:00Z'),
				colour: false,
			})

			const copied = join(workspace, '.worktrees', '0001-core-child', 'node_modules/demo/index.js')
			expect(result.exitCode).toBe(0)
			expect(existsSync(copied) ? readFileSync(copied, 'utf8') : undefined).toBe(
				'module.exports = 1\n',
			)
		})

	it('--from <branch> checked out in a worktree → node_modules copied from that worktree; a branch with no worktree → from the main checkout', () => {
		const { workspace, core } = createWorkspace()
		const base = join(workspace, '.worktrees', 'core-base')
		git({ root: core, args: ['worktree', 'add', '--quiet', '-b', 'feat/base', base, 'main'] })
		writeFiles({ root: base, files: { 'node_modules/demo/index.js': 'module.exports = "base"\n' } })
		git({ root: core, args: ['branch', 'feat/loose'] })

		const fromWorktree = runWorktreeAdd({
			argv: [core, 'feat/child', '--from', 'feat/base'],
			cwd: workspace,
			now: new Date('2026-10-30T10:00:00Z'),
			colour: false,
		})
		const fromMain = runWorktreeAdd({
			argv: [core, 'feat/other', '--from', 'feat/loose'],
			cwd: workspace,
			now: new Date('2026-10-30T10:00:00Z'),
			colour: false,
		})

		expect(fromWorktree.exitCode).toBe(0)
		expect(fromMain.exitCode).toBe(0)
		expect(
			['0001-core-child', '0002-core-other'].map(function holdsDemo(name) {
				return existsSync(join(workspace, '.worktrees', name, 'node_modules/demo/index.js'))
			}),
		).toEqual([true, true])
		expect(
			readFileSync(
				join(workspace, '.worktrees', '0001-core-child', 'node_modules/demo/index.js'),
				'utf8',
			),
		).toBe('module.exports = "base"\n')
		expect(
			readFileSync(
				join(workspace, '.worktrees', '0002-core-other', 'node_modules/demo/index.js'),
				'utf8',
			),
		).toBe('module.exports = 1\n')
	})
})

/**
 * The move into `trash` that prune shows for `folder` (what `--yes` does), never a removal: the workspace's
 * `.worktrees/_trash` for a hand-over folder, the scratch root's `dialecte-trash` for a rehearsal clone.
 */
function trashMove(params: { trash: string; folder: string }): string {
	return `mkdir -p ${shellQuote(params.trash)} && mv ${shellQuote(params.folder)} ${shellQuote(`${params.trash}/`)}  # then removed in the background`
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

/**
 * A rehearsal folder left in `scratchRoot` as this cli makes it: the clone in a folder named as the
 * repository (`core`), its marker naming the process that made it.
 */
function makeRehearsalFolder(params: { scratchRoot: string; name: string; pid: number }): string {
	const folder = join(params.scratchRoot, params.name)
	makeRehearsalClone({ scratchRoot: folder, name: 'core', pid: params.pid })
	return folder
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
		const added = runWorktreeAdd({
			argv: [core, `feat/${name}`, '--json'],
			cwd: workspace,
			now: new Date(),
			colour: false,
		})
		expect(added.exitCode).toBe(0)
		worktrees[name] = (JSON.parse(added.output) as { worktree: string }).worktree
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
		runHandover({
			argv: [join(pendingPlan, 'lots.json')],
			cliPath: '/opt/cli.js',
			probe: noRepositoryCli,
		}).exitCode,
	).toBe(0)
	return { workspace, core, worktrees }
}

describe('worktree prune', { timeout: WORKSPACE_CASE_TIMEOUT }, () => {
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
				`  keep    worktree  ${worktrees.unmerged}  (feat/unmerged: not landed: its work is not in main)`,
				`  keep    worktree  ${worktrees.dirty}  (feat/dirty: uncommitted changes)`,
				`  keep    worktree  ${worktrees.pending}  (feat/pending: a hand-over is pending in it)`,
				'  remove  branch  old-merged',
				`cd '${core}' && git worktree remove '${worktrees.merged}'`,
				`cd '${core}' && git branch -d 'feat/merged'`,
				`cd '${core}' && git branch -d 'old-merged'`,
				trashMove({
					trash: join(scratchRoot, 'dialecte-trash'),
					folder: join(scratchRoot, 'dialecte-rehearse-abc123'),
				}),
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
			trashMove({
				trash: join(workspace, '.worktrees', '_trash'),
				folder: join(workspace, '_commit-plan', 'pending-topic'),
			}),
		)
	})

	it('--yes, a committed hand-over folder and a dead rehearsal clone → each moved into a trash on its own file system (a clone in its own scratch root), its background removal started there', async () => {
		const { workspace, worktrees } = createPruneWorkspace()
		git({ root: worktrees.pending, args: ['add', 'CHANGELOG.md'] })
		git({ root: worktrees.pending, args: ['commit', '-q', '-m', 'docs(changelog): pending'] })
		const scratchRoot = temporaryFolder('dialecte-scratch-root-')
		const clone = makeRehearsalClone({
			scratchRoot,
			name: 'dialecte-rehearse-dead',
			pid: deadPid(),
		})
		const handover = join(workspace, '_commit-plan', 'pending-topic')
		const recording = createRecordingSpawner()

		const result = await runWorktreePrune({
			argv: ['--root', workspace, '--yes'],
			cwd: workspace,
			scratchRoot,
			isTerminal: true,
			confirm: async () => true,
			spawner: recording.spawner,
		})

		const trashes = [join(workspace, '.worktrees', '_trash'), join(scratchRoot, 'dialecte-trash')]
		const trashed = result.output
			.split('\n')
			.filter((line) => line.includes(' sent to the trash: '))
			.map((line) => line.slice(line.indexOf(': ', line.indexOf(' sent to the trash')) + 2))
		expect({
			handover: existsSync(handover),
			clone: existsSync(clone),
			trashed: trashed.map(
				(path) =>
					trashes.findIndex((trash) => path.startsWith(`${trash}/`)) !== -1 && existsSync(path),
			),
			clonesTrash: trashed.some((path) => path.startsWith(`${trashes[1]}/`)),
			removals: recording.calls
				.filter((call) => call.command === 'rm')
				.map((call) => call.args.at(-1))
				.sort(),
		}).toEqual({
			handover: false,
			clone: false,
			trashed: [true, true],
			clonesTrash: true,
			removals: [...trashed].sort(),
		})
	})

	it('--yes, a dead rehearsal clone in the workspace’s own scratch root → moved into the workspace’s .worktrees/_trash, the same volume, never a dialecte-trash beside it', async () => {
		const { workspace } = createWorkspace()
		const scratchRoot = join(workspace, '.worktrees', '_scratch')
		const clone = makeRehearsalFolder({
			scratchRoot,
			name: 'dialecte-rehearse-dead',
			pid: deadPid(),
		})
		const recording = createRecordingSpawner()

		const result = await runWorktreePrune({
			argv: ['--root', workspace, '--yes'],
			cwd: workspace,
			scratchRoot,
			isTerminal: true,
			confirm: async () => true,
			spawner: recording.spawner,
		})

		const trashed = result.output
			.split('\n')
			.filter((line) => line.includes(' sent to the trash: '))
			.map((line) => line.slice(line.indexOf(': ', line.indexOf(' sent to the trash')) + 2))
		expect({
			clone: existsSync(clone),
			trashed: trashed.map((path) =>
				path.startsWith(`${join(workspace, '.worktrees', '_trash')}/`),
			),
			besideIt: existsSync(join(scratchRoot, 'dialecte-trash')),
		}).toEqual({ clone: false, trashed: [true], besideIt: false })
	})

	it('--yes, a hand-over folder the trash cannot take → a cross line naming why, the folder left where it is', async () => {
		const { workspace, worktrees } = createPruneWorkspace()
		git({ root: worktrees.pending, args: ['add', 'CHANGELOG.md'] })
		git({ root: worktrees.pending, args: ['commit', '-q', '-m', 'docs(changelog): pending'] })
		writeFileSync(join(workspace, '.worktrees', '_trash'), 'not a folder\n')
		const handover = join(workspace, '_commit-plan', 'pending-topic')

		const result = await runWorktreePrune({
			argv: ['--root', workspace, '--yes'],
			cwd: workspace,
			scratchRoot: temporaryFolder('dialecte-scratch-root-'),
			isTerminal: true,
			confirm: async () => true,
			spawner: createRecordingSpawner().spawner,
		})

		expect({
			exitCode: result.exitCode,
			line: result.output.split('\n').some((line) => line.startsWith(`✗ ${handover}: `)),
			handover: existsSync(handover),
		}).toEqual({ exitCode: 1, line: true, handover: true })
	})

	it('--yes, a finished rehearsal clone whose scratch trash is a symbolic link → a cross line naming it, the clone left where it is', async () => {
		const { workspace } = createWorkspace()
		const scratchRoot = temporaryFolder('dialecte-scratch-root-')
		const clone = makeRehearsalClone({
			scratchRoot,
			name: 'dialecte-rehearse-dead',
			pid: deadPid(),
		})
		symlinkSync(temporaryFolder('dialecte-elsewhere-'), join(scratchRoot, 'dialecte-trash'))

		const result = await runWorktreePrune({
			argv: ['--root', workspace, '--yes'],
			cwd: workspace,
			scratchRoot,
			isTerminal: true,
			confirm: async () => true,
			spawner: createRecordingSpawner().spawner,
		})

		expect({
			exitCode: result.exitCode,
			line: result.output
				.split('\n')
				.some((line) => line.startsWith(`✗ ${clone}: `) && line.includes('symbolic link')),
			clone: existsSync(clone),
		}).toEqual({ exitCode: 1, line: true, clone: true })
	})

	it("a scratch root's trash holding two clones → counted on its own line, never listed nor touched", async () => {
		const { workspace } = createWorkspace()
		const scratchRoot = temporaryFolder('dialecte-scratch-root-')
		for (const name of [
			'dialecte-rehearse-a-20261117T100000',
			'dialecte-rehearse-b-20261117T100000',
		])
			mkdirSync(join(scratchRoot, 'dialecte-trash', name), { recursive: true })

		const result = await runWorktreePrune({
			argv: ['--root', workspace],
			cwd: workspace,
			scratchRoot,
			isTerminal: false,
			confirm: async () => true,
		})

		expect(result.output.split('\n')).toContain(
			`rehearsal trash: 2 folders in ${join(scratchRoot, 'dialecte-trash')}, being deleted or left over`,
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
				`  keep    worktree  ${join(workspace, '.worktrees', '0001-core-fresh')}  (feat/fresh: no commit of its own in its reflog)`,
				'  keep    branch  feat/started  (no commit of its own in its reflog)',
			]),
		)
		expect(result.output).not.toContain('git worktree remove')
		expect(result.output).not.toContain('git branch -d')
	})

	it('status.showUntrackedFiles=no in the repository config and an untracked file in a merged worktree → kept as uncommitted all the same', async () => {
		const { workspace, core, worktrees } = createPruneWorkspace()
		writeFiles({ root: worktrees.merged, files: { 'scratch.txt': 'not committed\n' } })
		git({ root: core, args: ['config', 'status.showUntrackedFiles', 'no'] })

		await expect(
			runWorktreePrune({
				argv: ['--root', workspace],
				cwd: workspace,
				scratchRoot: temporaryFolder('dialecte-scratch-root-'),
				isTerminal: false,
				confirm: async () => true,
			}),
		).resolves.toEqual({
			exitCode: 0,
			output: expect.stringContaining(
				`  keep    worktree  ${worktrees.merged}  (feat/merged: uncommitted changes)`,
			),
		})
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
				trashMove({
					trash: join(scratchRoot, 'dialecte-trash'),
					folder: join(scratchRoot, 'dialecte-rehearse-dead'),
				}),
			]),
		)
		expect(result.output).not.toContain(
			`mv ${shellQuote(join(scratchRoot, 'dialecte-rehearse-live'))}`,
		)
		expect(result.output).not.toContain(
			`mv ${shellQuote(join(scratchRoot, 'dialecte-rehearse-bare'))}`,
		)
	})

	it('rehearsal folders (the clone inside, named as its repository) in the scratch root, and a clone of an earlier cli in the former temporary folder → each found by its marker: the dead ones removed from their own root, the live one kept', async () => {
		const { workspace } = createWorkspace()
		const scratchRoot = temporaryFolder('dialecte-scratch-root-')
		const formerScratchRoot = temporaryFolder('dialecte-former-root-')
		makeRehearsalFolder({ scratchRoot, name: 'dialecte-rehearse-dead', pid: deadPid() })
		makeRehearsalFolder({ scratchRoot, name: 'dialecte-rehearse-live', pid: process.pid })
		makeRehearsalClone({
			scratchRoot: formerScratchRoot,
			name: 'dialecte-rehearse-former',
			pid: deadPid(),
		})

		const result = await runWorktreePrune({
			argv: ['--root', workspace],
			cwd: workspace,
			scratchRoot,
			formerScratchRoot,
			isTerminal: false,
			confirm: async () => true,
		})

		expect(result.output.split('\n')).toEqual(
			expect.arrayContaining([
				`  remove  ${join(scratchRoot, 'dialecte-rehearse-dead')}`,
				`  keep    ${join(scratchRoot, 'dialecte-rehearse-live')}  (its rehearsal still runs: pid ${process.pid})`,
				`  remove  ${join(formerScratchRoot, 'dialecte-rehearse-former')}`,
				trashMove({
					trash: join(scratchRoot, 'dialecte-trash'),
					folder: join(scratchRoot, 'dialecte-rehearse-dead'),
				}),
				trashMove({
					trash: join(formerScratchRoot, 'dialecte-trash'),
					folder: join(formerScratchRoot, 'dialecte-rehearse-former'),
				}),
			]),
		)
		expect(result.output).not.toContain(
			`mv ${shellQuote(join(scratchRoot, 'dialecte-rehearse-live'))}`,
		)
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

		expect(result.output).toContain(
			'  keep    branch  feat/reset  (1 commit(s) its removal would lose: ',
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
		const added = runWorktreeAdd({
			argv: [core, 'feat/flooded', '--json'],
			cwd: workspace,
			now: new Date(),
			colour: false,
		})
		expect(added.exitCode).toBe(0)
		const flooded = (JSON.parse(added.output) as { worktree: string }).worktree
		expect(flooded).toBe(join(workspace, '.worktrees', '0005-core-flooded'))
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

/** The pid of the process a case says works in a folder. */
const AGENT_PID = 4242

/** A marker's start two days before now: a scratch folder old enough to go. */
function twoDaysAgo(): string {
	return new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
}

/** The lots of the `pending` worktree committed: its hand-over folder `_commit-plan/pending-topic` is committed. */
function commitPendingHandover(params: { workspace: string; pending: string }): string {
	git({ root: params.pending, args: ['add', 'CHANGELOG.md'] })
	git({ root: params.pending, args: ['commit', '-q', '-m', 'docs(changelog): pending'] })
	return join(params.workspace, '_commit-plan', 'pending-topic')
}

/** A scratch folder `name` in `root` with its `scratch.json`, made by a process gone two days ago: its path. */
function makeScratchFolder(params: { root: string; name: string }): string {
	const folder = join(params.root, params.name)
	mkdirSync(folder, { recursive: true })
	writeFileSync(
		join(folder, 'scratch.json'),
		JSON.stringify({ pid: deadPid(), startedAt: twoDaysAgo(), command: 'dialecte gate --fast' }),
	)
	return folder
}

/** A `_pool-x-1/node_modules` with no pool.json in `worktreesFolder`, last written two hours ago: its path. */
function makePoolLeftOver(worktreesFolder: string): string {
	const folder = join(worktreesFolder, '_pool-x-1')
	mkdirSync(join(folder, 'node_modules'), { recursive: true })
	writeFileSync(join(folder, 'node_modules', 'file.txt'), 'half parked\n')
	const written = new Date(Date.now() - 2 * 60 * 60 * 1000)
	utimesSync(folder, written, written)
	return folder
}

/** Whether `refs/heads/<branch>` is in `repository`. */
function hasBranch(params: { repository: string; branch: string }): boolean {
	return (
		git({
			root: params.repository,
			args: ['for-each-ref', '--format=%(refname)', `refs/heads/${params.branch}`],
		}).trim() !== ''
	)
}

/** `worktree prune --yes` over `workspace`, `confirm` doing `atConfirm` before it says yes; a throw read as a line. */
async function pruneAtConfirm(params: {
	workspace: string
	atConfirm: () => void
	listProcesses: () => ProcessFolder[] | string
	scratchRoot?: string
	scratchFolderRoot?: string
}): Promise<{ exitCode: number; lines: string[]; questions: string[] }> {
	const questions: string[] = []
	try {
		const result = await runWorktreePrune({
			argv: ['--root', params.workspace, '--yes'],
			cwd: params.workspace,
			scratchRoot: params.scratchRoot ?? temporaryFolder('dialecte-scratch-root-'),
			scratchFolderRoot: params.scratchFolderRoot,
			isTerminal: true,
			confirm: async function confirmAfter(question) {
				questions.push(question)
				params.atConfirm()
				return true
			},
			listProcesses: params.listProcesses,
			readStartTime: () => undefined,
			spawner: createRecordingSpawner().spawner,
		})
		return { exitCode: result.exitCode, lines: result.output.split('\n'), questions }
	} catch (error) {
		// a run must answer, never throw: what it threw read as a line no case expects
		return { exitCode: -1, lines: [`thrown: ${(error as Error).message}`], questions }
	}
}

/** The plan of `worktree prune` over `workspace` (no `--yes`), the processes as `listProcesses` says. */
async function planLinesOf(params: {
	workspace: string
	listProcesses: () => ProcessFolder[] | string
}): Promise<string[]> {
	const result = await runWorktreePrune({
		argv: ['--root', params.workspace],
		cwd: params.workspace,
		scratchRoot: temporaryFolder('dialecte-scratch-root-'),
		isTerminal: false,
		confirm: async () => false,
		listProcesses: params.listProcesses,
		readStartTime: () => undefined,
	})
	expect(result.exitCode).toBe(0)
	return result.output.split('\n')
}

/** No process anywhere. */
function noProcess(): ProcessFolder[] {
	return []
}

/** A lister that cannot list the processes. */
function throwingLister(): ProcessFolder[] {
	throw new Error('lsof failed')
}

describe(
	'worktree prune: hand-over folders and every kind decided again',
	{
		timeout: WORKSPACE_CASE_TIMEOUT,
	},
	() => {
		it('a committed hand-over folder a process works in → kept at the plan, naming the pid, no move command', async () => {
			const { workspace, worktrees } = createPruneWorkspace()
			const handover = commitPendingHandover({ workspace, pending: worktrees.pending })

			const lines = await planLinesOf({
				workspace,
				listProcesses: () => [{ pid: AGENT_PID, folder: realpathSync(handover) }],
			})

			expect({
				kept: lines.includes(
					`  keep    hand-over  ${handover}  (a process works in it: pid ${AGENT_PID})`,
				),
				moved: lines.some((line) => line.includes(`mv ${shellQuote(handover)}`)),
			}).toEqual({ kept: true, moved: false })
		})

		it('a committed hand-over folder reached by a link, the processes not listable → kept with the link text, never the processes text', async () => {
			// guard: the link rule is asked before the processes, so the reason stays the link's
			const { workspace, worktrees } = createPruneWorkspace()
			const handover = commitPendingHandover({ workspace, pending: worktrees.pending })
			const link = join(workspace, 'to-the-plan')
			symlinkSync(handover, link)

			const lines = await planLinesOf({ workspace, listProcesses: throwingLister })

			const handoverLines = lines.filter((line) => line.includes(`hand-over  ${handover}`))
			expect(handoverLines).toEqual([
				`  keep    hand-over  ${handover}  (the link ${link} points to it)`,
			])
		})

		it('a committed hand-over folder no link reaches, the processes not listable → kept with the processes text, no move command', async () => {
			const { workspace, worktrees } = createPruneWorkspace()
			const handover = commitPendingHandover({ workspace, pending: worktrees.pending })

			const lines = await planLinesOf({ workspace, listProcesses: throwingLister })

			const handoverLines = lines.filter((line) => line.includes(handover))
			expect(handoverLines).toEqual([
				`  keep    hand-over  ${handover}  (the processes are not known (lsof failed): nothing is moved)`,
			])
		})

		it('a committed hand-over folder planned to go, a process entering it at confirm → ✗ kept naming the pid, the folder left, exit 1', async () => {
			const { workspace, worktrees } = createPruneWorkspace()
			const handover = commitPendingHandover({ workspace, pending: worktrees.pending })
			let processes: ProcessFolder[] = []

			const result = await pruneAtConfirm({
				workspace,
				atConfirm: function processEnters() {
					processes = [{ pid: AGENT_PID, folder: realpathSync(handover) }]
				},
				listProcesses: () => processes,
			})

			expect({
				exitCode: result.exitCode,
				line: result.lines.includes(`✗ ${handover} kept: a process works in it: pid ${AGENT_PID}`),
				handover: existsSync(handover),
			}).toEqual({ exitCode: 1, line: true, handover: true })
		})

		it('a committed hand-over folder planned to go, a link to it made at confirm → ✗ kept naming the link, the folder left, exit 1', async () => {
			const { workspace, worktrees } = createPruneWorkspace()
			const handover = commitPendingHandover({ workspace, pending: worktrees.pending })
			const link = join(workspace, 'to-the-plan')

			const result = await pruneAtConfirm({
				workspace,
				atConfirm: function linkMade() {
					symlinkSync(handover, link)
				},
				listProcesses: noProcess,
			})

			expect({
				exitCode: result.exitCode,
				line: result.lines.includes(`✗ ${handover} kept: the link ${link} points to it`),
				handover: existsSync(handover),
			}).toEqual({ exitCode: 1, line: true, handover: true })
		})

		it('a merged branch with no worktree planned to go, a pending hand-over on it written at confirm → ✗ kept: a hand-over is pending on it, the branch left, exit 1', async () => {
			const { workspace, core } = createPruneWorkspace()
			const plan = join(workspace, '_commit-plan', 'late-topic')

			const result = await pruneAtConfirm({
				workspace,
				atConfirm: function handoverWritten() {
					mkdirSync(plan, { recursive: true })
					writeFileSync(
						join(plan, 'lots.json'),
						JSON.stringify({
							repository: core,
							branch: 'old-merged',
							head: git({ root: core, args: ['rev-parse', 'old-merged'] }).trim(),
							lots: [{ paths: ['CHANGELOG.md'], message: 'docs(changelog): late' }],
						}),
					)
					writeFileSync(join(plan, 'commit.sh'), '#!/bin/sh\n')
					for (const name of ['files.txt', 'files.sha256', 'files.deleted', 'lots.sha256'])
						writeFileSync(join(plan, name), name === 'files.txt' ? 'CHANGELOG.md\n' : '')
				},
				listProcesses: noProcess,
			})

			expect({
				exitCode: result.exitCode,
				line: result.lines.includes('✗ old-merged kept: a hand-over is pending on it'),
				branch: hasBranch({ repository: core, branch: 'old-merged' }),
			}).toEqual({ exitCode: 1, line: true, branch: true })
		})

		it('a branch merged into main only at confirm → never removed nor printed; the planned items moved as planned, exit 0; a plan afterwards offers it', async () => {
			// guard: an item the fresh plan offers that the first did not is covered by no confirmation
			const { workspace, core, worktrees } = createPruneWorkspace()
			git({ root: core, args: ['checkout', '-q', '-b', 'feat/late'] })
			commitIn({ root: core, file: 'src/late.ts', message: 'feat: late' })
			git({ root: core, args: ['checkout', '-q', 'main'] })

			const result = await pruneAtConfirm({
				workspace,
				atConfirm: function mergedNow() {
					git({ root: core, args: ['merge', '-q', '--ff-only', 'feat/late'] })
				},
				listProcesses: noProcess,
			})
			const after = await planLinesOf({ workspace, listProcesses: noProcess })

			expect({
				exitCode: result.exitCode,
				printed: result.lines.some((line) => line.includes('feat/late')),
				late: hasBranch({ repository: core, branch: 'feat/late' }),
				planned: [
					existsSync(worktrees.merged),
					hasBranch({ repository: core, branch: 'feat/merged' }),
					hasBranch({ repository: core, branch: 'old-merged' }),
				],
				offeredAfter: after.includes(`cd '${core}' && git branch -d 'feat/late'`),
			}).toEqual({
				exitCode: 0,
				printed: false,
				late: true,
				planned: [false, false, false],
				offeredAfter: true,
			})
		})

		it('_commit-plan unreadable at confirm → every planned removal ✗ not decided again, nothing moved, exit 1, no throw', async () => {
			const { workspace, core, worktrees } = createPruneWorkspace()
			const plans = join(workspace, '_commit-plan')

			let result: Awaited<ReturnType<typeof pruneAtConfirm>>
			try {
				result = await pruneAtConfirm({
					workspace,
					atConfirm: function unreadable() {
						chmodSync(plans, 0o000)
					},
					listProcesses: noProcess,
				})
			} finally {
				chmodSync(plans, 0o755)
			}

			expect({
				exitCode: result.exitCode,
				lines: [worktrees.merged, 'feat/merged', 'old-merged'].map((name) =>
					result.lines.some((line) => line.startsWith(`✗ ${name}: not decided again: `)),
				),
				moved: [
					existsSync(worktrees.merged),
					hasBranch({ repository: core, branch: 'feat/merged' }),
					hasBranch({ repository: core, branch: 'old-merged' }),
				],
			}).toEqual({ exitCode: 1, lines: [true, true, true], moved: [true, true, true] })
		})

		it('the scratch root unreadable at confirm → every planned removal ✗ not decided again, nothing moved, exit 1, no throw', async () => {
			const { workspace, core, worktrees } = createPruneWorkspace()
			const scratchFolderRoot = join(workspace, '.worktrees', '_scratch')
			mkdirSync(scratchFolderRoot, { recursive: true })

			let result: Awaited<ReturnType<typeof pruneAtConfirm>>
			try {
				result = await pruneAtConfirm({
					workspace,
					scratchFolderRoot,
					atConfirm: function unreadable() {
						chmodSync(scratchFolderRoot, 0o000)
					},
					listProcesses: noProcess,
				})
			} finally {
				chmodSync(scratchFolderRoot, 0o755)
			}

			expect({
				exitCode: result.exitCode,
				lines: [worktrees.merged, 'feat/merged', 'old-merged'].map((name) =>
					result.lines.some((line) => line.startsWith(`✗ ${name}: not decided again: `)),
				),
				moved: [
					existsSync(worktrees.merged),
					hasBranch({ repository: core, branch: 'feat/merged' }),
					hasBranch({ repository: core, branch: 'old-merged' }),
				],
			}).toEqual({ exitCode: 1, lines: [true, true, true], moved: [true, true, true] })
		})

		it('every kind planned to go, nothing changed at confirm → each moved as today, exit 0', async () => {
			// guard: the re-plan agrees with the plan when nothing changed, so every item still moves
			const { workspace, core, worktrees } = createPruneWorkspace()
			const handover = commitPendingHandover({ workspace, pending: worktrees.pending })
			const scratchRoot = temporaryFolder('dialecte-scratch-root-')
			const clone = makeRehearsalClone({
				scratchRoot,
				name: 'dialecte-rehearse-dead',
				pid: deadPid(),
			})
			const hookFolder = makeScratchFolder({ root: scratchRoot, name: 'dlt-hook-abc' })
			const scratchFolderRoot = join(workspace, '.worktrees', '_scratch')
			const scratchFolder = makeScratchFolder({
				root: scratchFolderRoot,
				name: 'dialecte-gate-scope-abc',
			})
			const leftOver = makePoolLeftOver(join(workspace, '.worktrees'))

			const result = await pruneAtConfirm({
				workspace,
				scratchRoot,
				scratchFolderRoot,
				atConfirm: () => undefined,
				listProcesses: noProcess,
			})

			expect({
				exitCode: result.exitCode,
				questions: result.questions,
				crosses: result.lines.filter((line) => line.startsWith('✗')),
				left: [worktrees.merged, handover, clone, hookFolder, scratchFolder, leftOver].filter(
					(folder) => existsSync(folder),
				),
				branches: ['feat/merged', 'old-merged'].filter((branch) =>
					hasBranch({ repository: core, branch }),
				),
			}).toEqual({
				exitCode: 0,
				questions: ['Remove these 8 item(s)? [y/N] '],
				crosses: [],
				left: [],
				branches: [],
			})
		})
	},
)
