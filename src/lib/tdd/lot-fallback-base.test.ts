/** `fallbackLotBaseOf`: the newest of the recorded commit HEAD holds and a release tag descending from it, else none. */
import { commitFiles } from '../../../test/rules-lot-worktree.ts'
import { createScratchRepository, git } from '../../../test/scratch-repository.ts'
import { SCRATCH_GIT_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { fallbackLotBaseOf } from './lot-fallback-base.ts'

import { describe, expect, it } from 'vitest'

import type { FallbackLotBase } from './tdd.types.ts'

const PACKAGE_NAME = 'demo-package'
const RELEASE_TAG = `${PACKAGE_NAME}@v0.2.0`
const OLD_RELEASE_TAG = `${PACKAGE_NAME}@v0.1.0`
const OTHER_TAG = 'other-package@v9.0.0'

/** The id of `ref` in the repository at `root`. */
function commitOf(params: { root: string; ref: string }): string {
	return git({ root: params.root, args: ['rev-parse', `${params.ref}^{commit}`] }).trim()
}

/** A repository holding the package; `main` renamed so no base branch is found; its root and its first commit. */
function packageRepository(): { root: string; first: string } {
	const root = createScratchRepository({
		'package.json': `${JSON.stringify({ name: PACKAGE_NAME })}\n`,
	})
	git({ root, args: ['branch', '-m', 'main', 'trunk'] })
	return { root, first: commitOf({ root, ref: 'HEAD' }) }
}

type Fixture = { root: string; recorded: string; expected: FallbackLotBase | undefined }

const CASES: Record<string, { setup: () => Fixture }> = {
	'the recorded commit HEAD holds, no release tag → the recorded commit': {
		setup() {
			const { root, first } = packageRepository()
			commitFiles({ root, files: { 'a.ts': 'export {}\n' }, message: 'feat: a' })
			return { root, recorded: first, expected: { commit: first, source: 'recorded' } }
		},
	},
	"a release tag of the package on a commit after the recorded one, HEAD holding both → the tag, another package's newer tag ignored":
		{
			setup() {
				const { root, first } = packageRepository()
				commitFiles({ root, files: { 'a.ts': 'export {}\n' }, message: 'feat: a' })
				git({ root, args: ['tag', RELEASE_TAG] })
				const tagged = commitOf({ root, ref: 'HEAD' })
				commitFiles({ root, files: { 'b.ts': 'export {}\n' }, message: 'feat: b' })
				git({ root, args: ['tag', OTHER_TAG] })
				commitFiles({ root, files: { 'c.ts': 'export {}\n' }, message: 'feat: c' })
				return {
					root,
					recorded: first,
					expected: { commit: tagged, source: 'release-tag', tag: RELEASE_TAG },
				}
			},
		},
	'a release tag older than the recorded commit → the recorded commit': {
		setup() {
			const { root } = packageRepository()
			git({ root, args: ['tag', OLD_RELEASE_TAG] })
			commitFiles({ root, files: { 'a.ts': 'export {}\n' }, message: 'feat: a' })
			const recorded = commitOf({ root, ref: 'HEAD' })
			commitFiles({ root, files: { 'b.ts': 'export {}\n' }, message: 'feat: b' })
			return { root, recorded, expected: { commit: recorded, source: 'recorded' } }
		},
	},
	'a recorded commit HEAD does not hold, a release tag on HEAD → no base': {
		setup() {
			const { root } = packageRepository()
			git({ root, args: ['checkout', '-q', '-b', 'feat/elsewhere'] })
			commitFiles({ root, files: { 'a.ts': 'export {}\n' }, message: 'feat: elsewhere' })
			const recorded = commitOf({ root, ref: 'HEAD' })
			git({ root, args: ['checkout', '-q', 'trunk'] })
			commitFiles({ root, files: { 'b.ts': 'export {}\n' }, message: 'feat: b' })
			git({ root, args: ['tag', RELEASE_TAG] })
			return { root, recorded, expected: undefined }
		},
	},
	'a recorded commit git cannot read, a release tag on HEAD → no base': {
		setup() {
			const { root } = packageRepository()
			git({ root, args: ['tag', RELEASE_TAG] })
			return { root, recorded: 'a'.repeat(40), expected: undefined }
		},
	},
}

describe('fallbackLotBaseOf', { timeout: SCRATCH_GIT_CASE_TIMEOUT }, () => {
	for (const [title, testCase] of Object.entries(CASES))
		it(title, () => {
			const { root, recorded, expected } = testCase.setup()

			expect(fallbackLotBaseOf({ root, recorded })).toEqual(expected)
		})
})
