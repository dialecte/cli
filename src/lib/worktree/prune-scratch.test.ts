/** `worktree prune` sends to the trash a scratch folder whose process is gone and that is older than a day. */
import { existsSync, mkdirSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { deadPid } from '../../../test/dead-pid.ts'
import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { createRecordingSpawner } from '../../../test/worktree-pool.ts'
import { runWorktreePrune } from '../../commands/worktree.ts'
import { planPrune } from './prune-worktrees.ts'

import { describe, expect, it } from 'vitest'

import type { ProcessFolder } from './worktree.types.ts'

const NOW = new Date('2026-11-17T12:00:00.000Z')
const TWO_DAYS_AGO = '2026-11-15T12:00:00.000Z'
const AN_HOUR_AGO = '2026-11-17T11:00:00.000Z'

/** The pid of the process a case says works in a folder. */
const AGENT_PID = 4242

/** Why the processes are not known, as a lister answers it. */
const PROCESSES_UNKNOWN = 'the processes cannot be listed: lsof failed'

type TestCase = {
	pid: () => number
	startedAt: string
	/** What the plan says of the folder: its command moves it into the trash, or why it is kept. */
	expected: { kind: string; moved: boolean; kept: RegExp | undefined }
	only?: boolean
}

/** A workspace with its scratch root, holding one scratch folder made by `pid` at `startedAt`. */
function workspaceWithScratch(params: { pid: number; startedAt: string }): {
	workspace: string
	root: string
	folder: string
} {
	const workspace = temporaryFolder('dialecte-prune-scratch-')
	const root = join(workspace, '.worktrees', '_scratch')
	const folder = join(root, 'dialecte-gate-scope-abc')
	mkdirSync(folder, { recursive: true })
	writeFileSync(
		join(folder, 'scratch.json'),
		JSON.stringify({
			pid: params.pid,
			startedAt: params.startedAt,
			command: 'dialecte gate --fast',
		}),
	)
	return { workspace, root, folder }
}

/** The plan's item for the one scratch folder, reduced to its kind, whether it moves to the workspace trash, why kept. */
function plannedItem(params: { pid: number; startedAt: string }): {
	kind: string
	moved: boolean
	kept: string | undefined
} {
	const { workspace, root, folder } = workspaceWithScratch(params)
	const plan = planPrune({
		workspace,
		handoverFolders: [],
		scratchRoot: temporaryFolder('dialecte-rehearsal-root-'),
		scratchFolderRoot: root,
		now: NOW,
		listProcesses: () => [],
	})
	const item = plan.scratch.find((scratch) => scratch.name === folder)
	return {
		kind: item?.kind ?? 'none',
		moved: item?.command?.includes(join(workspace, '.worktrees', '_trash')) ?? false,
		kept: item?.kept,
	}
}

/** How many entries `folder` holds; none when it does not exist. */
function entriesOf(folder: string): number {
	return existsSync(folder) ? readdirSync(folder).length : 0
}

describe('worktree prune over the scratch root', () => {
	const testCases: Record<string, TestCase> = {
		'a folder whose process is gone, made two days ago → moved to the workspace trash': {
			pid: deadPid,
			startedAt: TWO_DAYS_AGO,
			expected: { kind: 'scratch folder', moved: true, kept: undefined },
		},
		'a folder whose process still runs, made two days ago → kept, naming its pid': {
			pid: () => process.pid,
			startedAt: TWO_DAYS_AGO,
			expected: { kind: 'scratch folder', moved: false, kept: new RegExp(`pid ${process.pid}`) },
		},
		'a folder whose process is gone, made an hour ago → kept for a day': {
			pid: deadPid,
			startedAt: AN_HOUR_AGO,
			expected: { kind: 'scratch folder', moved: false, kept: /kept for a day/ },
		},
	}

	it.each(Object.entries(testCases))('%s', (_name, testCase) => {
		const { kept, ...rest } = testCase.expected
		expect(plannedItem({ pid: testCase.pid(), startedAt: testCase.startedAt })).toEqual({
			...rest,
			kept: kept === undefined ? undefined : expect.stringMatching(kept),
		})
	})

	it('prune --yes, confirmed → the leaked folder moved into the workspace trash, its line the move run', async () => {
		const { workspace, root, folder } = workspaceWithScratch({
			pid: deadPid(),
			startedAt: TWO_DAYS_AGO,
		})
		const { spawner } = createRecordingSpawner()
		const result = await runWorktreePrune({
			argv: ['--root', workspace, '--yes'],
			cwd: workspace,
			scratchRoot: temporaryFolder('dialecte-rehearsal-root-'),
			scratchFolderRoot: root,
			isTerminal: true,
			confirm: async () => true,
			now: NOW,
			listProcesses: () => [],
			spawner,
		})
		expect({
			left: existsSync(folder),
			trashed: entriesOf(join(workspace, '.worktrees', '_trash')),
			line: result.output.includes(`✓ ${folder} sent to the trash`),
		}).toEqual({ left: false, trashed: 1, line: true })
	})
})

describe('worktree prune over the scratch root, the folders it cannot judge or did not make there', () => {
	it('a folder of the scratch root without scratch.json → kept, saying so', () => {
		const workspace = temporaryFolder('dialecte-prune-scratch-')
		const root = join(workspace, '.worktrees', '_scratch')
		const folder = join(root, 'dialecte-gate-scope-unmarked')
		mkdirSync(folder, { recursive: true })
		const plan = planPrune({
			workspace,
			handoverFolders: [],
			scratchRoot: temporaryFolder('dialecte-rehearsal-root-'),
			scratchFolderRoot: root,
			now: NOW,
			listProcesses: () => [],
		})
		expect(plan.scratch.find((item) => item.name === folder)?.kept).toMatch(/no scratch\.json/)
	})

	it("a rehearsal hook's temporary folder in the former short root, its process gone two days ago → to that root's trash", () => {
		const workspace = temporaryFolder('dialecte-prune-scratch-')
		const former = temporaryFolder('dialecte-short-root-')
		const folder = join(former, 'dlt-hook-abc')
		mkdirSync(folder)
		writeFileSync(
			join(folder, 'scratch.json'),
			JSON.stringify({ pid: deadPid(), startedAt: TWO_DAYS_AGO, command: 'dialecte handover run' }),
		)
		const plan = planPrune({
			workspace,
			handoverFolders: [],
			scratchRoot: join(workspace, '.worktrees', '_scratch'),
			formerScratchRoot: former,
			now: NOW,
			listProcesses: () => [],
		})
		expect(plan.scratch.find((item) => item.name === folder)?.command).toContain(
			join(former, 'dialecte-trash'),
		)
	})
})

/** A rehearsal root holding one hook folder `dlt-hook-abc` made by a dead process two days ago. */
function rehearsalRootWithHookFolder(): { scratchRoot: string; folder: string } {
	const scratchRoot = temporaryFolder('dialecte-rehearsal-root-')
	const folder = join(scratchRoot, 'dlt-hook-abc')
	mkdirSync(folder)
	writeFileSync(
		join(folder, 'scratch.json'),
		JSON.stringify({ pid: deadPid(), startedAt: TWO_DAYS_AGO, command: 'dialecte handover run' }),
	)
	return { scratchRoot, folder }
}

/** The plan of `worktree prune` (no `--yes`) over `workspace`: its exit code and the lines naming `folder`. */
async function planLinesOf(params: {
	workspace: string
	scratchRoot: string
	scratchFolderRoot: string
	folder: string
	listProcesses: () => ProcessFolder[] | string
}): Promise<{ exitCode: number; lines: string[] }> {
	const result = await runWorktreePrune({
		argv: ['--root', params.workspace],
		cwd: params.workspace,
		scratchRoot: params.scratchRoot,
		scratchFolderRoot: params.scratchFolderRoot,
		isTerminal: true,
		confirm: async () => false,
		now: NOW,
		listProcesses: params.listProcesses,
	})
	return {
		exitCode: result.exitCode,
		lines: result.output.split('\n').filter((line) => line.includes(params.folder)),
	}
}

/** `worktree prune --yes` over `workspace`, `confirm` doing `atConfirm` before it says yes; a throw read as a line. */
async function pruneYes(params: {
	workspace: string
	scratchRoot: string
	scratchFolderRoot: string
	atConfirm: () => void
	listProcesses: () => ProcessFolder[] | string
}): Promise<{ exitCode: number; lines: string[] }> {
	try {
		const result = await runWorktreePrune({
			argv: ['--root', params.workspace, '--yes'],
			cwd: params.workspace,
			scratchRoot: params.scratchRoot,
			scratchFolderRoot: params.scratchFolderRoot,
			isTerminal: true,
			confirm: async function confirmAfter() {
				params.atConfirm()
				return true
			},
			now: NOW,
			listProcesses: params.listProcesses,
			spawner: createRecordingSpawner().spawner,
		})
		return { exitCode: result.exitCode, lines: result.output.split('\n') }
	} catch (error) {
		// a run must answer, never throw: what it threw read as a line no case expects
		return { exitCode: -1, lines: [`thrown: ${(error as Error).message}`] }
	}
}

describe('worktree prune over the scratch root and the hook folders, a process working in them', () => {
	it('a dead, old scratch folder a process works in → kept at the plan naming the pid, no move command', async () => {
		const { workspace, root, folder } = workspaceWithScratch({
			pid: deadPid(),
			startedAt: TWO_DAYS_AGO,
		})

		const plan = await planLinesOf({
			workspace,
			scratchRoot: temporaryFolder('dialecte-rehearsal-root-'),
			scratchFolderRoot: root,
			folder,
			listProcesses: function shellInTheFolder() {
				return [{ pid: AGENT_PID, folder: realpathSync(folder) }]
			},
		})

		expect(plan).toEqual({
			exitCode: 0,
			lines: [`  keep    ${folder}  (a process works in it: pid ${AGENT_PID})`],
		})
	})

	it('a dead, old scratch folder, the processes not known → kept at the plan with why, no move command', async () => {
		const { workspace, root, folder } = workspaceWithScratch({
			pid: deadPid(),
			startedAt: TWO_DAYS_AGO,
		})

		const plan = await planLinesOf({
			workspace,
			scratchRoot: temporaryFolder('dialecte-rehearsal-root-'),
			scratchFolderRoot: root,
			folder,
			listProcesses: function unknown() {
				return PROCESSES_UNKNOWN
			},
		})

		expect(plan).toEqual({ exitCode: 0, lines: [`  keep    ${folder}  (${PROCESSES_UNKNOWN})`] })
	})

	it('a dead, old hook folder in a rehearsal root a process works in → kept at the plan naming the pid, no move command', async () => {
		const workspace = temporaryFolder('dialecte-prune-scratch-')
		const { scratchRoot, folder } = rehearsalRootWithHookFolder()

		const plan = await planLinesOf({
			workspace,
			scratchRoot,
			scratchFolderRoot: join(workspace, '.worktrees', '_scratch'),
			folder,
			listProcesses: function shellInTheFolder() {
				return [{ pid: AGENT_PID, folder: realpathSync(folder) }]
			},
		})

		expect(plan).toEqual({
			exitCode: 0,
			lines: [`  keep    ${folder}  (a process works in it: pid ${AGENT_PID})`],
		})
	})

	it('a young scratch folder, a process lister that throws → kept at the plan for its age, never the processes not known', async () => {
		// guard: the age rule already keeps it today; the processes are asked last, so their failure never shows here
		const { workspace, root, folder } = workspaceWithScratch({
			pid: deadPid(),
			startedAt: AN_HOUR_AGO,
		})

		const plan = await planLinesOf({
			workspace,
			scratchRoot: temporaryFolder('dialecte-rehearsal-root-'),
			scratchFolderRoot: root,
			folder,
			listProcesses: function crashing(): ProcessFolder[] {
				throw new Error('lsof crashed')
			},
		})

		expect(plan).toEqual({
			exitCode: 0,
			lines: [`  keep    ${folder}  (made 1 h 0 m ago: kept for a day)`],
		})
	})

	it('--yes, a scratch folder planned to go, a process entering it once confirmed → a cross line naming the pid, the folder left, exit 1', async () => {
		const { workspace, root, folder } = workspaceWithScratch({
			pid: deadPid(),
			startedAt: TWO_DAYS_AGO,
		})
		let confirmed = false

		const run = await pruneYes({
			workspace,
			scratchRoot: temporaryFolder('dialecte-rehearsal-root-'),
			scratchFolderRoot: root,
			atConfirm: function shellEnters() {
				confirmed = true
			},
			listProcesses: function shellOnceConfirmed() {
				return confirmed ? [{ pid: AGENT_PID, folder: realpathSync(folder) }] : []
			},
		})

		expect({
			exitCode: run.exitCode,
			cross: run.lines.includes(`✗ ${folder} kept: a process works in it: pid ${AGENT_PID}`),
			folderLeft: existsSync(folder),
			trashed: entriesOf(join(workspace, '.worktrees', '_trash')),
		}).toEqual({ exitCode: 1, cross: true, folderLeft: true, trashed: 0 })
	})

	it('--yes, a scratch folder planned to go, removed once confirmed → a cross line, gone since the plan, exit 1', async () => {
		const { workspace, root, folder } = workspaceWithScratch({
			pid: deadPid(),
			startedAt: TWO_DAYS_AGO,
		})

		const run = await pruneYes({
			workspace,
			scratchRoot: temporaryFolder('dialecte-rehearsal-root-'),
			scratchFolderRoot: root,
			atConfirm: function removeTheFolder() {
				rmSync(folder, { recursive: true })
			},
			listProcesses: () => [],
		})

		expect({
			exitCode: run.exitCode,
			gone: run.lines.includes(`✗ ${folder}: gone since the plan`),
			folderLeft: existsSync(folder),
			trashed: entriesOf(join(workspace, '.worktrees', '_trash')),
		}).toEqual({ exitCode: 1, gone: true, folderLeft: false, trashed: 0 })
	})

	it('--yes, a hook folder of a rehearsal root planned to go, a process entering it once confirmed → a cross line naming the pid, the folder left, exit 1', async () => {
		const workspace = temporaryFolder('dialecte-prune-scratch-')
		const { scratchRoot, folder } = rehearsalRootWithHookFolder()
		let confirmed = false

		const run = await pruneYes({
			workspace,
			scratchRoot,
			scratchFolderRoot: join(workspace, '.worktrees', '_scratch'),
			atConfirm: function shellEnters() {
				confirmed = true
			},
			listProcesses: function shellOnceConfirmed() {
				return confirmed ? [{ pid: AGENT_PID, folder: realpathSync(folder) }] : []
			},
		})

		expect({
			exitCode: run.exitCode,
			cross: run.lines.includes(`✗ ${folder} kept: a process works in it: pid ${AGENT_PID}`),
			folderLeft: existsSync(folder),
		}).toEqual({ exitCode: 1, cross: true, folderLeft: true })
	})
})
