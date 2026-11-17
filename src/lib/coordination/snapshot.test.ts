/** A lot's work as one commit: HEAD itself when clean, else HEAD plus the uncommitted work (33CO 4.3). */
import { copyFileSync, readFileSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { SNAPSHOT_IDENTITY } from '../../../test/forecast-workspace.constants.ts'
import {
	createForecastWorkspace,
	startForecastLot,
	workInLot,
} from '../../../test/forecast-workspace.ts'
import { git } from '../../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { snapshotLotWork } from './snapshot.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { LotSnapshot } from './forecast.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** What a snapshot holds: whether it was dirty, the added, deleted and ignored files, the modified file's text. */
function snapshotContentOf(params: {
	worktree: string
	taken: LotSnapshot | { reason: string }
}): Record<string, unknown> {
	const { worktree, taken } = params
	if ('reason' in taken) return { reason: taken.reason }
	const files = git({
		root: worktree,
		args: ['ls-tree', '-r', '--name-only', taken.snapshot],
	}).split('\n')
	return {
		dirty: taken.dirty,
		added: files.includes('src/added.ts'),
		deleted: files.includes('src/other.ts'),
		ignored: files.includes('ignored.log'),
		modified: git({ root: worktree, args: ['show', `${taken.snapshot}:src/shared.ts`] }),
	}
}

/** The author, email and author and committer epochs of a snapshot commit (its reason when none was taken). */
function identityOf(params: { worktree: string; taken: LotSnapshot | { reason: string } }): string {
	const { taken } = params
	if ('reason' in taken) return taken.reason
	return git({
		root: params.worktree,
		args: ['show', '-s', '--format=%an %ae %at %ct', taken.snapshot],
	}).trim()
}

describe('the snapshot of a lot', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a lot with no uncommitted work -> its snapshot is its HEAD and no index is copied', () => {
		const workspace = createForecastWorkspace()
		const lot = startForecastLot({ workspace, feature: 'clean' })
		const head = git({ root: lot.worktree, args: ['rev-parse', 'HEAD'] }).trim()
		const copyIndex = vi.fn()

		expect(snapshotLotWork({ worktree: lot.worktree, lot: lot.name, copyIndex })).toEqual({
			commit: head,
			snapshot: head,
			dirty: false,
		})
		expect(copyIndex).not.toHaveBeenCalled()
	})

	it("a lot with modified, added and deleted files and an ignored file -> the snapshot tree holds the three changes and not the ignored file, the worktree's index file byte-identical before and after", () => {
		const workspace = createForecastWorkspace()
		const lot = startForecastLot({ workspace, feature: 'dirty' })
		workInLot({
			lot,
			files: { 'src/shared.ts': 'changed\n', 'src/added.ts': 'added\n', 'ignored.log': 'noise\n' },
		})
		rmSync(join(lot.worktree, 'src/other.ts'))
		const indexFile = resolve(
			lot.worktree,
			git({ root: lot.worktree, args: ['rev-parse', '--git-path', 'index'] }).trim(),
		)
		const indexBefore = readFileSync(indexFile)
		const copyIndex = vi.fn(function copyIndexFile(params: { from: string; to: string }) {
			copyFileSync(params.from, params.to)
		})

		expect(
			snapshotContentOf({
				worktree: lot.worktree,
				taken: snapshotLotWork({ worktree: lot.worktree, lot: lot.name, copyIndex }),
			}),
		).toEqual({ dirty: true, added: true, deleted: false, ignored: false, modified: 'changed\n' })
		expect(readFileSync(indexFile).equals(indexBefore)).toBe(true)
		expect(copyIndex).toHaveBeenCalledTimes(1)
	})

	it('the same dirty worktree snapshotted twice -> the same snapshot sha', () => {
		const workspace = createForecastWorkspace()
		const lot = startForecastLot({ workspace, feature: 'twice' })
		workInLot({ lot, files: { 'src/shared.ts': 'changed\n' } })

		expect(snapshotLotWork({ worktree: lot.worktree, lot: lot.name })).toMatchObject({
			dirty: true,
		})
		expect(snapshotLotWork({ worktree: lot.worktree, lot: lot.name })).toEqual(
			snapshotLotWork({ worktree: lot.worktree, lot: lot.name }),
		)
		expect(
			identityOf({
				worktree: lot.worktree,
				taken: snapshotLotWork({ worktree: lot.worktree, lot: lot.name }),
			}),
		).toBe(SNAPSHOT_IDENTITY)
	})
})
