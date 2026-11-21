/**
 * The card's quality row and section, from where the record stands: the counts to read, a public export left without
 * docs (failed), a record of another tree (never failed, nothing listed), never run; at most ten lines per kind.
 */
import { buildQualityLine, buildQualitySection } from './quality-card.ts'

import { describe, expect, it } from 'vitest'

import type { CardLine } from '../card/card.types.ts'
import type {
	DocsNotUpdated,
	DuplicateRead,
	QualityStanding,
	RecordedFinding,
	SharedExportChange,
} from './quality.types.ts'

/** The record's base as the card shows it. */
const SHORT = 'abc1234'
const LOT_BASE = { commit: `${SHORT}${'0'.repeat(33)}`, source: 'lot' as const }

const READS_DUPLICATE: RecordedFinding<DuplicateRead> = {
	file: 'src/read/keys.ts',
	line: 3,
	name: 'keysOfRecord',
	signal: 'reads',
	existing: { file: 'src/read/owner.ts', line: 3, name: 'readOwner' },
	element: 'Widget',
	attributes: ['@NAMING'],
	allowed: false,
}
const FIND_DUPLICATE: RecordedFinding<DuplicateRead> = {
	file: 'src/find/owner.ts',
	line: 2,
	name: 'ownerWidgetLabel',
	signal: 'find',
	existing: { file: 'src/find/label.ts', line: 2, name: 'widgetLabel' },
	allowed: false,
}
const SIZE_CHANGED: RecordedFinding<SharedExportChange> = {
	file: 'src/core/size.ts',
	line: 1,
	name: 'sizeOf',
	folder: 'src/core',
	importers: ['src/use'],
	changes: ['signature', 'behaviour'],
	allowed: false,
}
const COUNT_CHANGED: RecordedFinding<SharedExportChange> = {
	...SIZE_CHANGED,
	file: 'src/core/count.ts',
	name: 'countOf',
}
const TOTAL_SHARED: RecordedFinding<SharedExportChange> = {
	...SIZE_CHANGED,
	file: 'src/use/total.ts',
	name: 'total',
	folder: 'src/use',
	importers: ['src/view'],
	changes: ['newly-shared'],
}
const SIZE_DOCS: RecordedFinding<DocsNotUpdated> = {
	route: 'doc.core.sizeOf',
	change: 'signature',
	declaredAt: 'src/core/size.ts:1',
	pages: ['doc/api/core.md'],
	allowed: false,
}

/** Two duplicate reads and three shared exports changed, no docs finding: a record of this tree. */
const TO_READ: QualityStanding = {
	lists: {
		kind: 'current',
		base: LOT_BASE,
		duplicates: [READS_DUPLICATE, FIND_DUPLICATE],
		sharedExports: [SIZE_CHANGED, COUNT_CHANGED, TOTAL_SHARED],
	},
	docs: { kind: 'current', base: LOT_BASE, docs: [] },
}

/** One public export left without docs, nothing else. */
const DOCS_LEFT: QualityStanding = {
	lists: { kind: 'current', base: LOT_BASE, duplicates: [], sharedExports: [] },
	docs: { kind: 'current', base: LOT_BASE, docs: [SIZE_DOCS] },
}

/** The same docs finding opted out. */
const DOCS_OPTED_OUT: QualityStanding = {
	lists: { kind: 'current', base: LOT_BASE, duplicates: [], sharedExports: [] },
	docs: { kind: 'current', base: LOT_BASE, docs: [{ ...SIZE_DOCS, allowed: true }] },
}

/** A record of another tree, its findings never shown. */
const OTHER_TREE: QualityStanding = {
	lists: { kind: 'other-tree' },
	docs: { kind: 'other-tree' },
}

/** A `--base` record newer than the lot base (lists of another tree), the lot run's docs row still failing. */
const NEWER_FLAG_DOCS_LEFT: QualityStanding = {
	lists: { kind: 'other-tree' },
	docs: { kind: 'current', base: LOT_BASE, docs: [SIZE_DOCS] },
}

/** Twelve shared exports changed. */
const TWELVE_SHARED: QualityStanding = {
	lists: {
		kind: 'current',
		base: LOT_BASE,
		duplicates: [],
		sharedExports: Array.from({ length: 12 }, (_, index) => ({
			...SIZE_CHANGED,
			name: `size${index + 1}Of`,
			line: index + 1,
		})),
	},
	docs: { kind: 'current', base: LOT_BASE, docs: [] },
}

