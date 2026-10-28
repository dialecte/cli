import { spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { GENERIC_REFERENCE_PATTERNS } from './committed-text.constants.ts'
import { findReferences, readReferencePatterns } from './committed-text.ts'

import { describe, expect, it } from 'vitest'

// built from parts, so this file never matches the patterns it tests
const SAMPLE_LINES = [
	`added in ${'lot'} T5`,
	`closes ${'AC'}3`,
	`fixed in ${'#'}3102`,
	`as ${'§'} 6.2 says`,
	`see ${'Tables'} 12 and 13`,
	`see ${'Annex'} B`,
	`per ${'clause'} 9`,
	'a lot of names, phase 2 of the import, colours #fff #1234ab #123abc, the table of contents, an annex, a clause',
]

describe('findReferences', () => {
	it('every generic pattern reads the same in grep -E as in JavaScript', () => {
		const folder = temporaryFolder('dialecte-references-')
		const sample = join(folder, 'sample.txt')
		writeFileSync(sample, SAMPLE_LINES.join('\n') + '\n')

		for (const pattern of GENERIC_REFERENCE_PATTERNS) {
			const grep = spawnSync('grep', ['-n', '-E', pattern.source, sample], { encoding: 'utf8' })
			const grepLines = grep.stdout
				.split('\n')
				.filter(Boolean)
				.map((line) => Number(line.split(':')[0]))
			const lines = findReferences({ text: SAMPLE_LINES.join('\n'), patterns: [pattern] }).map(
				(match) => match.line,
			)

			expect({ pattern: pattern.label, lines }).toEqual({
				pattern: pattern.label,
				lines: grepLines,
			})
			expect(lines.length).toBeGreaterThan(0)
		}
	})

	it('the last sample line (ordinary words) → nothing', () => {
		expect(
			findReferences({ text: SAMPLE_LINES.at(-1) ?? '', patterns: GENERIC_REFERENCE_PATTERNS }),
		).toEqual([])
	})
})

describe('readReferencePatterns', () => {
	it('a package declaring patterns → the generic ones, then its own', () => {
		const root = temporaryFolder('dialecte-references-')
		writeFileSync(
			join(root, 'package.json'),
			JSON.stringify({ name: '@dialecte/demo', dialecte: { referencePatterns: ['SPEC-[0-9]+'] } }),
		)

		expect(readReferencePatterns(root)).toEqual([
			...GENERIC_REFERENCE_PATTERNS,
			{ label: 'reference declared by @dialecte/demo', source: 'SPEC-[0-9]+' },
		])
	})

	it('no package.json or no declaration → the generic ones', () => {
		expect(readReferencePatterns(temporaryFolder('dialecte-references-'))).toEqual(
			GENERIC_REFERENCE_PATTERNS,
		)
	})
})
