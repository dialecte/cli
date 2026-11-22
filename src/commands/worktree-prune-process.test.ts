/**
 * `worktree prune` (the plan, no `--reclaim`): a worktree a process works in is kept, and its ignored entries are read
 * the way `lot close` reads them (`removableIgnored`): a `.dialecte/lot` view keeps nothing, a note under `.dialecte/`
 * keeps the worktree, named. Every worktree of a case is merged and clean, so the rule under test is the only one that
 * may keep it.
 */
import {
	chmodSync,
	existsSync,
	mkdirSync,
	realpathSync,
	renameSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs'
import { join } from 'node:path'

import { deadPid } from '../../test/dead-pid.ts'
import {
	damagedTextOf,
	damageLot,
	goneTextOf,
	keptTextOf,
	writeKeepLine,
} from '../../test/keep-decision-workspace.ts'
import { cancelLot, landingLotOf, removeLotWorktree } from '../../test/landing-lot.ts'
import { addRehearsalFolder } from '../../test/lot-prune-workspace.ts'
import {
	git,
	initializeRepository,
	temporaryFolder,
	writeFiles,
} from '../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { createRecordingSpawner } from '../../test/worktree-pool.ts'
import {
	handoverStoreOf,
	recordHandoverState,
	registerHandover,
} from '../lib/handover/handover-store.ts'
import { REHEARSAL_RUN_UNKNOWN } from '../lib/handover/live-handover-run.constants.ts'
import { shellQuote } from '../lib/shell-quote.ts'
import { runWorktreeAdd, runWorktreePrune } from './worktree.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { LandingLot } from '../../test/landing-lot.types.ts'
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

/** The plan of `worktree prune` over `workspace`, or what it threw (a plan must answer, never throw). */
async function planOutcome(params: {
	workspace: string
	scratchRoot: string
	listProcesses: () => ProcessFolder[] | string
}): Promise<{ exitCode: number; lines: string[] } | { thrown: string }> {
	try {
		const result = await runWorktreePrune({
			argv: ['--root', params.workspace],
			cwd: params.workspace,
			scratchRoot: params.scratchRoot,
			isTerminal: false,
			confirm: async () => false,
			listProcesses: params.listProcesses,
		})
		return { exitCode: result.exitCode, lines: result.output.split('\n') }
	} catch (error) {
		return { thrown: (error as Error).message }
	}
}

/** The plan line of the rehearsal clone `clone` (kept, or its move), or what the plan threw. */
function cloneLineOf(params: {
	outcome: { exitCode: number; lines: string[] } | { thrown: string }
	clone: string
}): string | { thrown: string } {
	const { outcome } = params
	if ('thrown' in outcome) return outcome
	return (
		outcome.lines.find(
			(line) => line.includes(` ${params.clone} `) || line.includes(shellQuote(params.clone)),
		) ?? `<no line for ${params.clone}>`
	)
}

/** A dead rehearsal clone `dialecte-rehearse-<name>` in `scratchRoot` whose marker names `handover`: its path. */
function deadCloneOf(params: { scratchRoot: string; name: string; handover: string }): string {
	return addRehearsalFolder({
		scratchRoot: params.scratchRoot,
		name: `dialecte-rehearse-${params.name}`,
		pid: deadPid(),
		handover: params.handover,
	})
}

/** `worktree prune --yes` over `workspace`, `confirm` doing `atConfirm` before it says yes; a throw read as a line. */
async function pruneYes(params: {
	workspace: string
	scratchRoot: string
	atConfirm: () => void
	listProcesses: () => ProcessFolder[] | string
}): Promise<{ exitCode: number; lines: string[] }> {
	let result: Awaited<ReturnType<typeof runWorktreePrune>>
	try {
		result = await runWorktreePrune({
			argv: ['--root', params.workspace, '--yes'],
			cwd: params.workspace,
			scratchRoot: params.scratchRoot,
			isTerminal: true,
			confirm: async function confirmAfter() {
				params.atConfirm()
				return true
			},
			listProcesses: params.listProcesses,
			spawner: createRecordingSpawner().spawner,
		})
	} catch (error) {
		// a run must answer, never throw: what it threw read as a line no case expects
		return { exitCode: -1, lines: [`thrown: ${(error as Error).message}`] }
	}
	return { exitCode: result.exitCode, lines: result.output.split('\n') }
}

/** No process anywhere. */
function noProcess(): ProcessFolder[] {
	return []
}

/** A hand-over folder of the workspace's `_commit-plan`, registered committed for the lot's worktree on `branch`. */
function commitPlanHandoverOf(params: { lot: LandingLot; branch: string }): string {
	const { lot } = params
	const folder = join(realpathSync(lot.workspace.workspace), '_commit-plan', 'alpha-topic')
	mkdirSync(folder, { recursive: true })
	registerHandover({ root: lot.worktree, folder, branch: params.branch, now: new Date() })
	recordHandoverState({
		store: handoverStoreOf(lot.workspace.repository),
		folder,
		state: 'committed',
	})
	return folder
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
		it('a rehearsal clone whose marker is unparsable → kept with the marker reader’s why', async () => {
			const { workspace } = createMergedWorktree()
			const scratchRoot = temporaryFolder('dialecte-scratch-root-')
			const clone = rehearsalCloneWith({ scratchRoot, name: 'broken', marker: '{"pid": 12' })

			const lines = await planLines({ workspace, processes: [], scratchRoot })

			expect(lines).toContain(`  keep    ${clone}  (${REHEARSAL_RUN_UNKNOWN.unparsable})`)
		})

		it('a rehearsal clone whose marker names a running pid at another start time, no process in it → its move command', async () => {
			const { workspace } = createMergedWorktree()
			const scratchRoot = temporaryFolder('dialecte-scratch-root-')
			const clone = rehearsalCloneWith({
				scratchRoot,
				name: 'reused',
				marker: `${JSON.stringify({ pid: process.pid, startedAt: '2026-11-18T10:00:00.000Z', handover: '/h', startTime: 'Thu Jan  1 00:00:00 1970' })}\n`,
			})

			const lines = await planLines({ workspace, processes: [], scratchRoot })

			expect(lines).toContainEqual(expect.stringContaining(`mv ${shellQuote(clone)} `))
		})
	},
)

