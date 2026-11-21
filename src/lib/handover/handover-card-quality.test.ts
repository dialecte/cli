import { READY_CARD } from '../../../test/handover-usage.constants.ts'
import {
	COUNT_FILE,
	EMPTY_INDEX,
	MANY_FILE,
	MANY_RESIGNED_SOURCE,
	MANY_SOURCE,
	MANY_USER_FILE,
	MANY_USER_SOURCE,
	COUNT_SOURCE,
	DOC_PAGE,
	EXPORT_SOURCE,
	EXPORT_SOURCE_FILE,
	INDEX_FILE,
	LIBRARY_PACKAGE_JSON,
	PAGE,
	PAGE_BEFORE,
	SIZE_FILE,
	SIZE_INDEX,
	SIZE_RESIGNED_INDEX,
	SIZE_RESIGNED_OPTED_OUT_INDEX,
	SIZE_RESIGNED_OPTED_OUT_SOURCE,
	SIZE_RESIGNED_SOURCE,
	SIZE_SOURCE,
	TOTAL_FILE,
	TOTAL_SOURCE,
} from '../../../test/quality-workspace.constants.ts'
/**
 * The hand-over card reads the quality record of its tree: the `quality` row (failed only for a public export left
 * without docs, never for a record of another tree), its section after `tdd` counted in the verdict's to read, and
 * `--json` holding it. A `--base` record never clears the docs row.
 */
