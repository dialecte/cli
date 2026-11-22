/**
 * The one reader of what a store lot holds (`readLotItems`, `lotItemOf`, `storeChildOf`), real scratch repositories and
 * real store folders. A lot whose `identity.json` does not read still holds: found through the worktree's root
 * `.dialecte/lot` link and through the registry entry naming its folder. Only a lot folder PRESENT (lstat: a dangling
 * link counts) holds; one gone or moved aside holds nothing.
 */
import { mkdirSync, realpathSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'

import { createBriefWorkspace, writeStoreLot } from '../../../test/brief-workspace.ts'
import { replaceRecord } from '../../../test/damaged-lot-workspace.ts'
import { KEEP_NOW, KEEP_SCOPE } from '../../../test/lot-keep-workspace.constants.ts'
import { addBareWorktree, addLotWorktree } from '../../../test/lot-keep-workspace.ts'
import { linkLot } from '../../../test/lot-stores.ts'
import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import {
	handoverStoreOf,
	recordHandoverState,
	registerHandover,
} from '../handover/handover-store.ts'
import { lotItemOf, readLotItems, storeChildOf } from './lot-items.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { BriefWorkspace } from '../../../test/brief-workspace.types.ts'
import type { LotItem, LotItems } from './lot-items.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

const WORKING = '0001-repo-working'
const LATE = '0002-repo-late'
const DANGLING = '0003-repo-dangling'
const GONE = '0004-repo-gone'
const UNREADABLE = '0005-repo-unreadable'

/** The identity text no reader parses. */
const UNPARSABLE_IDENTITY = '{ "schema": 1, '

/** The store of the workspace, made, by its real path. */
function realStoreOf(workspace: BriefWorkspace): string {
	mkdirSync(workspace.store, { recursive: true })
	return realpathSync(workspace.store)
}

/** The item of the worktree's root link, asked after `arrange` changed the store once `items` was read. */
function linkItemAfter(params: {
	items: LotItems
	worktree: string
	arrange: () => void
}): LotItem | undefined {
	params.arrange()
	return lotItemOf({ items: params.items, worktree: params.worktree, link: true })
}

describe(
	'storeChildOf: a store child by its path, present or not',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		const ROWS = [
			{
				title: 'a lot folder of the store',
				arrange: function present(workspace: BriefWorkspace) {
					writeStoreLot({ workspace, name: WORKING, scope: KEEP_SCOPE })
					return join(workspace.store, WORKING)
				},
				named: WORKING,
			},
			{
				title: 'a lot folder name of the store with nothing there',
				arrange: function absent(workspace: BriefWorkspace) {
					return join(workspace.store, GONE)
				},
				named: GONE,
			},
			{
				title: 'a store child that is itself a link out of the store',
				arrange: function linked(workspace: BriefWorkspace) {
					realStoreOf(workspace)
					symlinkSync(temporaryFolder('dialecte-elsewhere-'), join(workspace.store, DANGLING))
					return join(workspace.store, DANGLING)
				},
				named: DANGLING,
			},
			{
				title: 'a child spelled through a link to the store',
				arrange: function throughLink(workspace: BriefWorkspace) {
					realStoreOf(workspace)
					const alias = join(temporaryFolder('dialecte-store-alias-'), 'store')
					symlinkSync(workspace.store, alias)
					return join(alias, GONE)
				},
				named: GONE,
			},
		]
		for (const row of ROWS)
			it(`${row.title} → that child under the store's real path, with the store`, () => {
				const workspace = createBriefWorkspace()
				const path = row.arrange(workspace)
				const store = realStoreOf(workspace)

				expect(storeChildOf({ path })).toEqual({ store, child: join(store, row.named) })
			})

		const NONE_ROWS = [
			{
				title: 'a folder being built (.tmp-)',
				pathOf: (workspace: BriefWorkspace) => join(workspace.store, `.${WORKING}.tmp-12`),
			},
			{
				title: 'a store child without a lot name',
				pathOf: (workspace: BriefWorkspace) => join(workspace.store, 'notes'),
			},
			{
				title: 'a folder outside every store',
				pathOf: (workspace: BriefWorkspace) => join(workspace.workspace, '.worktrees', WORKING),
			},
		]
		for (const row of NONE_ROWS)
			it(`${row.title} → none`, () => {
				const workspace = createBriefWorkspace()
				realStoreOf(workspace)

				expect(storeChildOf({ path: row.pathOf(workspace) })).toBeUndefined()
			})
	},
)

