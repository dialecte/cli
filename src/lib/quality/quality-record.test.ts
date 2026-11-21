import {
	COUNT_FILE,
	COUNT_RESIGNED_SOURCE,
	COUNT_SOURCE,
	DOC_PAGE,
	EXPORT_SOURCE,
	EXPORT_SOURCE_FILE,
	INDEX_FILE,
	LIBRARY_PACKAGE_JSON,
	PAGE,
	PAGE_BEFORE,
	QUALITY_PACKAGE_JSON,
	SIZE_FILE,
	SIZE_INDEX,
	SIZE_RESIGNED_INDEX,
	SIZE_RESIGNED_SOURCE,
	SIZE_ROUTE,
	SIZE_SOURCE,
	SUM_FILE,
	SUM_SOURCE,
	TOTAL_FILE,
	TOTAL_OPTED_OUT_SOURCE,
	TOTAL_SOURCE,
} from '../../../test/quality-workspace.constants.ts'
/**
 * The quality record keeps every finding with its opt-out and, on a `--base` run, the lot run's docs; its reader tells
 * the card whether the record judged this tree against the base the order answers now.
 */
import { commitOf, createQualityLot, runRulesIn } from '../../../test/quality-workspace.ts'
import { git, writeFiles } from '../../../test/scratch-repository.ts'
import { SCRATCH_GIT_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { writeRecord } from '../gate-records/gate-records.ts'
import { computeStateHash } from '../gate-records/state-hash.ts'
import { readQualityRecord, readQualityStanding } from './quality-record.ts'
import { QUALITY_RECORD_FILE } from './quality.constants.ts'

import { describe, expect, it } from 'vitest'

/** The library at its base: the size export re-exported, its index entry, the page naming it. */
const LIBRARY_BASE = {
	[EXPORT_SOURCE_FILE]: EXPORT_SOURCE,
	[SIZE_FILE]: SIZE_SOURCE,
	[INDEX_FILE]: SIZE_INDEX,
	[DOC_PAGE]: PAGE,
}

/** The lot's commit re-signing `sizeOf` and its index entry, the page left untouched. */
const RESIGNING = { [SIZE_FILE]: SIZE_RESIGNED_SOURCE, [INDEX_FILE]: SIZE_RESIGNED_INDEX }

/** The docs finding of the re-signed `sizeOf`, not opted out. */
const SIZE_DOCS = expect.objectContaining({ route: SIZE_ROUTE, allowed: false })

/** A library lot whose base commit has a parent (the earlier page), its change re-signing `sizeOf`. */
function libraryLot(params: { commits?: readonly Readonly<Record<string, string>>[] } = {}) {
	return createQualityLot({
		packageJson: LIBRARY_PACKAGE_JSON,
		earlier: { 'package.json': LIBRARY_PACKAGE_JSON, ...LIBRARY_BASE, [DOC_PAGE]: PAGE_BEFORE },
		base: LIBRARY_BASE,
		commits: params.commits ?? [RESIGNING],
	})
}

describe('the quality record keeps', { timeout: SCRATCH_GIT_CASE_TIMEOUT }, () => {
	const testCases: Record<string, { make: () => string; expected: unknown }> = {
		'a bare run with one shared export silenced by an opt-out and one not → both kept, the silenced one allowed, schema 2':
			{
				make: () => {
					const lot = createQualityLot({
						base: {
							[SIZE_FILE]: SIZE_SOURCE,
							[TOTAL_FILE]: TOTAL_OPTED_OUT_SOURCE,
							[COUNT_FILE]: COUNT_SOURCE,
							[SUM_FILE]: SUM_SOURCE,
						},
						commits: [{ [COUNT_FILE]: COUNT_RESIGNED_SOURCE }],
						deleted: [SIZE_FILE],
					})
					runRulesIn({ root: lot.root })
					return lot.root
				},
				expected: expect.objectContaining({
					schema: 2,
					sharedExports: expect.arrayContaining([
						expect.objectContaining({ name: 'countOf', allowed: false }),
						expect.objectContaining({ name: 'sizeOf', changes: ['removed'], allowed: true }),
					]),
				}),
			},
		"a --base run after a lot run on the same tree → the lot run's docs carried as lotDocs, with its tree and base":
			{
				make: () => {
					const lot = libraryLot()
					runRulesIn({ root: lot.root })
					runRulesIn({
						root: lot.root,
						argv: ['--base', commitOf({ root: lot.root, revision: `${lot.cut}~1` })],
					})
					return lot.root
				},
				expected: expect.objectContaining({
					base: expect.objectContaining({ source: 'flag' }),
					lotDocs: {
						stateHash: expect.any(String),
						base: expect.objectContaining({ source: 'lot' }),
						docs: [SIZE_DOCS],
					},
				}),
			},
	}

	for (const [title, testCase] of Object.entries(testCases))
		it(title, () => {
			const root = testCase.make()

			expect(readQualityRecord(root)).toEqual(testCase.expected)
		})
})

describe('readQualityStanding', { timeout: SCRATCH_GIT_CASE_TIMEOUT }, () => {
	const testCases: Record<string, { make: () => string; expected: unknown }> = {
		'a lot run on this tree, its base the one the order answers → lists and docs current': {
			make: () => {
				const lot = libraryLot()
				runRulesIn({ root: lot.root })
				return lot.root
			},
			expected: {
				lists: expect.objectContaining({
					kind: 'current',
					base: expect.objectContaining({ source: 'lot' }),
				}),
				docs: expect.objectContaining({ kind: 'current', docs: [SIZE_DOCS] }),
			},
		},
		'a lot run, then an uncommitted edit → other-tree': {
			make: () => {
				const lot = libraryLot()
				runRulesIn({ root: lot.root })
				writeFiles({ root: lot.root, files: { [COUNT_FILE]: COUNT_SOURCE } })
				return lot.root
			},
			expected: { lists: { kind: 'other-tree' }, docs: { kind: 'other-tree' } },
		},
		"a run on the base branch's merge-base, then the base branch renamed away (the order answers nothing) → other-tree":
			{
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
				expected: { lists: { kind: 'other-tree' }, docs: { kind: 'other-tree' } },
			},
		"a run on the base branch's merge-base, then the base branch moved back to an older commit (the order answers another commit), the tree unchanged → other-tree":
			{
				make: () => {
					const files = {
						'package.json': QUALITY_PACKAGE_JSON,
						[SIZE_FILE]: SIZE_SOURCE,
						[TOTAL_FILE]: TOTAL_SOURCE,
					}
					const lot = createQualityLot({
						earlier: files,
						base: { ...files, [COUNT_FILE]: COUNT_SOURCE },
						commits: [{ [SIZE_FILE]: SIZE_RESIGNED_SOURCE }],
						link: false,
					})
					runRulesIn({ root: lot.root })
					git({
						root: lot.root,
						args: [
							'update-ref',
							'refs/heads/main',
							commitOf({ root: lot.root, revision: `${lot.cut}~1` }),
						],
					})
					return lot.root
				},
				expected: { lists: { kind: 'other-tree' }, docs: { kind: 'other-tree' } },
			},
		'a lot run, an uncommitted edit, then a --base run on an ancestor of the lot base → lists current, docs none (the lot run judged another tree)':
			{
				make: () => {
					const lot = libraryLot()
					runRulesIn({ root: lot.root })
					writeFiles({ root: lot.root, files: { [COUNT_FILE]: COUNT_SOURCE } })
					runRulesIn({
						root: lot.root,
						argv: ['--base', commitOf({ root: lot.root, revision: `${lot.cut}~1` })],
					})
					return lot.root
				},
				expected: {
					lists: expect.objectContaining({
						kind: 'current',
						base: expect.objectContaining({ source: 'flag' }),
					}),
					docs: { kind: 'none' },
				},
			},
		'no record → none': {
			make: () => libraryLot().root,
			expected: { lists: { kind: 'none' }, docs: { kind: 'none' } },
		},
		'a record of schema 1 on this tree → none': {
			make: () => {
				const lot = libraryLot()
				writeRecord({
					root: lot.root,
					name: QUALITY_RECORD_FILE,
					record: {
						schema: 1,
						at: '2026-11-18T00:00:00.000Z',
						head: commitOf({ root: lot.root, revision: 'HEAD' }),
						stateHash: computeStateHash(lot.root),
						base: { commit: lot.cut, source: 'lot' },
						examined: [SIZE_FILE],
						duplicates: [],
						sharedExports: [],
						publicApi: { kind: 'compared', entries: [] },
						docs: [],
						aliasesChanged: false,
						allowed: {},
					},
				})
				return lot.root
			},
			expected: { lists: { kind: 'none' }, docs: { kind: 'none' } },
		},
		'a --base run on an ancestor of the lot base, no lot run before → lists current, docs none': {
			make: () => {
				const lot = libraryLot()
				runRulesIn({
					root: lot.root,
					argv: ['--base', commitOf({ root: lot.root, revision: `${lot.cut}~1` })],
				})
				return lot.root
			},
			expected: {
				lists: expect.objectContaining({
					kind: 'current',
					base: expect.objectContaining({ source: 'flag' }),
				}),
				docs: { kind: 'none' },
			},
		},
		"a --base run on an ancestor of the lot base after a lot run → lists current, the docs row the lot run's":
			{
				make: () => {
					const lot = libraryLot()
					runRulesIn({ root: lot.root })
					runRulesIn({
						root: lot.root,
						argv: ['--base', commitOf({ root: lot.root, revision: `${lot.cut}~1` })],
					})
					return lot.root
				},
				expected: {
					lists: expect.objectContaining({
						kind: 'current',
						base: expect.objectContaining({ source: 'flag' }),
					}),
					docs: expect.objectContaining({
						kind: 'current',
						base: expect.objectContaining({ source: 'lot' }),
						docs: [SIZE_DOCS],
					}),
				},
			},
		'a --base run on a commit newer than the lot base → lists other-tree': {
			make: () => {
				const lot = libraryLot({ commits: [RESIGNING, { [COUNT_FILE]: COUNT_SOURCE }] })
				runRulesIn({
					root: lot.root,
					argv: ['--base', commitOf({ root: lot.root, revision: 'HEAD~1' })],
				})
				return lot.root
			},
			expected: { lists: { kind: 'other-tree' }, docs: { kind: 'none' } },
		},
	}

	for (const [title, testCase] of Object.entries(testCases))
		it(title, () => {
			const root = testCase.make()

			expect(readQualityStanding({ root, stateHash: computeStateHash(root) })).toEqual(
				testCase.expected,
			)
		})
})
