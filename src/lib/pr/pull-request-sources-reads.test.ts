/**
 * The body never judges what it could not read at its head: a listed file the batch read did not return (a source
 * file, an api index), or a diff of the base that fails, is `not judged` with why, never an empty text or nothing found.
 */
import { execFileSync } from 'node:child_process'

import { pullRequestLot } from '../../../test/lot-pr.ts'
import {
	QUALITY_PACKAGE_JSON,
	SIZE_FILE,
	SIZE_RESIGNED_SOURCE,
	SIZE_SOURCE,
	TOTAL_FILE,
	TOTAL_SOURCE,
} from '../../../test/quality-workspace.constants.ts'
import { git } from '../../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { readPullRequestSources } from './pull-request-sources.ts'

import { describe, expect, it } from 'vitest'

import type { PullRequestLot } from '../../../test/lot-pr.types.ts'

/** The lot's fragment, kept beside the files a case's commit writes. */
const FRAGMENT = { 'changes/x.md': '### Added\n\n- `x` answers one.\n' }

/** A commit no repository holds: what a gitlink entry names, so a batch read of its path returns nothing. */
const ABSENT_COMMIT = '1234567890abcdef1234567890abcdef12345678'

/** A commit object naming a tree the repository does not hold: it resolves, but a diff from it fails. */
const TREELESS_COMMIT = [
	'tree 1111111111111111111111111111111111111111',
	'author person-a <person-a@example.com> 0 +0000',
	'committer person-a <person-a@example.com> 0 +0000',
	'',
	'a commit whose tree is gone',
	'',
].join('\n')

/** A package whose lot changes a shared export: judged, unless a read fails. */
function judgedLot(): PullRequestLot {
	return pullRequestLot({
		mainFiles: {
			'package.json': QUALITY_PACKAGE_JSON,
			[SIZE_FILE]: SIZE_SOURCE,
			[TOTAL_FILE]: TOTAL_SOURCE,
		},
		lotFiles: { ...FRAGMENT, [SIZE_FILE]: SIZE_RESIGNED_SOURCE },
	})
}

/** One more commit in the lot's worktree adding `path` as a gitlink: listed by `ls-tree`, never read as a blob. */
function commitGitlink(params: { lot: PullRequestLot; path: string }): void {
	const root = params.lot.worktree
	git({
		root,
		args: ['update-index', '--add', '--cacheinfo', `160000,${ABSENT_COMMIT},${params.path}`],
	})
	git({ root, args: ['commit', '-qm', 'chore: a link'] })
}

/** The body's quality of `lot` against `baseRef`, its refusal, or what a throw says, as a value. */
function bodyQualityOutcomeOf(params: { lot: PullRequestLot; baseRef: string }): unknown {
	try {
		const sources = readPullRequestSources({
			lotFolder: params.lot.lotFolder,
			worktree: params.lot.worktree,
			baseRef: params.baseRef,
		})
		return 'refusal' in sources ? sources : sources.quality
	} catch (error) {
		return { threw: error instanceof Error ? error.message : String(error) }
	}
}

describe('the body on reads that fail at its head', { timeout: STORE_CASE_TIMEOUT }, () => {
	const testCases: Record<
		string,
		{ make: () => { lot: PullRequestLot; baseRef: string }; expected: unknown }
	> = {
		'a source file the head lists that the batch read does not return → not judged, naming it': {
			make: () => {
				const lot = judgedLot()
				commitGitlink({ lot, path: 'src/vendor.ts' })
				return { lot, baseRef: 'main' }
			},
			expected: { kind: 'not-judged', why: expect.stringContaining('src/vendor.ts') },
		},
		'an api index the head lists that the batch read does not return → not judged, naming it': {
			make: () => {
				const lot = judgedLot()
				commitGitlink({ lot, path: 'skills/demo/references/api.json' })
				return { lot, baseRef: 'main' }
			},
			expected: {
				kind: 'not-judged',
				why: expect.stringContaining('skills/demo/references/api.json'),
			},
		},
		'a base that resolves to a commit whose tree is gone (the diff fails) → not judged': {
			make: () => {
				const lot = judgedLot()
				const base = execFileSync(
					'git',
					['hash-object', '-t', 'commit', '--literally', '-w', '--stdin'],
					{ cwd: lot.worktree, input: TREELESS_COMMIT, encoding: 'utf8' },
				).trim()
				return { lot, baseRef: base }
			},
			expected: { kind: 'not-judged', why: expect.any(String) },
		},
	}

	for (const [title, testCase] of Object.entries(testCases))
		it(title, () => {
			const { lot, baseRef } = testCase.make()

			expect(bodyQualityOutcomeOf({ lot, baseRef })).toEqual(testCase.expected)
		})
})
