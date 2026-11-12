import {
	addOriginBranch,
	cloneWithOnlyOriginRefs,
	developAheadOfMain,
	makeDevelopOriginDefault,
	commitEmpty,
	pointOriginHeadAt,
} from '../../../test/rule-gaps-base-branch.ts'
import { createScratchRepository, git } from '../../../test/scratch-repository.ts'
import { SCRATCH_GIT_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { NO_BASE_BRANCH_FOUND, NO_CONFIGURED_BASE_BRANCH } from './gate-base.constants.ts'
import { findBaseBranchRef, resolveGateBase } from './gate-base.ts'

import { describe, expect, it } from 'vitest'

import type { BaseBranchRow } from '../../../test/rule-gaps-base-branch.types.ts'

const RELEASE_REFUSAL = { refusal: NO_CONFIGURED_BASE_BRANCH.replace('{branch}', 'release') }

/** A repository on `main`, with `main` renamed to `work` (no `main`, no `master`). */
function repositoryWithoutMain(): string {
	const root = createScratchRepository()
	git({ root, args: ['branch', '-m', 'main', 'work'] })
	return root
}

const ROWS: BaseBranchRow[] = [
	{
		title:
			'origin/HEAD names origin/develop, a local develop and main exist, no config → the local develop, source origin-head',
		build() {
			const root = createScratchRepository()
			git({ root, args: ['branch', 'develop'] })
			addOriginBranch({ root, branch: 'develop' })
			pointOriginHeadAt({ root, branch: 'develop' })
			return root
		},
		packageJson: {},
		expected: { ref: 'refs/heads/develop', branch: 'develop', source: 'origin-head' },
	},
	{
		title:
			'origin/HEAD names origin/develop, no local develop, main exists → origin develop, source origin-head',
		build() {
			const root = createScratchRepository()
			addOriginBranch({ root, branch: 'develop' })
			pointOriginHeadAt({ root, branch: 'develop' })
			return root
		},
		packageJson: {},
		expected: { ref: 'refs/remotes/origin/develop', branch: 'develop', source: 'origin-head' },
	},
	{
		title: 'no origin/HEAD, main exists → main, source main',
		build: () => createScratchRepository(),
		packageJson: {},
		expected: { ref: 'refs/heads/main', branch: 'main', source: 'main' },
	},
	{
		title:
			'origin/HEAD names origin/old which was deleted (dangling), main exists → the dangling one skipped, main',
		build() {
			const root = createScratchRepository()
			addOriginBranch({ root, branch: 'old' })
			pointOriginHeadAt({ root, branch: 'old' })
			git({ root, args: ['update-ref', '-d', 'refs/remotes/origin/old'] })
			return root
		},
		packageJson: {},
		expected: { ref: 'refs/heads/main', branch: 'main', source: 'main' },
	},
	{
		title:
			'origin/HEAD names origin/old which was deleted, a local old and main exist → the dangling one skipped, even with a local old, main',
		build() {
			const root = createScratchRepository()
			git({ root, args: ['branch', 'old'] })
			addOriginBranch({ root, branch: 'old' })
			pointOriginHeadAt({ root, branch: 'old' })
			git({ root, args: ['update-ref', '-d', 'refs/remotes/origin/old'] })
			return root
		},
		packageJson: {},
		expected: { ref: 'refs/heads/main', branch: 'main', source: 'main' },
	},
	{
		title:
			'a local master and only origin/main exist → origin main: main comes before master, whichever side',
		build() {
			const root = createScratchRepository()
			addOriginBranch({ root, branch: 'main' })
			git({ root, args: ['branch', '-m', 'main', 'master'] })
			return root
		},
		packageJson: {},
		expected: { ref: 'refs/remotes/origin/main', branch: 'main', source: 'main' },
	},
	{
		title:
			'dialecte.baseBranch is release and both a local release and origin/release exist → the local release, source config',
		build() {
			const root = createScratchRepository()
			git({ root, args: ['branch', 'release'] })
			addOriginBranch({ root, branch: 'release' })
			return root
		},
		packageJson: { dialecte: { baseBranch: 'release' } },
		expected: { ref: 'refs/heads/release', branch: 'release', source: 'config' },
	},
	{
		title: 'main and master both exist, no config, no origin/HEAD → main',
		build() {
			const root = createScratchRepository()
			git({ root, args: ['branch', 'master'] })
			return root
		},
		packageJson: {},
		expected: { ref: 'refs/heads/main', branch: 'main', source: 'main' },
	},
	{
		title: 'only master exists → master, source master',
		build() {
			const root = createScratchRepository()
			git({ root, args: ['branch', '-m', 'main', 'master'] })
			return root
		},
		packageJson: {},
		expected: { ref: 'refs/heads/master', branch: 'master', source: 'master' },
	},
	{
		title: 'only origin/main exists, no local main nor master → origin main, source main',
		build() {
			const root = createScratchRepository()
			addOriginBranch({ root, branch: 'main' })
			git({ root, args: ['branch', '-m', 'main', 'work'] })
			return root
		},
		packageJson: {},
		expected: { ref: 'refs/remotes/origin/main', branch: 'main', source: 'main' },
	},
	{
		title: 'only origin/master exists, no local main nor master → origin master, source master',
		build() {
			const root = createScratchRepository()
			addOriginBranch({ root, branch: 'master' })
			git({ root, args: ['branch', '-m', 'main', 'work'] })
			return root
		},
		packageJson: {},
		expected: { ref: 'refs/remotes/origin/master', branch: 'master', source: 'master' },
	},
	{
		title:
			'dialecte.baseBranch is release and a local release exists → the local release, source config',
		build() {
			const root = createScratchRepository()
			git({ root, args: ['branch', 'release'] })
			return root
		},
		packageJson: { dialecte: { baseBranch: 'release' } },
		expected: { ref: 'refs/heads/release', branch: 'release', source: 'config' },
	},
	{
		title:
			'dialecte.baseBranch is release and only origin/release exists → origin release, source config',
		build() {
			const root = createScratchRepository()
			addOriginBranch({ root, branch: 'release' })
			return root
		},
		packageJson: { dialecte: { baseBranch: 'release' } },
		expected: { ref: 'refs/remotes/origin/release', branch: 'release', source: 'config' },
	},
	{
		title:
			'dialecte.baseBranch is release and a local release exists while origin/HEAD names develop → release: the override comes first',
		build() {
			const root = createScratchRepository()
			git({ root, args: ['branch', 'release'] })
			git({ root, args: ['branch', 'develop'] })
			addOriginBranch({ root, branch: 'develop' })
			pointOriginHeadAt({ root, branch: 'develop' })
			return root
		},
		packageJson: { dialecte: { baseBranch: 'release' } },
		expected: { ref: 'refs/heads/release', branch: 'release', source: 'config' },
	},
	{
		title:
			'dialecte.baseBranch is release, no such branch locally or on origin, main exists → refused naming release and dialecte.baseBranch, no fall-through to main',
		build: () => createScratchRepository(),
		packageJson: { dialecte: { baseBranch: 'release' } },
		expected: RELEASE_REFUSAL,
	},
	{
		title:
			'dialecte.baseBranch is release, no such branch, while origin/HEAD names develop → refused, no fall-through to origin/HEAD',
		build() {
			const root = createScratchRepository()
			git({ root, args: ['branch', 'develop'] })
			addOriginBranch({ root, branch: 'develop' })
			pointOriginHeadAt({ root, branch: 'develop' })
			return root
		},
		packageJson: { dialecte: { baseBranch: 'release' } },
		expected: RELEASE_REFUSAL,
	},
	{
		title: 'nothing at all: no config, no origin/HEAD, no main, no master → refused with the ask',
		build: repositoryWithoutMain,
		packageJson: {},
		expected: {
			refusal:
				'no base branch found (no dialecte.baseBranch, no origin/HEAD, no main, no master): name it as dialecte.baseBranch in package.json',
		},
	},
	{
		title: 'a tag named main and no branch named main or master → refused, a tag is no branch',
		build() {
			const root = repositoryWithoutMain()
			git({ root, args: ['tag', 'main'] })
			return root
		},
		packageJson: {},
		expected: { refusal: NO_BASE_BRANCH_FOUND },
	},
	{
		title:
			'a clone holding only origin refs, origin/HEAD naming origin/develop, main also on origin → origin develop, source origin-head',
		build: cloneWithOnlyOriginRefs,
		packageJson: {},
		expected: { ref: 'refs/remotes/origin/develop', branch: 'develop', source: 'origin-head' },
	},
]

describe('findBaseBranchRef', { timeout: SCRATCH_GIT_CASE_TIMEOUT }, () => {
	for (const row of ROWS)
		it(row.title, () => {
			const root = row.build()

			expect(findBaseBranchRef({ root, packageJson: row.packageJson })).toEqual(row.expected)
		})
})

describe('resolveGateBase on the resolver', { timeout: SCRATCH_GIT_CASE_TIMEOUT }, () => {
	it('origin/HEAD names develop, which is ahead of main, HEAD on a branch of develop → the merge-base with develop, source base-branch', () => {
		const { root, develop } = developAheadOfMain()
		makeDevelopOriginDefault(root)
		git({ root, args: ['switch', '-q', '-c', 'feature'] })
		commitEmpty({ root, message: 'feat: feature' })

		expect(resolveGateBase({ root })).toEqual({ commit: develop, source: 'base-branch' })
	})

	it('dialecte.baseBranch is release, no such branch, main exists → a refusal naming release and dialecte.baseBranch', () => {
		const root = createScratchRepository({
			'package.json': '{ "dialecte": { "baseBranch": "release" } }\n',
		})

		expect(resolveGateBase({ root })).toEqual(RELEASE_REFUSAL)
	})

	it('origin/HEAD names develop, HEAD on main which moved on after develop left it → the merge-base with develop, not main itself', () => {
		const { root, start } = developAheadOfMain()
		makeDevelopOriginDefault(root)
		git({ root, args: ['switch', '-q', 'main'] })
		commitEmpty({ root, message: 'feat: main moves' })

		expect(resolveGateBase({ root })).toEqual({ commit: start, source: 'base-branch' })
	})
})