describe('buildQualityLine', () => {
	const testCases: Record<string, { standing: QualityStanding; expected: unknown }> = {
		'a current record with duplicate reads and shared exports → a warning row with the counts, to read below':
			{
				standing: TO_READ,
				expected: {
					name: 'quality',
					status: 'warning',
					detail: '2 duplicate reads · 3 shared exports changed (to read ↓)',
				},
			},
		'a current record with a public export left without docs → a failed row naming its entry': {
			standing: DOCS_LEFT,
			expected: {
				name: 'quality',
				status: 'failed',
				detail: '1 public export without docs: doc.core.sizeOf',
			},
		},
		'the same docs finding opted out → the row not failed, the opt-out counted': {
			standing: DOCS_OPTED_OUT,
			expected: expect.objectContaining({
				name: 'quality',
				status: expect.stringMatching(/^(?:passed|warning)$/),
				detail: expect.stringContaining('1 allowed'),
			}),
		},
		'a record of another tree → a warning row saying so, never stale': {
			standing: OTHER_TREE,
			expected: {
				name: 'quality',
				status: 'warning',
				detail: 'record of another tree (dialecte rules)',
			},
		},
		'a current --base record, no docs row → the row names its base: since <short>, --base': {
			standing: {
				lists: {
					kind: 'current',
					base: { ...LOT_BASE, source: 'flag' },
					duplicates: [READS_DUPLICATE],
					sharedExports: [SIZE_CHANGED],
				},
				docs: { kind: 'none' },
			},
			expected: expect.objectContaining({
				name: 'quality',
				status: 'warning',
				detail: expect.stringContaining(`(since ${SHORT}, --base)`),
			}),
		},
		'lists of another tree, no docs row → the row of another tree': {
			standing: { lists: { kind: 'other-tree' }, docs: { kind: 'none' } },
			expected: {
				name: 'quality',
				status: 'warning',
				detail: 'record of another tree (dialecte rules)',
			},
		},
		'a current record whose only docs entry is a removed one a page still names → a note: the row neither failed nor counting it':
			{
				standing: {
					lists: { kind: 'current', base: LOT_BASE, duplicates: [], sharedExports: [] },
					docs: {
						kind: 'current',
						base: LOT_BASE,
						docs: [
							{
								route: 'doc.core.sizeOf',
								change: 'removed',
								pages: ['doc/api/core.md'],
								allowed: false,
							},
						],
					},
				},
				expected: expect.objectContaining({
					name: 'quality',
					status: expect.stringMatching(/^(?:passed|warning)$/),
					detail: expect.not.stringContaining('without docs'),
				}),
			},
		"a current --base record whose lot run's docs are of another tree → the row says the docs are":
			{
				standing: {
					lists: {
						kind: 'current',
						base: { ...LOT_BASE, source: 'flag' },
						duplicates: [],
						sharedExports: [SIZE_CHANGED],
					},
					docs: { kind: 'other-tree' },
				},
				expected: expect.objectContaining({
					name: 'quality',
					detail: expect.stringContaining('docs: record of another tree'),
				}),
			},
		'no record → a warning row: never run on this tree': {
			standing: { lists: { kind: 'none' }, docs: { kind: 'none' } },
			expected: { name: 'quality', status: 'warning', detail: 'never run on this tree' },
		},
		'a --base record newer than the lot base, the docs row failing → still failed': {
			standing: NEWER_FLAG_DOCS_LEFT,
			expected: expect.objectContaining({
				name: 'quality',
				status: 'failed',
				detail: expect.stringContaining('1 public export without docs: doc.core.sizeOf'),
			}),
		},
	}

	for (const [title, testCase] of Object.entries(testCases))
		it(title, () => {
			expect(buildQualityLine({ standing: testCase.standing, short: SHORT })).toEqual(
				testCase.expected,
			)
		})
})

/** `text` as a pattern matching it literally. */
function literalOf(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Of the texts of `lines`, how many name each of `names`, and the lines saying how many more. */
function linesNaming(params: { lines: readonly CardLine[]; names: readonly string[] }) {
	const texts = params.lines.map((line) => line.text.trim())
	return {
		named: params.names.map(
			(name) => texts.filter((text) => new RegExp(`\\b${literalOf(name)}\\b`).test(text)).length,
		),
		more: texts.filter((text) => text.startsWith('…')),
	}
}

describe('buildQualitySection', () => {
	const testCases: Record<
		string,
		{ standing: QualityStanding; names: string[]; expected: { named: number[]; more: string[] } }
	> = {
		'a current record with two duplicate reads and three shared exports → one line each': {
			standing: TO_READ,
			names: ['keysOfRecord', 'ownerWidgetLabel', 'sizeOf', 'countOf', 'total'],
			expected: { named: [1, 1, 1, 1, 1], more: [] },
		},
		'a public export left without docs → its line': {
			standing: DOCS_LEFT,
			names: ['doc.core.sizeOf'],
			expected: { named: [1], more: [] },
		},
		'the same docs finding opted out → not listed': {
			standing: DOCS_OPTED_OUT,
			names: ['doc.core.sizeOf'],
			expected: { named: [0], more: [] },
		},
		'a record of another tree → nothing listed': {
			standing: OTHER_TREE,
			names: ['sizeOf'],
			expected: { named: [0], more: [] },
		},
		'twelve shared exports → ten lines, then how many more and the run listing them all': {
			standing: TWELVE_SHARED,
			names: Array.from({ length: 12 }, (_, index) => `size${index + 1}Of`),
			expected: {
				named: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0],
				more: [`… 2 more (dialecte rules --base ${SHORT} --json)`],
			},
		},
	}

	for (const [title, testCase] of Object.entries(testCases))
		it(title, () => {
			expect(
				linesNaming({
					lines: buildQualitySection({ standing: testCase.standing, short: SHORT }),
					names: testCase.names,
				}),
			).toEqual(testCase.expected)
		})
})
