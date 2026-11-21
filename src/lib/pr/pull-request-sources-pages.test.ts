/** The pull request body reads the doc pages at its committed head: a page edited only in the worktree never counts. */
import { pullRequestLot } from '../../../test/lot-pr.ts'
import {
	DOC_PAGE,
	EXPORT_SOURCE,
	EXPORT_SOURCE_FILE,
	INDEX_FILE,
	LIBRARY_PACKAGE_JSON,
	PAGE,
	SIZE_FILE,
	SIZE_INDEX,
	SIZE_RESIGNED_INDEX,
	SIZE_RESIGNED_SOURCE,
	SIZE_ROUTE,
	SIZE_SOURCE,
} from '../../../test/quality-workspace.constants.ts'
import { writeFiles } from '../../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { readPullRequestSources } from './pull-request-sources.ts'

import { describe, expect, it } from 'vitest'

/** The library at main: the size export re-exported, its index entry, the page naming it. */
const LIBRARY_MAIN = {
	'package.json': LIBRARY_PACKAGE_JSON,
	[EXPORT_SOURCE_FILE]: EXPORT_SOURCE,
	[SIZE_FILE]: SIZE_SOURCE,
	[INDEX_FILE]: SIZE_INDEX,
	[DOC_PAGE]: PAGE,
}

describe(
	'readPullRequestSources reads the doc pages at HEAD',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it('a re-signed export its committed page names, the page rewritten in the worktree to name it no more → the docs finding of HEAD', () => {
			const lot = pullRequestLot({
				mainFiles: LIBRARY_MAIN,
				lotFiles: {
					'changes/x.md': '### Added\n\n- `x` answers one.\n',
					[SIZE_FILE]: SIZE_RESIGNED_SOURCE,
					[INDEX_FILE]: SIZE_RESIGNED_INDEX,
				},
			})
			writeFiles({ root: lot.worktree, files: { [DOC_PAGE]: '# Core\n\nCounts a list.\n' } })

			const sources = readPullRequestSources({
				lotFolder: lot.lotFolder,
				worktree: lot.worktree,
				baseRef: 'main',
			})

			expect('refusal' in sources ? sources : sources.quality).toEqual(
				expect.objectContaining({
					kind: 'judged',
					docs: [expect.objectContaining({ route: SIZE_ROUTE, allowed: false })],
				}),
			)
		})
	},
)
