/** The worktree rules word one finding in the singular. */
import { HOUR_MS } from '../../../test/health-worktrees.constants.ts'
import { WORKTREES_NOW } from '../../../test/health-worktrees.constants.ts'
import {
	idleWorktreesOf,
	scratchFoldersOf,
	worktreesRepositoryOf,
} from '../../../test/health-worktrees.ts'
import { findLeakedScratch } from './rule-scratch.ts'
import { findIdleWorktrees } from './rule-worktrees.ts'

import { describe, expect, it } from 'vitest'

describe('the worktree rule texts, one finding', () => {
	it('one idle worktree → `1 idle worktree with no open lot (...)`', () => {
		const repository = worktreesRepositoryOf({ worktrees: idleWorktreesOf(1) })

		expect(
			findIdleWorktrees({ repository, now: WORKTREES_NOW }).map((finding) => finding.text),
		).toEqual(['1 idle worktree with no open lot (oldest 0001-cli-w, idle 48 h 0 m)'])
	})

	it('one leaked scratch folder → `1 leaked scratch folder (...)`', () => {
		const folders = scratchFoldersOf([{ name: 'dialecte-rehearse-x', ageMs: 7 * HOUR_MS }])

		expect(
			findLeakedScratch({ folders, now: WORKTREES_NOW }).map((finding) => finding.text),
		).toEqual(['1 leaked scratch folder (oldest /tmp/dialecte-rehearse-x, 7 h 0 m old)'])
	})
})
