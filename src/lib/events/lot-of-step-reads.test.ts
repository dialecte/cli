/**
 * The identities `lotOfStep` reads (33L0 case 80, D3): it is the production caller of `lotOfWorktree`, so the
 * bound is proved through it too. Reads are counted through a spy on `readFileSync`.
 */
import { readFileSync } from 'node:fs'
import { basename, dirname } from 'node:path'

import { addWorktreeFolder, createWorkspaceWithLots, linkLot } from '../../../test/lot-stores.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { lotOfStep } from './lot-of-step.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('node:fs', async (importOriginal) => {
	const actual = await importOriginal<typeof import('node:fs')>()
	return { ...actual, readFileSync: vi.fn(actual.readFileSync) }
})

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

const NAMES = ['0171-repo-a', '0171-repo-b', '0172-repo-c', '0173-repo-d']

/** The lot folders whose identity.json was read since the spy was last cleared, sorted, each once in the list. */
function lotsWhoseIdentityWasRead(): string[] {
	const lots = new Set<string>()
	for (const [path] of vi.mocked(readFileSync).mock.calls)
		if (typeof path === 'string' && basename(path) === 'identity.json')
			lots.add(basename(dirname(path)))
	return [...lots].sort()
}

describe('lotOfStep: the identities read', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a worktree of no lot named from an index (0171-repo-zzz), no link → undefined, only the 0171 identities read', () => {
		const { workspace } = createWorkspaceWithLots({ names: NAMES })
		const worktree = addWorktreeFolder({ workspace, folderName: '0171-repo-zzz' })
		vi.mocked(readFileSync).mockClear()

		expect(
			((found) => ({ found, read: lotsWhoseIdentityWasRead() }))(lotOfStep({ cwd: worktree })),
		).toEqual({ found: undefined, read: ['0171-repo-a', '0171-repo-b'] })
	})

	it('a worktree linked to the lot named 0172-repo-c → foreign or not, only that identity read', () => {
		const { workspace, folders } = createWorkspaceWithLots({ names: NAMES })
		const worktree = addWorktreeFolder({ workspace, folderName: 'linked-checkout' })
		linkLot({ worktree, lotFolder: folders['0172-repo-c'] })
		vi.mocked(readFileSync).mockClear()

		expect(
			((found) => ({ found, read: lotsWhoseIdentityWasRead() }))(lotOfStep({ cwd: worktree })),
		).toEqual({
			found: { foreign: '0172-repo-c', worktree },
			read: ['0172-repo-c'],
		})
	})

	it('a worktree not named from an index, no link → undefined, no identity read', () => {
		const { workspace } = createWorkspaceWithLots({ names: NAMES })
		const worktree = addWorktreeFolder({ workspace, folderName: 'scratch-checkout' })
		vi.mocked(readFileSync).mockClear()

		expect(
			((found) => ({ found, read: lotsWhoseIdentityWasRead() }))(lotOfStep({ cwd: worktree })),
		).toEqual({ found: undefined, read: [] })
	})
})
