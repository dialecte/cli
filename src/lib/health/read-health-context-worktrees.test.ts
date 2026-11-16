import { join } from 'node:path'

import {
	CLOSED_AT,
	FIRST_FILE_TIME,
	SECOND_FILE_TIME,
} from '../../../test/health-worktrees.constants.ts'
import {
	writeHandoverEntry,
	writeLotIdentity,
	isoTimeNoLaterThan,
	writeRegisteredWorktree,
} from '../../../test/health-worktrees.ts'
import { createCommon } from '../../../test/health.ts'
import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { readHealthRepository } from './read-health-context.ts'

import { describe, expect, it } from 'vitest'

import type { HealthWorktree } from './health.types.ts'

const NAME = '0023-cli-rule-gaps-rg'

/** A worktree folder that exists, and a common dir registering it as `NAME`. */
function registeredCommon(params: { indexAt?: Date; headAt?: Date }): {
	common: string
	path: string
} {
	const common = createCommon()
	const path = temporaryFolder('dialecte-worktree-folder-')
	writeRegisteredWorktree({ common, name: NAME, path, ...params })
	return { common, path }
}

function readWorktrees(common: string): HealthWorktree[] | undefined {
	return readHealthRepository({ common }).worktrees
}

describe('readHealthRepository worktrees', () => {
	it('a registered worktree -> its folder name and the path its gitdir names', () => {
		const { common, path } = registeredCommon({ indexAt: FIRST_FILE_TIME })
		expect(readWorktrees(common)).toEqual([
			expect.objectContaining({ name: NAME, path, gone: false }),
		])
	})

	it('index older than HEAD -> activeAt is the time of HEAD', () => {
		const { common } = registeredCommon({ indexAt: FIRST_FILE_TIME, headAt: SECOND_FILE_TIME })
		expect(readWorktrees(common)).toEqual([
			expect.objectContaining({ activeAt: SECOND_FILE_TIME.toISOString() }),
		])
	})

	it('HEAD older than the index -> activeAt is the time of the index', () => {
		const { common } = registeredCommon({ indexAt: SECOND_FILE_TIME, headAt: FIRST_FILE_TIME })
		expect(readWorktrees(common)).toEqual([
			expect.objectContaining({ activeAt: SECOND_FILE_TIME.toISOString() }),
		])
	})

	it('only HEAD exists -> activeAt is the time of HEAD', () => {
		const { common } = registeredCommon({ headAt: FIRST_FILE_TIME })
		expect(readWorktrees(common)).toEqual([
			expect.objectContaining({ activeAt: FIRST_FILE_TIME.toISOString() }),
		])
	})

	it('createdAt is a valid ISO time no later than the end of the test', () => {
		const { common } = registeredCommon({ indexAt: FIRST_FILE_TIME })
		expect(readWorktrees(common)).toEqual([
			expect.objectContaining({ createdAt: isoTimeNoLaterThan(new Date()) }),
		])
	})

	it('a gitdir naming a folder that does not exist -> gone', () => {
		const common = createCommon()
		const path = join(temporaryFolder('dialecte-worktree-folder-'), 'removed')
		writeRegisteredWorktree({ common, name: NAME, path, indexAt: FIRST_FILE_TIME })
		expect(readWorktrees(common)).toEqual([expect.objectContaining({ path, gone: true })])
	})

	it('no worktrees folder -> none', () => {
		expect(readWorktrees(createCommon())).toEqual([])
	})

	it('two worktrees -> both read, sorted by name', () => {
		const { common } = registeredCommon({ indexAt: FIRST_FILE_TIME })
		const other = temporaryFolder('dialecte-worktree-folder-')
		writeRegisteredWorktree({ common, name: '0001-cli-a', path: other, indexAt: FIRST_FILE_TIME })
		expect(readWorktrees(common)).toEqual([
			expect.objectContaining({ name: '0001-cli-a' }),
			expect.objectContaining({ name: NAME }),
		])
	})

	it('a hand-over entry of the worktree -> its state', () => {
		const { common, path } = registeredCommon({ indexAt: FIRST_FILE_TIME })
		writeHandoverEntry({ common, name: NAME, worktree: path, state: 'committed' })
		expect(readWorktrees(common)).toEqual([
			expect.objectContaining({ handover: { state: 'committed' } }),
		])
	})

	it('a closed hand-over entry -> its state and closed time', () => {
		const { common, path } = registeredCommon({ indexAt: FIRST_FILE_TIME })
		writeHandoverEntry({
			common,
			name: NAME,
			worktree: path,
			state: 'committed',
			closed: CLOSED_AT,
		})
		expect(readWorktrees(common)).toEqual([
			expect.objectContaining({ handover: { state: 'committed', closed: CLOSED_AT } }),
		])
	})

	it('a hand-over entry of another worktree -> no handover', () => {
		const { common } = registeredCommon({ indexAt: FIRST_FILE_TIME })
		writeHandoverEntry({ common, name: NAME, worktree: '/workspace/other', state: 'committed' })
		expect(readWorktrees(common)).toEqual([
			expect.not.objectContaining({ handover: expect.anything() }),
		])
	})
})

describe('readHealthRepository lot worktree', () => {
	it('a lot whose identity names a worktree -> HealthLot.worktree', () => {
		const common = createCommon()
		writeLotIdentity({
			common,
			name: NAME,
			worktree: '/workspace/.worktrees/0023-cli-rule-gaps-rg',
		})
		expect(readHealthRepository({ common }).lots).toEqual([
			expect.objectContaining({ worktree: '/workspace/.worktrees/0023-cli-rule-gaps-rg' }),
		])
	})

	it('a lot whose identity names no worktree -> none, beside one that names its own', () => {
		const common = createCommon()
		writeLotIdentity({ common, name: '0001-cli-a', worktree: null })
		writeLotIdentity({
			common,
			name: NAME,
			worktree: '/workspace/.worktrees/0023-cli-rule-gaps-rg',
		})
		expect(readHealthRepository({ common }).lots).toEqual([
			expect.not.objectContaining({ worktree: expect.anything() }),
			expect.objectContaining({ worktree: '/workspace/.worktrees/0023-cli-rule-gaps-rg' }),
		])
	})
})