describe(
	'worktree prune: a rehearsal clone, the shared clone decision',
	{ timeout: SCRATCH_WORKSPACE_TIMEOUT },
	() => {
		it('a dead clone a process works in → kept naming the pid, no move', async () => {
			const workspace = temporaryFolder('dialecte-prune-process-')
			const scratchRoot = temporaryFolder('dialecte-scratch-root-')
			const clone = deadCloneOf({ scratchRoot, name: 'worked-in', handover: '/h' })

			const outcome = await planOutcome({
				workspace,
				scratchRoot,
				listProcesses: function shellInTheClone() {
					return [{ pid: AGENT_PID, folder: join(realpathSync(clone), 'repo') }]
				},
			})

			expect(cloneLineOf({ outcome, clone })).toBe(
				`  keep    ${clone}  (a process works in it: pid ${AGENT_PID})`,
			)
		})

		it('a dead clone, the processes not known → kept with why, no move', async () => {
			const workspace = temporaryFolder('dialecte-prune-process-')
			const scratchRoot = temporaryFolder('dialecte-scratch-root-')
			const clone = deadCloneOf({ scratchRoot, name: 'processes-unknown', handover: '/h' })

			const outcome = await planOutcome({
				workspace,
				scratchRoot,
				listProcesses: function unknown() {
					return PROCESSES_UNKNOWN
				},
			})

			expect(cloneLineOf({ outcome, clone })).toBe(`  keep    ${clone}  (${PROCESSES_UNKNOWN})`)
		})

		it('a dead clone, a process lister that throws → kept as the processes not known, the plan answers', async () => {
			const workspace = temporaryFolder('dialecte-prune-process-')
			const scratchRoot = temporaryFolder('dialecte-scratch-root-')
			const clone = deadCloneOf({ scratchRoot, name: 'lister-throws', handover: '/h' })

			const outcome = await planOutcome({
				workspace,
				scratchRoot,
				listProcesses: function crashing(): ProcessFolder[] {
					throw new Error('lsof crashed')
				},
			})

			expect(cloneLineOf({ outcome, clone })).toEqual(
				expect.stringContaining(`  keep    ${clone}  (the processes are not known (lsof crashed)`),
			)
		})

		it('a clone folder that cannot be read → kept as unreadable with why, the plan answers', async () => {
			const workspace = temporaryFolder('dialecte-prune-process-')
			const scratchRoot = temporaryFolder('dialecte-scratch-root-')
			const clone = rehearsalCloneWith({
				scratchRoot,
				name: 'unreadable',
				marker: `${JSON.stringify({ pid: deadPid(), startedAt: '2026-11-18T10:00:00.000Z', handover: '/h' })}\n`,
			})
			chmodSync(clone, 0o000)
			try {
				const outcome = await planOutcome({ workspace, scratchRoot, listProcesses: noProcess })

				const line = cloneLineOf({ outcome, clone })

				expect({
					kept: typeof line === 'string' && line.startsWith(`  keep    ${clone}  (`),
					why: typeof line === 'string' && line.includes('EACCES'),
					thrown: typeof line === 'string' ? undefined : line.thrown,
				}).toEqual({ kept: true, why: true, thrown: undefined })
			} finally {
				chmodSync(clone, 0o755)
			}
		})

		it('--yes, a dead clone planned to go, a process entering it once confirmed → a cross line naming the pid, the clone left, exit 1', async () => {
			const workspace = temporaryFolder('dialecte-prune-process-')
			const scratchRoot = temporaryFolder('dialecte-scratch-root-')
			const clone = deadCloneOf({ scratchRoot, name: 'entered', handover: '/h' })
			let confirmed = false

			const run = await pruneYes({
				workspace,
				scratchRoot,
				atConfirm: function shellEnters() {
					confirmed = true
				},
				listProcesses: function shellOnceConfirmed() {
					return confirmed ? [{ pid: AGENT_PID, folder: realpathSync(clone) }] : []
				},
			})

			expect({
				exitCode: run.exitCode,
				cross: run.lines.includes(`✗ ${clone} kept: a process works in it: pid ${AGENT_PID}`),
				cloneLeft: existsSync(clone),
			}).toEqual({ exitCode: 1, cross: true, cloneLeft: true })
		})
		it('--yes, a dead clone planned to go, a link in the workspace reaching it made once confirmed → a cross line naming the link, the clone left, exit 1', async () => {
			const workspace = temporaryFolder('dialecte-prune-process-')
			const scratchRoot = temporaryFolder('dialecte-scratch-root-')
			const clone = deadCloneOf({ scratchRoot, name: 'linked-late', handover: '/h' })
			const link = join(workspace, 'rehearsal-link')

			const run = await pruneYes({
				workspace,
				scratchRoot,
				atConfirm: function linkTheClone() {
					symlinkSync(clone, link)
				},
				listProcesses: noProcess,
			})

			expect({
				exitCode: run.exitCode,
				cross: run.lines.includes(`✗ ${clone} kept: the link ${link} points to it`),
				cloneLeft: existsSync(clone),
			}).toEqual({ exitCode: 1, cross: true, cloneLeft: true })
		})

		it('--yes, a dead clone planned to go, removed once confirmed → a cross line, gone since the plan, exit 1', async () => {
			const workspace = temporaryFolder('dialecte-prune-process-')
			const scratchRoot = temporaryFolder('dialecte-scratch-root-')
			const clone = deadCloneOf({ scratchRoot, name: 'gone-late', handover: '/h' })

			const run = await pruneYes({
				workspace,
				scratchRoot,
				atConfirm: function removeTheClone() {
					rmSync(clone, { recursive: true })
				},
				listProcesses: noProcess,
			})

			expect({
				exitCode: run.exitCode,
				gone: run.lines.includes(`✗ ${clone}: gone since the plan`),
			}).toEqual({ exitCode: 1, gone: true })
		})
	},
)

