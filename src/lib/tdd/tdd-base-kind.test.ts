/** `resolveTddBase` says which kind of base it answers, so a caller never reads its source text to tell them apart. */
import { createScratchRepository, git } from '../../../test/scratch-repository.ts'
import { SCRATCH_GIT_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { sharedTddBaseOf } from '../../commands/gate.ts'
import { resolveTddBase } from './tdd-base.ts'

import { describe, expect, it } from 'vitest'

import type { TddBase } from './tdd.types.ts'

/** A repository whose `main` holds one commit, then a branch with one commit of its own checked out; its root. */
function branchFromMain(): string {
	const root = createScratchRepository({ 'a.txt': 'a\n' })
	git({ root, args: ['checkout', '-q', '-b', 'feat/work'] })
	git({ root, args: ['commit', '-q', '--allow-empty', '-m', 'feat: work'] })
	return root
}

/** The same repository with its `main` renamed: no base branch is found. */
function noBaseBranch(): string {
	const root = branchFromMain()
	git({ root, args: ['branch', '-m', 'main', 'trunk'] })
	return root
}

describe('resolveTddBase: the kind of base', { timeout: SCRATCH_GIT_CASE_TIMEOUT }, () => {
	const testCases: Record<
		string,
		{ make: () => string; ref?: string; expectedKind: TddBase['kind'] }
	> = {
		'a branch from main, no --base → the lot base': {
			make: branchFromMain,
			expectedKind: 'lot',
		},
		'no base branch found, none configured → HEAD': {
			make: noBaseBranch,
			expectedKind: 'head',
		},
		'--base main → the flag base': {
			make: branchFromMain,
			ref: 'main',
			expectedKind: 'flag',
		},
	}

	for (const [title, testCase] of Object.entries(testCases))
		it(title, () => {
			const root = testCase.make()

			const base = resolveTddBase({
				root,
				packageJson: {},
				...(testCase.ref !== undefined && { ref: testCase.ref }),
			})

			expect('kind' in base ? base.kind : base).toBe(testCase.expectedKind)
		})
})

describe("the gate's shared tdd base: the kind", { timeout: SCRATCH_GIT_CASE_TIMEOUT }, () => {
	it('a base-branch gate base in a worktree of no stacked lot → the gate base', () => {
		const root = branchFromMain()
		const commit = git({ root, args: ['merge-base', 'HEAD', 'main'] }).trim()

		const base = sharedTddBaseOf({ cwd: root, gateBase: { commit, source: 'base-branch' } })

		expect(base?.kind).toBe('gate')
	})
})
