import {
	APP_DEFINITION,
	APP_DEFINITION_FILE,
	APP_DIALECTE_PACKAGE,
	APP_DIALECTE_PACKAGE_FILE,
	APP_GONE,
	APP_GONE_FILE,
	APP_PACKAGE_JSON,
	APP_PLAIN,
	APP_PLAIN_FILE,
	APP_PLAIN_RESIGNED,
	APP_SIZE,
	APP_SIZE_FILE,
	APP_SIZE_RESIGNED,
	APP_USER,
	APP_USER_FILE,
	DOC_PAGE,
	EXPORT_SOURCE,
	EXPORT_SOURCE_FILE,
	EXPORT_SOURCE_GROWN,
	INDEX_FILE,
	LABEL_FILE,
	LABEL_SOURCE,
	LIBRARY_PACKAGE_JSON,
	OWNER_LABEL_FILE,
	OWNER_LABEL_SOURCE,
	PAGE,
	PAGE_TOUCHED,
	SIZE_FILE,
	SIZE_INDEX,
	SIZE_RESIGNED_INDEX,
	SIZE_RESIGNED_SOURCE,
	SIZE_ROUTE,
	SIZE_SOURCE,
	TOTAL_FILE,
	TOTAL_SOURCE,
} from '../../../test/quality-workspace.constants.ts'
/**
 * The base-aware rules on a commit (the pull request body's HEAD): the committed change only, its public API and doc
 * pages read at that commit, an app restricted to its Dialecte changes as `rules` restricts it.
 */
import { createQualityLot } from '../../../test/quality-workspace.ts'
import { SCRATCH_GIT_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { checkBaseAware } from './check-base-aware.ts'

import { describe, expect, it } from 'vitest'

import type { QualityResult } from './quality.types.ts'

/** The library at its base: the size export re-exported, its index entry, the page naming it. */
const LIBRARY_BASE = {
	[EXPORT_SOURCE_FILE]: EXPORT_SOURCE,
	[SIZE_FILE]: SIZE_SOURCE,
	[INDEX_FILE]: SIZE_INDEX,
	[DOC_PAGE]: PAGE,
}

/** What the run found, by name, each list sorted: the duplicates, the shared exports with their changes, the docs routes, the API. */
function foundOf(result: QualityResult) {
	return {
		duplicates: result.duplicates.map((duplicate) => duplicate.name).sort(),
		sharedExports: result.sharedExports
			.map((shared) => `${shared.name} ${shared.changes.join(', ')}`)
			.sort(),
		docs: result.docs.map((docs) => docs.route).sort(),
		publicApi: result.publicApi.kind,
	}
}

describe('checkBaseAware on HEAD', { timeout: SCRATCH_GIT_CASE_TIMEOUT }, () => {
	const testCases: Record<
		string,
		{ make: () => { root: string; cut: string }; expected: Partial<ReturnType<typeof foundOf>> }
	> = {
		'a committed shared export change, an uncommitted function duplicating an existing one → the change found, the duplicate not':
			{
				make: () =>
					createQualityLot({
						base: {
							[SIZE_FILE]: SIZE_SOURCE,
							[TOTAL_FILE]: TOTAL_SOURCE,
							[LABEL_FILE]: LABEL_SOURCE,
						},
						commits: [{ [SIZE_FILE]: SIZE_RESIGNED_SOURCE }],
						uncommitted: { [OWNER_LABEL_FILE]: OWNER_LABEL_SOURCE },
					}),
				expected: { duplicates: [], sharedExports: ['sizeOf signature, behaviour'] },
			},
		'a committed re-signed public entry, its page touched only in the worktree → the docs finding of HEAD':
			{
				make: () =>
					createQualityLot({
						packageJson: LIBRARY_PACKAGE_JSON,
						base: LIBRARY_BASE,
						commits: [{ [SIZE_FILE]: SIZE_RESIGNED_SOURCE, [INDEX_FILE]: SIZE_RESIGNED_INDEX }],
						uncommitted: { [DOC_PAGE]: PAGE_TOUCHED },
					}),
				expected: { publicApi: 'compared', docs: [SIZE_ROUTE] },
			},
		'a committed re-signed export whose index is updated only in the worktree → the public API of HEAD: unknown, no docs finding':
			{
				make: () =>
					createQualityLot({
						packageJson: LIBRARY_PACKAGE_JSON,
						base: LIBRARY_BASE,
						commits: [
							{ [SIZE_FILE]: SIZE_RESIGNED_SOURCE, [EXPORT_SOURCE_FILE]: EXPORT_SOURCE_GROWN },
						],
						uncommitted: { [INDEX_FILE]: SIZE_RESIGNED_INDEX },
					}),
				expected: { publicApi: 'unknown', docs: [] },
			},
		'an app, its Dialecte change and a plain change committed, a file deleted, the Dialecte file put back in the worktree → the findings of HEAD on the Dialecte changes only':
			{
				make: () =>
					createQualityLot({
						packageJson: APP_PACKAGE_JSON,
						base: {
							[APP_DIALECTE_PACKAGE_FILE]: APP_DIALECTE_PACKAGE,
							[APP_DEFINITION_FILE]: APP_DEFINITION,
							[APP_SIZE_FILE]: APP_SIZE,
							[APP_PLAIN_FILE]: APP_PLAIN,
							[APP_GONE_FILE]: APP_GONE,
							[APP_USER_FILE]: APP_USER,
						},
						commits: [{ [APP_SIZE_FILE]: APP_SIZE_RESIGNED, [APP_PLAIN_FILE]: APP_PLAIN_RESIGNED }],
						committedDeletions: [APP_GONE_FILE],
						uncommitted: { [APP_SIZE_FILE]: APP_SIZE },
					}),
				expected: { sharedExports: ['goneOf removed', 'sizeOf signature, behaviour'] },
			},
	}

	for (const [title, testCase] of Object.entries(testCases))
		it(title, () => {
			const lot = testCase.make()

			expect(
				foundOf(
					checkBaseAware({
						root: lot.root,
						base: { commit: lot.cut, source: 'lot' },
						tree: { kind: 'revision', revision: 'HEAD' },
					}),
				),
			).toEqual(expect.objectContaining(testCase.expected))
		})
})