describe(
	'worktree prune: a rehearsal clone of a store lot',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		afterEach(function restoreEnvironment() {
			vi.unstubAllEnvs()
		})

		it('a dead clone whose marker names a store lot kept on purpose → kept with the keep text', async () => {
			const lot = landingLotOf()
			writeKeepLine({ lotFolder: lot.lotFolder })
			const scratchRoot = temporaryFolder('dialecte-scratch-root-')
			const clone = deadCloneOf({ scratchRoot, name: 'kept', handover: lot.lotFolder })

			const outcome = await planOutcome({
				workspace: lot.workspace.workspace,
				scratchRoot,
				listProcesses: noProcess,
			})

			expect(cloneLineOf({ outcome, clone })).toBe(`  keep    ${clone}  (${keptTextOf()})`)
		})

		it('a dead clone whose marker names a damaged store lot → kept with the damaged text', async () => {
			const lot = landingLotOf()
			const damage = damageLot({ lotFolder: lot.lotFolder })
			const scratchRoot = temporaryFolder('dialecte-scratch-root-')
			const clone = deadCloneOf({ scratchRoot, name: 'damaged', handover: lot.lotFolder })

			const outcome = await planOutcome({
				workspace: lot.workspace.workspace,
				scratchRoot,
				listProcesses: noProcess,
			})

			expect(cloneLineOf({ outcome, clone })).toBe(
				`  keep    ${clone}  (${damagedTextOf({ name: lot.name, damage })})`,
			)
		})

		it('a dead clone of a committed _commit-plan hand-over of a kept lot’s worktree and branch, the hand-over folder and the worktree gone → kept with the keep text', async () => {
			const lot = landingLotOf()
			writeKeepLine({ lotFolder: lot.lotFolder })
			const handover = commitPlanHandoverOf({ lot, branch: lot.branch })
			const scratchRoot = temporaryFolder('dialecte-scratch-root-')
			const clone = deadCloneOf({ scratchRoot, name: 'handed-over', handover })
			rmSync(handover, { recursive: true })
			removeLotWorktree(lot)

			const outcome = await planOutcome({
				workspace: lot.workspace.workspace,
				scratchRoot,
				listProcesses: noProcess,
			})

			expect(cloneLineOf({ outcome, clone })).toBe(`  keep    ${clone}  (${keptTextOf()})`)
		})

		it('a dead clone of a committed _commit-plan hand-over of a kept lot’s worktree on another branch → its move command', async () => {
			// guard: an entry on the lot's worktree but another branch owns nothing; main moves the dead clone too
			const lot = landingLotOf()
			writeKeepLine({ lotFolder: lot.lotFolder })
			const handover = commitPlanHandoverOf({ lot, branch: 'feat/other' })
			const scratchRoot = temporaryFolder('dialecte-scratch-root-')
			const clone = deadCloneOf({ scratchRoot, name: 'other-branch', handover })
			rmSync(handover, { recursive: true })

			const outcome = await planOutcome({
				workspace: lot.workspace.workspace,
				scratchRoot,
				listProcesses: noProcess,
			})

			expect(cloneLineOf({ outcome, clone })).toEqual(
				expect.stringContaining(`mv ${shellQuote(clone)} `),
			)
		})

		it('a dead clone of a damaged lot moved aside by lot stop → its move command', async () => {
			// guard: a lot folder moved aside releases its clones (KEEP 3.7); main moves the dead clone too
			const lot = landingLotOf()
			damageLot({ lotFolder: lot.lotFolder })
			cancelLot(lot)
			const scratchRoot = temporaryFolder('dialecte-scratch-root-')
			const clone = deadCloneOf({ scratchRoot, name: 'aside', handover: lot.lotFolder })

			const outcome = await planOutcome({
				workspace: lot.workspace.workspace,
				scratchRoot,
				listProcesses: noProcess,
			})

			expect({
				movedAside: existsSync(lot.lotFolder),
				line: cloneLineOf({ outcome, clone }),
			}).toEqual({ movedAside: false, line: expect.stringContaining(`mv ${shellQuote(clone)} `) })
		})

		it('--yes, a dead clone of a lot planned to go, a keep written on the lot once confirmed → a cross line with the keep text, the clone left, exit 1', async () => {
			const lot = landingLotOf()
			const scratchRoot = temporaryFolder('dialecte-scratch-root-')
			const clone = deadCloneOf({ scratchRoot, name: 'kept-late', handover: lot.lotFolder })

			const run = await pruneYes({
				workspace: lot.workspace.workspace,
				scratchRoot,
				atConfirm: function keepTheLot() {
					writeKeepLine({ lotFolder: lot.lotFolder })
				},
				listProcesses: noProcess,
			})

			expect({
				exitCode: run.exitCode,
				cross: run.lines.includes(`✗ ${clone} kept: ${keptTextOf()}`),
				cloneLeft: existsSync(clone),
			}).toEqual({ exitCode: 1, cross: true, cloneLeft: true })
		})

		it('--yes, a dead clone of a lot planned to go, the lot folder moved out of the store once confirmed → a cross line, the lot gone since the plan, the clone left, exit 1', async () => {
			const lot = landingLotOf()
			const scratchRoot = temporaryFolder('dialecte-scratch-root-')
			const clone = deadCloneOf({ scratchRoot, name: 'owner-gone', handover: lot.lotFolder })

			const run = await pruneYes({
				workspace: lot.workspace.workspace,
				scratchRoot,
				atConfirm: function moveTheLotOut() {
					renameSync(lot.lotFolder, join(temporaryFolder('dialecte-moved-out-'), lot.name))
				},
				listProcesses: noProcess,
			})

			expect({
				exitCode: run.exitCode,
				cross: run.lines.includes(`✗ ${clone} kept: ${goneTextOf(lot.name)}`),
				cloneLeft: existsSync(clone),
			}).toEqual({ exitCode: 1, cross: true, cloneLeft: true })
		})
	},
)
