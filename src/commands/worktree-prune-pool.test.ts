import {
	existsSync,
	mkdirSync,
	readdirSync,
	realpathSync,
	utimesSync,
	writeFileSync,
} from 'node:fs'
import { join } from 'node:path'

import { git, initializeRepository, temporaryFolder } from '../../test/scratch-repository.ts'
import { LOCK_TEXT, POOL_COMMAND_CASE_MS } from '../../test/worktree-pool.constants.ts'
import { createRecordingSpawner, poolEntryOf, writePoolEntry } from '../../test/worktree-pool.ts'
import { shellQuote } from '../lib/shell-quote.ts'
import { runWorktreePrune } from './worktree.ts'

import { describe, expect, it } from 'vitest'

import type { ProcessFolder } from '../lib/worktree/worktree.types.ts'

describe('worktree prune: the pool and the trash', { timeout: POOL_COMMAND_CASE_MS }, () => {
	it('_pool-cli-1, _pool-core-1 and a _trash/ holding a worktree and two folders → none listed as a worktree nor touched; one pool line, one trash line', async () => {
		const workspace = realpathSync(temporaryFolder('dialecte-prune-pool-'))
		const cli = initializeRepository({ root: join(workspace, 'cli') })
		initializeRepository({ root: join(workspace, 'core') })
		const worktreesFolder = join(workspace, '.worktrees')
		mkdirSync(join(worktreesFolder, '_trash'), { recursive: true })
		// a merged, clean worktree that was sent to the trash: git still registers it, prune must not list it
		const worktree = join(worktreesFolder, '0001-cli-x')
		git({ root: cli, args: ['worktree', 'add', '-q', '-b', 'feat/x', worktree] })
		const trashedWorktree = join(worktreesFolder, '_trash', '0001-cli-x-20261106T100000')
		git({ root: cli, args: ['worktree', 'move', worktree, trashedWorktree] })
		for (const name of ['x', 'y']) {
			mkdirSync(join(worktreesFolder, '_trash', name))
			writeFileSync(join(worktreesFolder, '_trash', name, 'left.txt'), 'left\n')
		}
		for (const repository of ['cli', 'core'])
			writePoolEntry({
				worktreesFolder,
				name: `_pool-${repository}-1`,
				entry: poolEntryOf({
					repository,
					lock: LOCK_TEXT,
					parkedAt: '2026-11-06T09:00:00.000Z',
				}),
			})

		const result = await runWorktreePrune({
			argv: ['--root', workspace],
			cwd: workspace,
			scratchRoot: temporaryFolder('dialecte-scratch-root-'),
			isTerminal: false,
			confirm: async () => true,
		})

		expect(result.exitCode).toBe(0)
		const lines = result.output.split('\n')
		expect(lines).toEqual(
			expect.arrayContaining([
				'pool: 2 entries (cli 1, core 1)',
				'trash: 3 folders, being deleted or left over',
			]),
		)
		expect(lines.filter((line) => line.startsWith('pool:'))).toHaveLength(1)
		expect(lines.filter((line) => line.startsWith('trash:'))).toHaveLength(1)
		expect(result.output).not.toContain('_trash/')
		expect(result.output).not.toContain('_pool-')
		expect(existsSync(trashedWorktree)).toBe(true)
		expect(existsSync(join(worktreesFolder, '_trash/x/left.txt'))).toBe(true)
		expect(existsSync(join(worktreesFolder, '_pool-cli-1/node_modules'))).toBe(true)
		expect(existsSync(join(worktreesFolder, '_pool-core-1/node_modules'))).toBe(true)
	})

	it('a _pool-x-1/node_modules with no pool.json (a park that never finished) → reported as left over, named, and left where it is', async () => {
		const workspace = realpathSync(temporaryFolder('dialecte-prune-pool-'))
		initializeRepository({ root: join(workspace, 'cli') })
		const worktreesFolder = join(workspace, '.worktrees')
		mkdirSync(join(worktreesFolder, '_pool-x-1', 'node_modules'), { recursive: true })
		writeFileSync(join(worktreesFolder, '_pool-x-1', 'node_modules', 'file.txt'), 'half parked\n')

		const result = await runWorktreePrune({
			argv: ['--root', workspace],
			cwd: workspace,
			scratchRoot: temporaryFolder('dialecte-scratch-root-'),
			isTerminal: false,
			confirm: async () => true,
		})

		expect(result.exitCode).toBe(0)
		expect(result.output).toMatch(/_pool-x-1[^\n]*left over/)
		expect(existsSync(join(worktreesFolder, '_pool-x-1/node_modules/file.txt'))).toBe(true)
	})

	/** A `_pool-x-1/node_modules` with no pool.json in a new workspace, its folder last written `ageMinutes` ago. */
	function createLeftOver(ageMinutes: number): {
		workspace: string
		worktreesFolder: string
		folder: string
	} {
		const workspace = realpathSync(temporaryFolder('dialecte-prune-pool-'))
		initializeRepository({ root: join(workspace, 'cli') })
		const worktreesFolder = join(workspace, '.worktrees')
		const folder = join(worktreesFolder, '_pool-x-1')
		mkdirSync(join(folder, 'node_modules'), { recursive: true })
		writeFileSync(join(folder, 'node_modules', 'file.txt'), 'half parked\n')
		const written = new Date(Date.now() - ageMinutes * 60 * 1000)
		utimesSync(folder, written, written)
		return { workspace, worktreesFolder, folder }
	}

	/** `worktree prune --yes` of `workspace` on a terminal, confirmed, with these processes and a recording spawner. */
	async function pruneConfirmed(params: { workspace: string; processes: ProcessFolder[] }) {
		const { spawner, calls } = createRecordingSpawner()
		function listProcesses(): ProcessFolder[] {
			return params.processes
		}
		const result = await runWorktreePrune({
			argv: ['--root', params.workspace, '--yes'],
			cwd: params.workspace,
			scratchRoot: temporaryFolder('dialecte-scratch-root-'),
			isTerminal: true,
			confirm: async () => true,
			listProcesses,
			spawner,
		})
		return { result, calls }
	}

	/** The `_trash/` entries of `worktreesFolder` a trashed `_pool-x-1` became. */
	function trashedLeftOvers(worktreesFolder: string): string[] {
		const trash = join(worktreesFolder, '_trash')
		return existsSync(trash)
			? readdirSync(trash).filter((name) => name.startsWith('_pool-x-1-'))
			: []
	}

	it('a _pool-x-1 with no pool.json, last written two hours ago, no process in it, prune --yes → sent to _trash/', async () => {
		const { workspace, worktreesFolder, folder } = createLeftOver(120)

		const { result, calls } = await pruneConfirmed({ workspace, processes: [] })

		const inTrash = trashedLeftOvers(worktreesFolder)
		expect({
			exitCode: result.exitCode,
			line: result.output,
			inPlace: existsSync(join(folder, 'node_modules/file.txt')),
			inTrash,
			removals: calls,
		}).toEqual({
			exitCode: 0,
			line: expect.stringMatching(/_pool-x-1[^\n]*left over[^\n]*to the trash/),
			inPlace: false,
			inTrash: [expect.any(String)],
			removals: [
				{ command: 'rm', args: ['-rf', join(worktreesFolder, '_trash', inTrash[0] ?? '')] },
			],
		})
	})

	it('a _pool-x-1 with no pool.json, last written two hours ago, prune --json → its command moves it into _trash/, never an rm -rf a person could copy', async () => {
		const { workspace, worktreesFolder, folder } = createLeftOver(120)

		const result = await runWorktreePrune({
			argv: ['--root', workspace, '--json'],
			cwd: workspace,
			scratchRoot: temporaryFolder('dialecte-scratch-root-'),
			isTerminal: false,
			confirm: async () => false,
			listProcesses: function noProcesses(): ProcessFolder[] {
				return []
			},
		})
		const plan = JSON.parse(result.output) as { poolLeftOver: { name: string; command?: string }[] }

		expect({
			command: plan.poolLeftOver.find((item) => item.name === folder)?.command,
			inPlace: existsSync(join(folder, 'node_modules/file.txt')),
		}).toEqual({
			command: `cd ${shellQuote(worktreesFolder)} && mkdir -p _trash && mv ${shellQuote('_pool-x-1')} _trash/`,
			inPlace: true,
		})
	})

	const KEPT_LEFT_OVERS = [
		{
			title: 'a _pool-x-1 with no pool.json written just now (a park writing it)',
			ageMinutes: 0,
			pids: [],
			line: /_pool-x-1[^\n]*left over[^\n]*kept: [^\n]*park in progress/,
		},
		{
			title:
				'a _pool-x-1 with no pool.json, last written two hours ago, a live process working in it',
			ageMinutes: 120,
			pids: [4242],
			line: /_pool-x-1[^\n]*left over[^\n]*kept: [^\n]*4242/,
		},
	]
	for (const leftOver of KEPT_LEFT_OVERS)
		it(`${leftOver.title}, prune --yes → kept, named with why`, async () => {
			const { workspace, worktreesFolder, folder } = createLeftOver(leftOver.ageMinutes)

			const { result, calls } = await pruneConfirmed({
				workspace,
				processes: leftOver.pids.map((pid) => ({ pid, folder: join(folder, 'node_modules') })),
			})

			expect({
				exitCode: result.exitCode,
				line: result.output,
				inPlace: existsSync(join(folder, 'node_modules/file.txt')),
				inTrash: trashedLeftOvers(worktreesFolder),
				removals: calls,
			}).toEqual({
				exitCode: 0,
				line: expect.stringMatching(leftOver.line),
				inPlace: true,
				inTrash: [],
				removals: [],
			})
		})
})
