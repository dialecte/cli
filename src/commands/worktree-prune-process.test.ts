/**
 * `worktree prune` (the plan, no `--reclaim`): a worktree a process works in is kept, and its ignored entries are read
 * the way `lot close` reads them (`removableIgnored`): a `.dialecte/lot` view keeps nothing, a note under `.dialecte/`
 * keeps the worktree, named. Every worktree of a case is merged and clean, so the rule under test is the only one that
 * may keep it.
 */
import { mkdirSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import {
	git,
	initializeRepository,
	temporaryFolder,
	writeFiles,
} from '../../test/scratch-repository.ts'
import { runWorktreeAdd, runWorktreePrune } from './worktree.ts'

import { describe, expect, it } from 'vitest'

import type { ProcessFolder } from '../lib/worktree/worktree.types.ts'

/** Scratch repositories and worktrees: seconds on a loaded machine, never a measure of speed. */
const SCRATCH_WORKSPACE_TIMEOUT = 60_000

/** The pid of the process a case says works in a worktree. */
const AGENT_PID = 4242

/** Why the processes are not known, as a lister answers it. */
const PROCESSES_UNKNOWN = 'the processes cannot be listed: lsof failed'

/** A workspace holding the repository `core` on `main` with one commit, and a merged clean worktree of it. */
function createMergedWorktree(): { workspace: string; core: string; worktree: string } {
	const workspace = temporaryFolder('dialecte-prune-process-')
	const core = initializeRepository({
		root: join(workspace, 'core'),
		files: { '.gitignore': 'node_modules\n', 'src/index.ts': 'export {}\n' },
	})
	const added = runWorktreeAdd({
		argv: [core, 'feat/agent', '--json'],
		cwd: workspace,
		now: new Date(),
		colour: false,
	})
	expect(added.exitCode).toBe(0)
	const { worktree } = JSON.parse(added.output) as { worktree: string }
	writeFiles({ root: worktree, files: { 'src/agent.ts': 'export {}\n' } })
	git({ root: worktree, args: ['add', 'src/agent.ts'] })
	git({ root: worktree, args: ['commit', '-q', '-m', 'feat: agent'] })
	git({ root: core, args: ['merge', '-q', '--ff-only', 'feat/agent'] })
	return { workspace, core, worktree }
}

/** The worktree's `.dialecte/lot` view: a link to a folder outside it, as `lot start` makes one. */
function addLotView(worktree: string): void {
	const lotFolder = temporaryFolder('dialecte-prune-process-lot-')
	mkdirSync(join(worktree, '.dialecte'), { recursive: true })
	symlinkSync(lotFolder, join(worktree, '.dialecte', 'lot'))
}

/** The plan of `worktree prune` over the workspace, the processes as `processes` says. */
async function planLines(params: {
	workspace: string
	processes: ProcessFolder[] | string
	scratchRoot?: string
}): Promise<string[]> {
	const result = await runWorktreePrune({
		argv: ['--root', params.workspace],
		cwd: params.workspace,
		scratchRoot: params.scratchRoot ?? temporaryFolder('dialecte-scratch-root-'),
		isTerminal: false,
		confirm: async () => false,
		listProcesses: function listed() {
			return params.processes
		},
	})
	expect(result.exitCode).toBe(0)
	return result.output.split('\n')
}

/** A rehearsal clone `dialecte-rehearse-<name>` in `scratchRoot` whose marker holds `marker` as written: its path. */
function rehearsalCloneWith(params: { scratchRoot: string; name: string; marker: string }): string {
	const clone = join(params.scratchRoot, `dialecte-rehearse-${params.name}`)
	mkdirSync(join(clone, '.git'), { recursive: true })
	writeFileSync(join(clone, '.git', 'dialecte-rehearsal.json'), params.marker)
	return clone
}

/** The plan line keeping the worktree `worktree` on `feat/agent` for `reason`. */
function keptLine(params: { worktree: string; reason: string }): string {
	return `  keep    worktree  ${params.worktree}  (feat/agent: ${params.reason})`
}

describe(
	'worktree prune: a process working in a worktree, and its ignored entries',
	{ timeout: SCRATCH_WORKSPACE_TIMEOUT },
	() => {
		it('a clean merged worktree an agent works in, holding only its .dialecte/lot view → kept, the pid named, no removal command', async () => {
			const { workspace, worktree } = createMergedWorktree()
			addLotView(worktree)

			const lines = await planLines({
				workspace,
				// lsof and /proc report real paths
				processes: [{ pid: AGENT_PID, folder: join(realpathSync(worktree), 'src') }],
			})

			expect({
				kept: lines.includes(
					keptLine({ worktree, reason: `a process works in it: pid ${AGENT_PID}` }),
				),
				removed: lines.some((line) => line.includes(`git worktree remove '${worktree}'`)),
			}).toEqual({ kept: true, removed: false })
		})

		it('a clean merged worktree, the processes not known → kept with why, no removal command', async () => {
			const { workspace, worktree } = createMergedWorktree()

			const lines = await planLines({ workspace, processes: PROCESSES_UNKNOWN })

			expect({
				kept: lines.includes(keptLine({ worktree, reason: PROCESSES_UNKNOWN })),
				removed: lines.some((line) => line.includes(`git worktree remove '${worktree}'`)),
			}).toEqual({ kept: true, removed: false })
		})

		it('a clean merged worktree holding an ignored .dialecte/notes.md → kept, the note named', async () => {
			const { workspace, worktree } = createMergedWorktree()
			addLotView(worktree)
			writeFiles({ root: worktree, files: { '.dialecte/notes.md': 'mine\n' } })

			const lines = await planLines({ workspace, processes: [] })

			expect(lines).toContain(
				keptLine({
					worktree,
					reason: 'ignored files git worktree remove would delete: .dialecte/notes.md',
				}),
			)
		})

		it('a clean merged worktree holding only its .dialecte/lot view, no process in it → its removal command', async () => {
			const { workspace, core, worktree } = createMergedWorktree()
			addLotView(worktree)

			const lines = await planLines({ workspace, processes: [] })

			expect(lines).toContainEqual(
				expect.stringContaining(`cd '${core}' && git worktree remove '${worktree}'`),
			)
		})
		it('a rehearsal clone whose marker is unparsable → kept, as before the three-way reader', async () => {
			const { workspace } = createMergedWorktree()
			const scratchRoot = temporaryFolder('dialecte-scratch-root-')
			const clone = rehearsalCloneWith({ scratchRoot, name: 'broken', marker: '{"pid": 12' })

			const lines = await planLines({ workspace, processes: [], scratchRoot })

			expect(lines).toContain(
				`  keep    ${clone}  (no rehearsal marker: not made by this cli, or still starting)`,
			)
		})

		it('a rehearsal clone whose marker names a running pid at another start time → kept, as before the three-way reader', async () => {
			const { workspace } = createMergedWorktree()
			const scratchRoot = temporaryFolder('dialecte-scratch-root-')
			const clone = rehearsalCloneWith({
				scratchRoot,
				name: 'reused',
				marker: `${JSON.stringify({ pid: process.pid, startedAt: '2026-11-18T10:00:00.000Z', handover: '/h', startTime: 'Thu Jan  1 00:00:00 1970' })}\n`,
			})

			const lines = await planLines({ workspace, processes: [], scratchRoot })

			expect(lines).toContain(`  keep    ${clone}  (its rehearsal still runs: pid ${process.pid})`)
		})
	},
)
