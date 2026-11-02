import { hashLine } from './judge.ts'
import { migrateRecords } from './migrate-records.ts'

import { describe, expect, it } from 'vitest'

describe('migrateRecords', () => {
	const LINES: Record<string, string[]> = {
		'src/a.ts': ['first', '  second line  ', 'third'],
		'src/b.ts': ['only'],
	}
	function readLine(params: { file: string; line: number }): string {
		return LINES[params.file]?.[params.line - 1] ?? ''
	}

	it("scl's records → same files and keys, reason from equivalent, unclassified, the line's hash, no testsHash", () => {
		expect(
			migrateRecords({
				readLine,
				legacy: {
					'src/a.ts': {
						k1: { line: 2, mutation: 'm1', equivalent: 'why one' },
						'k1-1': { line: 3, mutation: 'm2', equivalent: 'why two' },
					},
					'src/b.ts': { k2: { line: 1, mutation: 'm3', equivalent: 'why three' } },
				},
			}),
		).toStrictEqual({
			'src/a.ts': {
				k1: {
					line: 2,
					mutation: 'm1',
					family: 'unclassified',
					reason: 'why one',
					lineHash: hashLine({ text: 'second line' }),
				},
				'k1-1': {
					line: 3,
					mutation: 'm2',
					family: 'unclassified',
					reason: 'why two',
					lineHash: hashLine({ text: 'third' }),
				},
			},
			'src/b.ts': {
				k2: {
					line: 1,
					mutation: 'm3',
					family: 'unclassified',
					reason: 'why three',
					lineHash: hashLine({ text: 'only' }),
				},
			},
		})
	})

	it('a legacy record with an empty reason → stays with an empty reason', () => {
		expect(
			migrateRecords({
				readLine,
				legacy: { 'src/a.ts': { k: { line: 1, mutation: 'm', equivalent: '' } } },
			}),
		).toMatchObject({ 'src/a.ts': { k: { reason: '', family: 'unclassified' } } })
	})

	it('no legacy records → none (and a legacy record gives one entry per key)', () => {
		expect(migrateRecords({ readLine, legacy: {} })).toEqual({})
		expect(
			Object.keys(
				migrateRecords({
					readLine,
					legacy: { 'src/b.ts': { k: { line: 1, mutation: 'm', equivalent: 'r' } } },
				})['src/b.ts'] ?? {},
			),
		).toEqual(['k'])
	})
})
