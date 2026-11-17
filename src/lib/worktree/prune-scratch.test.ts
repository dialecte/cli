/** `worktree prune` sends to the trash a scratch folder whose process is gone and that is older than a day. */
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { deadPid } from '../../../test/dead-pid.ts'
import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { createRecordingSpawner } from '../../../test/worktree-pool.ts'
import { runWorktreePrune } from '../../commands/worktree.ts'
import { planPrune } from './prune-worktrees.ts'

import { describe, expect, it } from 'vitest'

const NOW = new Date('2026-11-17T12:00:00.000Z')
const TWO_DAYS_AGO = '2026-11-15T12:00:00.000Z'
const AN_HOUR_AGO = '2026-11-17T11:00:00.000Z'

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
