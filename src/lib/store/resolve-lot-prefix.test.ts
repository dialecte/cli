/**
 * The identities a lookup reads (33L0 case 80, D3): `listLotNames({ store, prefix })` filters folder names before
 * reading any `identity.json`, and `lotOfWorktree`'s fallback for a worktree named from an index reads only the
 * identities of that index's folders, each once. Reads are counted through a spy on `readFileSync`.
 */
import { readFileSync } from 'node:fs'
import { basename, dirname } from 'node:path'

import { addWorktreeFolder, createWorkspaceWithLots } from '../../../test/lot-stores.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { lotOfWorktree } from './resolve-lot.ts'
import { listLotNames } from './store-folder.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('node:fs', async (importOriginal) => {
	const actual = await importOriginal<typeof import('node:fs')>()
	return { ...actual, readFileSync: vi.fn(actual.readFileSync) }
})

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

const NAMES = ['0171-repo-a', '0171-repo-b', '0172-repo-c', '0173-repo-d']

/** How many times each lot's identity.json was read since the spy was last cleared, by lot folder name. */
function identityReads(): Record<string, number> {
	const reads: Record<string, number> = {}
	for (const [path] of vi.mocked(readFileSync).mock.calls) {
		if (typeof path !== 'string' || basename(path) !== 'identity.json') continue
		const lot = basename(dirname(path))
		reads[lot] = (reads[lot] ?? 0) + 1
	}
	return reads
}

describe('listLotNames with a prefix', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('prefix 0171- → the names that start with it, sorted', () => {
		const { workspace } = createWorkspaceWithLots({ names: NAMES })

		expect(listLotNames({ store: workspace.store, prefix: '0171-' })).toEqual([
			'0171-repo-a',
			'0171-repo-b',
		])
	})

	it('prefix 0171- → no identity of another index is read, each of the index once', () => {
		const { workspace } = createWorkspaceWithLots({ names: NAMES })
		vi.mocked(readFileSync).mockClear()

		expect(
			((names) => ({ names, reads: identityReads() }))(
				listLotNames({ store: workspace.store, prefix: '0171-' }),
			),
		).toEqual({
			names: ['0171-repo-a', '0171-repo-b'],
			reads: { '0171-repo-a': 1, '0171-repo-b': 1 },
		})
	})

	it('a prefix no folder has → no name, no identity read', () => {
		const { workspace } = createWorkspaceWithLots({ names: NAMES })
		vi.mocked(readFileSync).mockClear()

		expect(
			((names) => ({ names, reads: identityReads() }))(
				listLotNames({ store: workspace.store, prefix: '0999-' }),
			),
		).toEqual({ names: [], reads: {} })
	})

	it('a guard: no prefix → every lot, sorted, as before', () => {
		const { workspace } = createWorkspaceWithLots({ names: NAMES })

		expect(listLotNames({ store: workspace.store })).toEqual(NAMES)
	})
})

describe('lotOfWorktree: a worktree with no lot named from an index (case 80)', () => {
	it(
		'0171-repo-zzz, no link, no lot of that name → undefined, only the identities of the 0171 folders read, once each',
		{ timeout: STORE_CASE_TIMEOUT },
		() => {
			const { workspace } = createWorkspaceWithLots({ names: NAMES })
			const worktree = addWorktreeFolder({ workspace, folderName: '0171-repo-zzz' })
			vi.mocked(readFileSync).mockClear()

			expect(
				((lot) => ({ lot, reads: identityReads() }))(lotOfWorktree({ cwd: worktree })),
			).toEqual({
				lot: undefined,
				reads: { '0171-repo-a': 1, '0171-repo-b': 1 },
			})
		},
	)

	it(
		'the worktree a lot identity names (0172-repo-c), no link → that lot, only that identity read',
		{ timeout: STORE_CASE_TIMEOUT },
		() => {
			const { workspace, folders } = createWorkspaceWithLots({ names: NAMES })
			const worktree = addWorktreeFolder({ workspace, folderName: '0172-repo-c' })
			vi.mocked(readFileSync).mockClear()

			expect(
				((lot) => ({ lot, reads: identityReads() }))(lotOfWorktree({ cwd: worktree })),
			).toEqual({ lot: folders['0172-repo-c'], reads: { '0172-repo-c': 1 } })
		},
	)

	it(
		'a worktree not named from an index, no link → undefined, no identity read at all',
		{ timeout: STORE_CASE_TIMEOUT },
		() => {
			const { workspace } = createWorkspaceWithLots({ names: NAMES })
			const worktree = addWorktreeFolder({ workspace, folderName: 'scratch-checkout' })
			vi.mocked(readFileSync).mockClear()

			expect(
				((lot) => ({ lot, reads: identityReads() }))(lotOfWorktree({ cwd: worktree })),
			).toEqual({ lot: undefined, reads: {} })
		},
	)
})
