import {
	DOC_PAGE,
	EXPORT_SOURCE,
	EXPORT_SOURCE_FILE,
	EXPORT_SOURCE_GROWN,
	INDEX_FILE,
	LIBRARY_PACKAGE_JSON,
	PAGE,
	SIZE_FILE,
	SIZE_INDEX,
	SIZE_RESIGNED_SOURCE,
	SIZE_SOURCE,
	TOTAL_FILE,
	TOTAL_SOURCE,
} from '../../../test/quality-workspace.constants.ts'
/**
 * The card's quality row where nothing could be judged: a record whose public API is unknown (the docs not judged,
 * never a pass), and a package with no base and no record (never run on this tree, never left out).
 */
import { commitOf, createQualityLot, runRulesIn } from '../../../test/quality-workspace.ts'
import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { SCRATCH_GIT_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { buildHandoverCard } from './handover-card.ts'

import { describe, expect, it } from 'vitest'

/** The `quality` row of the card of the worktree `root`, written for a lot folder of its own with no lot to commit. */
function qualityRowOf(root: string) {
	const card = buildHandoverCard({
		root,
		folder: temporaryFolder('dialecte-card-'),
		branch: 'feat/quality',
		head: commitOf({ root, revision: 'HEAD' }),
		notes: undefined,
		lots: [],
		commits: [],
		probe: () => true,
	})
	return [...card.gates, ...(card.contrib ?? [])].find((line) => line.name === 'quality')
}

describe(
	'the card where quality could not be judged',
	{ timeout: SCRATCH_GIT_CASE_TIMEOUT },
	() => {
		const testCases: Record<string, { make: () => string; expected: unknown }> = {
			'a record whose public API is unknown (an export source changed, the index not) → a warning: docs not judged, with why':
				{
					make: () => {
						const lot = createQualityLot({
							packageJson: LIBRARY_PACKAGE_JSON,
							base: {
								[EXPORT_SOURCE_FILE]: EXPORT_SOURCE,
								[SIZE_FILE]: SIZE_SOURCE,
								[INDEX_FILE]: SIZE_INDEX,
								[DOC_PAGE]: PAGE,
							},
							commits: [{ [EXPORT_SOURCE_FILE]: EXPORT_SOURCE_GROWN }],
						})
						runRulesIn({ root: lot.root })
						return lot.root
					},
					expected: {
						name: 'quality',
						status: 'warning',
						detail: expect.stringContaining(
							'docs: not judged (an export source changed while every api.json did not: run dialecte skills generate)',
						),
					},
				},
			'a package outside any lot, no base branch, no record → the row: never run on this tree': {
				make: () =>
					createQualityLot({
						base: { [SIZE_FILE]: SIZE_SOURCE, [TOTAL_FILE]: TOTAL_SOURCE },
						commits: [{ [SIZE_FILE]: SIZE_RESIGNED_SOURCE }],
						link: false,
						baseBranch: 'absent',
					}).root,
				expected: { name: 'quality', status: 'warning', detail: 'never run on this tree' },
			},
		}

		for (const [title, testCase] of Object.entries(testCases))
			it(title, () => {
				const root = testCase.make()

				expect(qualityRowOf(root)).toEqual(testCase.expected)
			})
	},
)
