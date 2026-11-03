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

describe('the ticket number pattern', () => {
	const HASH = '#'
	const TICKET = GENERIC_REFERENCE_PATTERNS.filter((pattern) => pattern.label === 'ticket number')

	// built from parts, so this file never matches the pattern it tests
	const ROWS: Record<string, { text: string; finding: boolean }> = {
		'an XML decimal character reference → no finding': { text: `&${HASH}160;`, finding: false },
		'an XML hexadecimal character reference → no finding': {
			text: `&${HASH}x00A0;`,
			finding: false,
		},
		'a character reference inside a word → no finding': {
			text: `a&${HASH}8203;b`,
			finding: false,
		},
		'a ticket after a space → a finding': { text: `see ${HASH}160`, finding: true },
		'a ticket in parentheses → a finding': { text: `(${HASH}3253)`, finding: true },
		'a ticket before a full stop → a finding': { text: `fixes ${HASH}1234.`, finding: true },
		'a number glued to a word (no boundary before the hash) → no finding': {
			text: `abc${HASH}123`,
			finding: false,
		},
	}

	for (const [name, row] of Object.entries(ROWS))
		it(`${name}, read the same by grep -E`, () => {
			const sample = join(temporaryFolder('dialecte-references-'), 'sample.txt')
			writeFileSync(sample, `${row.text}\n`)

			const found = findReferences({ text: row.text, patterns: TICKET }).length > 0
			const grep = spawnSync('grep', ['-E', TICKET[0].source, sample], { encoding: 'utf8' })

			expect({ found, grepFound: grep.status === 0 }).toEqual({
				found: row.finding,
				grepFound: row.finding,
			})
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

	it('a package allowing ticket numbers and acceptance criteria → the generic ones without them', () => {
		const root = temporaryFolder('dialecte-references-')
		writeFileSync(
			join(root, 'package.json'),
			JSON.stringify({
				name: 'app',
				dialecte: { allowReferences: ['ticket number', 'acceptance criterion'] },
			}),
		)

		expect(readReferencePatterns(root).map((pattern) => pattern.label)).toEqual(
			GENERIC_REFERENCE_PATTERNS.map((pattern) => pattern.label).filter(
				(label) => label !== 'ticket number' && label !== 'acceptance criterion',
			),
		)
	})

	it('a package allowing a citation of a standard → refused, naming it and what may be allowed', () => {
		const root = temporaryFolder('dialecte-references-')
		writeFileSync(
			join(root, 'package.json'),
			JSON.stringify({ name: 'app', dialecte: { allowReferences: ['clause citation'] } }),
		)

		expect(() => readReferencePatterns(root)).toThrow(
			/clause citation.*never.*plan tag, acceptance criterion, ticket number/,
		)
	})

	it('no package.json or no declaration → the generic ones', () => {
		expect(readReferencePatterns(temporaryFolder('dialecte-references-'))).toEqual(
			GENERIC_REFERENCE_PATTERNS,
		)
	})
})