describe(
	'readLotItems: a lot whose identity does not read',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it('its registry entry names its folder, worktree and branch → its worktree and its branch held, lot <name> damaged', () => {
			const workspace = createBriefWorkspace()
			const lot = addLotWorktree({ workspace, name: UNREADABLE, state: 'working' })
			replaceRecord({ folder: lot.lotFolder, name: 'identity.json', text: UNPARSABLE_IDENTITY })
			// the entry the lot's landing writes, through the store's own writer
			registerHandover({
				root: lot.worktree,
				folder: lot.lotFolder,
				branch: lot.branch,
				now: KEEP_NOW,
			})
			recordHandoverState({
				store: handoverStoreOf(workspace.repository),
				folder: lot.lotFolder,
				state: 'committed',
			})
			const held = { lot: UNREADABLE, held: true, reason: `lot ${UNREADABLE} damaged` }

			expect(
				((items) => ({
					byWorktree: lotItemOf({ items, worktree: lot.worktree }),
					byBranch: lotItemOf({ items, branch: lot.branch }),
				}))(readLotItems({ repository: workspace.repository })),
			).toMatchObject({ byWorktree: held, byBranch: held })
		})
	},
)

describe(
	'lotItemOf: the worktree’s root link to a store child',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it('a link to a store lot folder made after the read → held, lot <name>: its records do not read', () => {
			const workspace = createBriefWorkspace()
			writeStoreLot({ workspace, name: WORKING, scope: KEEP_SCOPE })
			const worktree = addBareWorktree({ workspace, name: '0009-repo-linked' }).worktree

			expect(
				linkItemAfter({
					items: readLotItems({ repository: workspace.repository }),
					worktree,
					arrange: function makeLate() {
						const lotFolder = writeStoreLot({ workspace, name: LATE, scope: KEEP_SCOPE })
						linkLot({ worktree, lotFolder })
					},
				}),
			).toMatchObject({
				lot: LATE,
				lotFolder: join(realStoreOf(workspace), LATE),
				held: true,
				reason: `lot ${LATE}: its records do not read`,
			})
		})

		it('a link to a store child that is a dangling link, there at the read → held, lot <name> damaged', () => {
			const workspace = createBriefWorkspace()
			const store = realStoreOf(workspace)
			symlinkSync(join(temporaryFolder('dialecte-missing-'), 'missing'), join(store, DANGLING))
			const worktree = addBareWorktree({ workspace, name: '0009-repo-linked' }).worktree
			linkLot({ worktree, lotFolder: join(store, DANGLING) })

			expect(
				lotItemOf({
					items: readLotItems({ repository: workspace.repository }),
					worktree,
					link: true,
				}),
			).toMatchObject({ lot: DANGLING, held: true, reason: `lot ${DANGLING} damaged` })
		})

		it('a link to a store child that is a dangling link made after the read → held, lot <name>: its records do not read', () => {
			const workspace = createBriefWorkspace()
			const store = realStoreOf(workspace)
			const worktree = addBareWorktree({ workspace, name: '0009-repo-linked' }).worktree

			expect(
				linkItemAfter({
					items: readLotItems({ repository: workspace.repository }),
					worktree,
					arrange: function makeDangling() {
						symlinkSync(
							join(temporaryFolder('dialecte-missing-'), 'missing'),
							join(store, DANGLING),
						)
						linkLot({ worktree, lotFolder: join(store, DANGLING) })
					},
				}),
			).toMatchObject({
				lot: DANGLING,
				held: true,
				reason: `lot ${DANGLING}: its records do not read`,
			})
		})

		it('a link to a store lot folder not present (gone, moved aside) → no item', () => {
			const workspace = createBriefWorkspace()
			const store = realStoreOf(workspace)
			const worktree = addBareWorktree({ workspace, name: '0009-repo-linked' }).worktree
			linkLot({ worktree, lotFolder: join(store, GONE) })

			expect(
				lotItemOf({
					items: readLotItems({ repository: workspace.repository }),
					worktree,
					link: true,
				}),
			).toBeUndefined()
		})

		it('a worktree whose own lot is committed, its link naming a working lot → the working lot’s item first (held first)', () => {
			const workspace = createBriefWorkspace()
			const committed = addLotWorktree({ workspace, name: '0006-repo-landed', state: 'committed' })
			const working = writeStoreLot({ workspace, name: WORKING, scope: KEEP_SCOPE })
			linkLot({ worktree: committed.worktree, lotFolder: working })

			expect(
				lotItemOf({
					items: readLotItems({ repository: workspace.repository }),
					worktree: committed.worktree,
					link: true,
				}),
			).toMatchObject({ lot: WORKING, held: true, reason: `lot ${WORKING} working` })
		})
	},
)
