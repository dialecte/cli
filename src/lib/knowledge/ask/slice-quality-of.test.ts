import { QUALITY_BLOCKS } from '../../../../test/ask-pack-fixtures.constants.ts'
import { askSliceOf, fileIndexOf } from '../../../../test/ask-pack-fixtures.ts'
import { sliceQualityOf } from './slice-quality-of.ts'

import { describe, expect, it } from 'vitest'

type QualityRow = { from: number; to: number; expected: 'good' | 'poor' | 'unreadable' }

describe('sliceQualityOf: the worst block verdict the slice touches (case 28)', () => {
	const rows: Record<string, QualityRow> = {
		'lines inside a good block -> good': { from: 10, to: 20, expected: 'good' },
		'lines inside a poor block -> poor': { from: 1500, to: 1510, expected: 'poor' },
		'lines inside an unreadable block -> unreadable': {
			from: 2100,
			to: 2110,
			expected: 'unreadable',
		},
		'lines across a good and a poor block -> poor': { from: 995, to: 1005, expected: 'poor' },
		'lines across a poor and an unreadable block -> unreadable': {
			from: 1990,
			to: 2010,
			expected: 'unreadable',
		},
		'lines across all three blocks -> unreadable': { from: 990, to: 2010, expected: 'unreadable' },
		'the last line of a good block only -> good': { from: 1000, to: 1000, expected: 'good' },
		'the first line of a poor block only -> poor': { from: 1001, to: 1001, expected: 'poor' },
	}

	for (const [name, row] of Object.entries(rows))
		it(`${name}`, () => {
			expect(
				sliceQualityOf({
					slice: askSliceOf({ id: 's1', from: row.from, to: row.to }),
					file: fileIndexOf({ blocks: QUALITY_BLOCKS }),
				}),
			).toBe(row.expected)
		})
})
