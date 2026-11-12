import {
	commitEmpty,
	developAheadOfMain,
	makeDevelopOriginDefault,
} from '../../../test/rule-gaps-base-branch.ts'
import { git, initializeRepository, temporaryFolder } from '../../../test/scratch-repository.ts'
import { SCRATCH_GIT_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { NO_CONFIGURED_BASE_BRANCH } from '../gate/gate-base.constants.ts'
import { checkTddReceipts } from './check-tdd-receipts.ts'
import { resolveBase } from './tdd-files.ts'

import { describe, expect, it } from 'vitest'

describe('resolveBase: the whole-branch base', { timeout: SCRATCH_GIT_CASE_TIMEOUT }, () => {
	it('origin/HEAD names develop, develop ahead of main, HEAD on a branch of develop, no hygiene baseline → the merge-base with develop', () => {
		const { root, develop } = developAheadOfMain()
		makeDevelopOriginDefault(root)
		git({ root, args: ['switch', '-q', '-c', 'feature'] })
		commitEmpty({ root, message: 'feat: feature' })

		expect(resolveBase({ root, packageJson: {}, wholeBranch: true })).toBe(develop)
	})
})

describe(
	'checkTddReceipts: the whole-branch base when dialecte.baseBranch is set',
	{ timeout: SCRATCH_GIT_CASE_TIMEOUT },
	() => {
		it('R3-5 dialecte.baseBranch names a branch that exists nowhere, no hygiene baseline → failed with the text naming that branch, not a fall back to HEAD', async () => {
			const { root } = developAheadOfMain()

			const check = await checkTddReceipts({
				root,
				packageJson: { dialecte: { baseBranch: 'release' } },
				wholeBranch: true,
			})

			expect(check).toEqual({
				status: 'failed',
				reason: NO_CONFIGURED_BASE_BRANCH.replace('{branch}', 'release'),
			})
		})

		it('no dialecte.baseBranch and no base branch found (no origin, no main, no master) → the HEAD fallback, not a failure', async () => {
			const root = initializeRepository({ root: temporaryFolder('dialecte-base-branch-') })
			git({ root, args: ['branch', '-m', 'trunk'] })

			const check = await checkTddReceipts({ root, packageJson: {}, wholeBranch: true })

			expect(check.status).not.toBe('failed')
		})
	},
)
