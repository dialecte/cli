import { existsSync } from 'node:fs'
import { join } from 'node:path'

import {
	STATE_ASKS_SEGMENTS,
	WORK_TREE_SUBFOLDER,
} from '../../../../test/ask-command-workspace.constants.ts'
import {
	createAskCommandWorkspace,
	createHandoverFolder,
	createLotAskWorkspace,
	eventsPathIn,
} from '../../../../test/ask-command-workspace.ts'
import { LOT_NAME } from '../../../../test/lot-stores.constants.ts'
import { createScratchRepository } from '../../../../test/scratch-repository.ts'
import { askFolderOf } from './ask-folder-of.ts'

import { describe, expect, it } from 'vitest'

describe('askFolderOf: where an ask lives (D16, D17)', () => {
	it('no --lot, outside every lot -> the state folder, no lot, its own events file', () => {
		const workspace = createAskCommandWorkspace()
		const asks = join(workspace.state, ...STATE_ASKS_SEGMENTS)

		expect(
			askFolderOf({
				cwd: workspace.cwd,
				lot: undefined,
				environment: workspace.environment,
			}),
		).toEqual({
			folder: asks,
			lotName: null,
			lotFolder: null,
			eventsFile: eventsPathIn(asks),
		})
	})

	const lotArguments: Record<string, (params: { lotFolder: string }) => string> = {
		'--lot the folder of a store lot': ({ lotFolder }) => lotFolder,
		'--lot the full name of a store lot': () => LOT_NAME,
		'--lot the index of a store lot': () => '1',
	}

	for (const [name, argumentOf] of Object.entries(lotArguments))
		it(`${name} -> <lot folder>/asks, the lot's name, the lot's events file`, () => {
			const { workspace, lotFolder } = createLotAskWorkspace({ place: 'project' })

			expect(
				askFolderOf({
					cwd: workspace.cwd,
					lot: argumentOf({ lotFolder }),
					environment: workspace.environment,
				}),
			).toEqual({
				folder: join(lotFolder, 'asks'),
				lotName: LOT_NAME,
				lotFolder,
				eventsFile: eventsPathIn(lotFolder),
			})
		})

	it('--lot a hand-over folder outside every repository -> <folder>/asks, no lot name, the state events file', () => {
		const workspace = createAskCommandWorkspace()
		const handover = createHandoverFolder({ workspace })

		expect(
			askFolderOf({ cwd: workspace.cwd, lot: handover, environment: workspace.environment }),
		).toEqual({
			folder: join(handover, 'asks'),
			lotName: null,
			lotFolder: null,
			eventsFile: eventsPathIn(join(workspace.state, ...STATE_ASKS_SEGMENTS)),
		})
	})

	it('13c --lot ./src inside a work tree -> refused as a hand-over folder inside a repository, nothing made', () => {
		const { workspace, lots } = createLotAskWorkspace({ place: 'repository' })

		expect(
			askFolderOf({
				cwd: workspace.cwd,
				lot: WORK_TREE_SUBFOLDER,
				environment: workspace.environment,
			}),
		).toEqual({ refused: expect.stringContaining('inside the repository') })
		expect(existsSync(join(lots.repository, 'src', 'asks'))).toBe(false)
		expect(existsSync(join(workspace.state, ...STATE_ASKS_SEGMENTS))).toBe(false)
	})

	it('no --lot, run in the worktree of a store lot -> that lot (lotOfWorktree)', () => {
		const { workspace, lotFolder } = createLotAskWorkspace({ place: 'worktree' })

		expect(
			askFolderOf({ cwd: workspace.cwd, lot: undefined, environment: workspace.environment }),
		).toEqual({
			folder: join(lotFolder, 'asks'),
			lotName: LOT_NAME,
			lotFolder,
			eventsFile: eventsPathIn(lotFolder),
		})
	})

	it('a state folder inside a git work tree -> refused naming the folder', () => {
		const workspace = createAskCommandWorkspace()
		const repository = createScratchRepository()
		const state = join(repository, 'state')

		expect(
			askFolderOf({
				cwd: workspace.cwd,
				lot: undefined,
				environment: { ...workspace.environment, XDG_STATE_HOME: state },
			}),
		).toEqual({ refused: expect.stringContaining(state) })
	})
})