import { commitOf, createQualityLot, runRulesIn } from '../../../test/quality-workspace.ts'
import { git, temporaryFolder, writeFiles } from '../../../test/scratch-repository.ts'
import { SCRATCH_GIT_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { buildHandoverCard, handoverCardData, handoverCardSections } from './handover-card.ts'

import { describe, expect, it } from 'vitest'

import type { HandoverCard } from './handover.types.ts'

/** The library at its base: the size export re-exported, its index entry, the page naming it. */
const LIBRARY_BASE = {
	[EXPORT_SOURCE_FILE]: EXPORT_SOURCE,
	[SIZE_FILE]: SIZE_SOURCE,
	[INDEX_FILE]: SIZE_INDEX,
	[DOC_PAGE]: PAGE,
}

/** The lot's commit re-signing `sizeOf` and its index entry, the page left untouched. */
const RESIGNING = { [SIZE_FILE]: SIZE_RESIGNED_SOURCE, [INDEX_FILE]: SIZE_RESIGNED_INDEX }

/** A library lot whose base commit's parent held the page before main touched it; `commits` its change. */
function libraryLot(commits: readonly Readonly<Record<string, string>>[]): {
	root: string
	cut: string
} {
	return createQualityLot({
		packageJson: LIBRARY_PACKAGE_JSON,
		earlier: { 'package.json': LIBRARY_PACKAGE_JSON, ...LIBRARY_BASE, [DOC_PAGE]: PAGE_BEFORE },
		base: LIBRARY_BASE,
		commits,
	})
}

/** The card of the worktree `root`, written for a lot folder of its own with no lot to commit. */
function cardOf(root: string): HandoverCard {
	return buildHandoverCard({
		root,
		folder: temporaryFolder('dialecte-card-'),
		branch: 'feat/quality',
		head: commitOf({ root, revision: 'HEAD' }),
		notes: undefined,
		lots: [],
		commits: [],
		probe: () => true,
	})
}

/** What the card shows of quality: its row, whether the verdict counts it failed or of another tree, the to read. */
function qualityOf(card: HandoverCard) {
	const section = handoverCardSections(card).sections.find((part) => part.name === 'quality')
	return {
		row: [...card.gates, ...(card.contrib ?? [])].find((line) => line.name === 'quality'),
		failed: card.failedGates.includes('quality'),
		otherTree: card.otherTreeGates.includes('quality'),
		declarations: card.declarations,
		listed: section?.lines.length ?? 0,
	}
}

describe('the card reads the quality record', { timeout: SCRATCH_GIT_CASE_TIMEOUT }, () => {
	const testCases: Record<string, { make: () => string; expected: unknown }> = {
		'a current record with a shared export changed → a warning row with the count, one line listed and counted to read':
			{
				make: () => {
					const lot = createQualityLot({
						base: { [SIZE_FILE]: SIZE_SOURCE, [TOTAL_FILE]: TOTAL_SOURCE },
						commits: [{ [SIZE_FILE]: SIZE_RESIGNED_SOURCE }],
					})
					runRulesIn({ root: lot.root })
					return lot.root
				},
				expected: {
					row: {
						name: 'quality',
						status: 'warning',
						detail: '1 shared export changed (to read ↓)',
					},
					failed: false,
					otherTree: false,
					declarations: 1,
					listed: 1,
				},
			},
		'a current record with a public export left without docs → a failed row naming it, the card blocked':
			{
				make: () => {
					const lot = libraryLot([RESIGNING])
					runRulesIn({ root: lot.root })
					return lot.root
				},
				expected: expect.objectContaining({
					row: expect.objectContaining({
						status: 'failed',
						detail: expect.stringContaining('1 public export without docs: doc.core.sizeOf'),
					}),
					failed: true,
				}),
			},
		'the same docs finding opted out → the row not failed, the opt-out counted': {
			make: () => {
				const lot = libraryLot([
					{
						[SIZE_FILE]: SIZE_RESIGNED_OPTED_OUT_SOURCE,
						[INDEX_FILE]: SIZE_RESIGNED_OPTED_OUT_INDEX,
					},
				])
				runRulesIn({ root: lot.root })
				return lot.root
			},
			expected: expect.objectContaining({
				row: expect.objectContaining({
					status: expect.stringMatching(/^(?:passed|warning)$/),
					detail: expect.stringContaining('1 allowed'),
				}),
				failed: false,
			}),
		},
		'a record, then an uncommitted edit → record of another tree: nothing listed or counted, not blocking':
			{
				make: () => {
					const lot = createQualityLot({
						base: { [SIZE_FILE]: SIZE_SOURCE, [TOTAL_FILE]: TOTAL_SOURCE },
						commits: [{ [SIZE_FILE]: SIZE_RESIGNED_SOURCE }],
					})
					runRulesIn({ root: lot.root })
					writeFiles({ root: lot.root, files: { [COUNT_FILE]: COUNT_SOURCE } })
					return lot.root
				},
				expected: {
					row: {
						name: 'quality',
						status: 'warning',
						detail: 'record of another tree (dialecte rules)',
					},
					failed: false,
					otherTree: false,
					declarations: 0,
					listed: 0,
				},
			},
		'a record whose base the order no longer answers → record of another tree, not blocking': {
			make: () => {
				const lot = createQualityLot({
					base: { [SIZE_FILE]: SIZE_SOURCE, [TOTAL_FILE]: TOTAL_SOURCE },
					commits: [{ [SIZE_FILE]: SIZE_RESIGNED_SOURCE }],
					link: false,
				})
				runRulesIn({ root: lot.root })
				git({ root: lot.root, args: ['branch', '-m', 'main', 'trunk'] })
				return lot.root
			},
			expected: {
				row: {
					name: 'quality',
					status: 'warning',
					detail: 'record of another tree (dialecte rules)',
				},
				failed: false,
				otherTree: false,
				declarations: 0,
				listed: 0,
			},
		},
		'a public entry removed while its page still names it → a note, not a finding: the row not failed, nothing counted':
			{
				make: () => {
					const lot = libraryLot([{ [INDEX_FILE]: EMPTY_INDEX }])
					runRulesIn({ root: lot.root })
					return lot.root
				},
				expected: expect.objectContaining({
					row: expect.objectContaining({ status: expect.stringMatching(/^(?:passed|warning)$/) }),
					failed: false,
					declarations: 0,
				}),
			},
		'a current record with twelve shared exports → twelve counted to read, never the more line': {
			make: () => {
				const lot = createQualityLot({
					base: { [MANY_FILE]: MANY_SOURCE, [MANY_USER_FILE]: MANY_USER_SOURCE },
					commits: [{ [MANY_FILE]: MANY_RESIGNED_SOURCE }],
				})
				runRulesIn({ root: lot.root })
				return lot.root
			},
			expected: expect.objectContaining({ declarations: 12 }),
		},
		'no record → never run on this tree': {
			make: () =>
				createQualityLot({
					base: { [SIZE_FILE]: SIZE_SOURCE, [TOTAL_FILE]: TOTAL_SOURCE },
					commits: [{ [SIZE_FILE]: SIZE_RESIGNED_SOURCE }],
				}).root,
			expected: expect.objectContaining({
				row: { name: 'quality', status: 'warning', detail: 'never run on this tree' },
				failed: false,
			}),
		},
		'a --base record older than the lot base, main having touched the page in its range, after a lot run → the docs row still failed':
			{
				make: () => {
					const lot = libraryLot([RESIGNING])
					runRulesIn({ root: lot.root })
					runRulesIn({
						root: lot.root,
						argv: ['--base', commitOf({ root: lot.root, revision: `${lot.cut}~1` })],
					})
					return lot.root
				},
				expected: expect.objectContaining({
					row: expect.objectContaining({
						status: 'failed',
						detail: expect.stringContaining('1 public export without docs: doc.core.sizeOf'),
					}),
					failed: true,
				}),
			},
		'a --base record newer than the lot base, after a lot run with a docs finding → the docs row stays failed':
			{
				make: () => {
					const lot = libraryLot([RESIGNING, { [COUNT_FILE]: COUNT_SOURCE }])
					runRulesIn({ root: lot.root })
					runRulesIn({
						root: lot.root,
						argv: ['--base', commitOf({ root: lot.root, revision: 'HEAD~1' })],
					})
					return lot.root
				},
				expected: expect.objectContaining({
					row: expect.objectContaining({ status: 'failed' }),
					failed: true,
				}),
			},
	}

	for (const [title, testCase] of Object.entries(testCases))
		it(title, () => {
			const root = testCase.make()

			expect(qualityOf(cardOf(root))).toEqual(testCase.expected)
		})

	it('a current record, the card as --json → it holds quality, its lists current', () => {
		const lot = createQualityLot({
			base: { [SIZE_FILE]: SIZE_SOURCE, [TOTAL_FILE]: TOTAL_SOURCE },
			commits: [{ [SIZE_FILE]: SIZE_RESIGNED_SOURCE }],
		})
		runRulesIn({ root: lot.root })

		expect(handoverCardData(cardOf(lot.root))).toEqual(
			expect.objectContaining({
				quality: expect.objectContaining({
					standing: expect.objectContaining({
						lists: expect.objectContaining({
							kind: 'current',
							sharedExports: [expect.objectContaining({ name: 'sizeOf', allowed: false })],
						}),
					}),
				}),
			}),
		)
	})
})

describe('the quality section of the card', () => {
	it('a card with tdd lines, notes and a current quality record → the quality section right after tdd', () => {
		const card: HandoverCard = {
			...READY_CARD,
			tdd: [{ text: '3 cases proven red → green', hang: 0 }],
			notes: 'npm run check',
			quality: {
				short: 'abc1234',
				standing: {
					lists: {
						kind: 'current',
						base: { commit: `abc1234${'0'.repeat(33)}`, source: 'lot' },
						duplicates: [],
						sharedExports: [
							{
								file: 'src/core/size.ts',
								line: 1,
								name: 'sizeOf',
								folder: 'src/core',
								importers: ['src/use'],
								changes: ['signature'],
								allowed: false,
							},
						],
					},
					docs: {
						kind: 'current',
						base: { commit: `abc1234${'0'.repeat(33)}`, source: 'lot' },
						docs: [],
					},
				},
			},
		}

		expect(handoverCardSections(card).sections.map((section) => section.name)).toEqual([
			undefined,
			'commit',
			'gates',
			'tdd',
			'quality',
			'notes',
		])
	})
})
