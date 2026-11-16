/** The base branch brought up to the host's after a landing: fetched, then the local branch fast-forwarded. */
import { realpathSync } from 'node:fs'
import { join } from 'node:path'

import { commitEmpty, commitOf } from '../../../test/rule-gaps-base-branch.ts'
import {
	cloneRepository,
	git,
	initializeRepository,
	temporaryFolder,
	writeFiles,
} from '../../../test/scratch-repository.ts'
import { SCRATCH_GIT_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { syncBaseBranch } from './base-sync.ts'

import { describe, expect, it } from 'vitest'

/** A checkout on `main` with a bare origin, and a commit another clone pushed there since (`landed`). */
function behindOrigin(): { root: string; landed: string } {
	const folder = temporaryFolder('dialecte-base-sync-')
	const origin = join(folder, 'origin.git')
	const root = initializeRepository({ root: join(folder, 'repo') })
	git({ root: folder, args: ['init', '-q', '--bare', '-b', 'main', origin] })
	git({ root, args: ['remote', 'add', 'origin', origin] })
	git({ root, args: ['push', '-q', '-u', 'origin', 'main'] })
	const other = join(folder, 'other')
	cloneRepository({ origin, into: other })
	const landed = commitEmpty({ root: other, message: 'feat: landed by the queue' })
	git({ root: other, args: ['push', '-q', 'origin', 'main'] })
	return { root, landed }
}

describe('syncBaseBranch', { timeout: SCRATCH_GIT_CASE_TIMEOUT }, () => {
	it('main checked out and clean, origin ahead → fetched and fast-forwarded, one line saying so', () => {
		const { root, landed } = behindOrigin()

		const lines = syncBaseBranch({ root })

		expect(commitOf({ root, rev: 'main' })).toBe(landed)
		expect(lines).toEqual([`main fast-forwarded to origin/main ${landed.slice(0, 12)}`])
	})

	it('main checked out with a working change → not moved, one line saying why', () => {
		const { root, landed } = behindOrigin()
		writeFiles({ root, files: { 'wip.txt': 'x\n' } })
		git({ root, args: ['add', 'wip.txt'] })

		const lines = syncBaseBranch({ root })

		expect(commitOf({ root, rev: 'main' })).not.toBe(landed)
		expect(lines).toEqual(['main not fast-forwarded: the main checkout holds changes'])
	})

	it('main not checked out (the checkout on another branch) → its ref fast-forwarded', () => {
		const { root, landed } = behindOrigin()
		git({ root, args: ['switch', '-q', '-c', 'other'] })

		syncBaseBranch({ root })

		expect(commitOf({ root, rev: 'main' })).toBe(landed)
	})

	it('main checked out in another worktree → not moved, one line naming that worktree', () => {
		const { root, landed } = behindOrigin()
		git({ root, args: ['switch', '-q', '-c', 'other'] })
		const holder = join(temporaryFolder('dialecte-base-sync-holder-'), 'main')
		git({ root, args: ['worktree', 'add', '-q', holder, 'main'] })

		const lines = syncBaseBranch({ root })

		expect(commitOf({ root, rev: 'main' })).not.toBe(landed)
		expect(lines).toEqual([`main not fast-forwarded: checked out in ${realpathSync(holder)}`])
	})

	it('local main holding a commit origin lacks, origin ahead too (diverged) → not moved, one line saying so', () => {
		const { root, landed } = behindOrigin()
		commitEmpty({ root, message: 'feat: local only' })

		const lines = syncBaseBranch({ root })

		expect(commitOf({ root, rev: 'main' })).not.toBe(landed)
		expect(lines).toEqual([
			'main not fast-forwarded: it holds commits origin/main does not (the remote is the truth: look)',
		])
	})

	it("an untracked file the landed commit would overwrite → not moved, git's refusal on one line, nothing thrown", () => {
		const folder = temporaryFolder('dialecte-base-sync-')
		const origin = join(folder, 'origin.git')
		const root = initializeRepository({ root: join(folder, 'repo') })
		git({ root: folder, args: ['init', '-q', '--bare', '-b', 'main', origin] })
		git({ root, args: ['remote', 'add', 'origin', origin] })
		git({ root, args: ['push', '-q', '-u', 'origin', 'main'] })
		const other = join(folder, 'other')
		cloneRepository({ origin, into: other })
		writeFiles({ root: other, files: { 'new.txt': 'landed\n' } })
		git({ root: other, args: ['add', 'new.txt'] })
		git({ root: other, args: ['commit', '-qm', 'feat: new file'] })
		git({ root: other, args: ['push', '-q', 'origin', 'main'] })
		writeFiles({ root, files: { 'new.txt': 'mine\n' } })

		const lines = syncBaseBranch({ root })

		expect(lines).toEqual([expect.stringMatching(/^main not fast-forwarded: /)])
	})

	it('an origin that cannot be reached → one line saying the last known refs are read, nothing thrown', () => {
		const root = initializeRepository({
			root: join(temporaryFolder('dialecte-base-sync-'), 'repo'),
		})
		git({
			root,
			args: [
				'remote',
				'add',
				'origin',
				join(temporaryFolder('dialecte-base-sync-gone-'), 'missing.git'),
			],
		})

		expect(syncBaseBranch({ root })).toEqual([
			expect.stringMatching(/^origin not fetched \(.+\): the last known refs are read$/),
		])
	})

	it('no origin → nothing done, no line', () => {
		const root = initializeRepository({
			root: join(temporaryFolder('dialecte-base-sync-'), 'repo'),
		})

		expect(syncBaseBranch({ root })).toEqual([])
	})
})
