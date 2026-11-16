/**
 * Which lot's `tests.json` a run in a folder writes (33CI CI2a): a store that cannot be read is said, as the line a
 * run adds when its record is not written, never taken for "no lot".
 */
import { testsRecordFolderOf } from './tests-record.ts'

import { describe, expect, it, vi } from 'vitest'

vi.mock('../store/resolve-lot.ts', () => ({
	lotOfWorktree: vi.fn(function unreadableStore() {
		throw new Error('EACCES: permission denied')
	}),
}))

describe('testsRecordFolderOf', () => {
	it('a store that cannot be read -> the ! line with the reason, no folder', () => {
		expect(testsRecordFolderOf({ cwd: '/any/worktree' })).toEqual({
			warning: '! tests.json not written: EACCES: permission denied',
		})
	})
})
