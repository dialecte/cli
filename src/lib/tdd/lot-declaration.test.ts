import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { readAcceptances, readGoneEntries, readTddExemption } from './lot-declaration.ts'

import { describe, expect, it } from 'vitest'

/** A package root whose lot file holds `declaration`. */
function rootWith(declaration: unknown): string {
	const root = temporaryFolder('dialecte-lot-')
	mkdirSync(join(root, '.dialecte'))
	writeFileSync(join(root, '.dialecte/lot.json'), JSON.stringify(declaration))
	return root
}

describe('the lot file is strict', () => {
	it('an unknown top-level key ("acept") → refused, naming it', () => {
		expect(readAcceptances(rootWith({ acept: [] }))).toEqual({
			failure: '.dialecte/lot.json: unknown key "acept" (known: tdd, accept, revised, gone)',
		})
		expect(readTddExemption(rootWith({ tdd: 'exempt: a rename', acept: [] }))).toEqual({
			kind: 'invalid',
			reason: '.dialecte/lot.json: unknown key "acept" (known: tdd, accept, revised, gone)',
		})
	})

	it('an unknown key in an accept entry → refused, naming it', () => {
		expect(
			readAcceptances(rootWith({ accept: [{ case: 'a.test.ts::a', reason: 'r', reasn: 'x' }] })),
		).toEqual({
			failure: '.dialecte/lot.json: unknown key "reasn" in an "accept" entry (known: case, reason)',
		})
	})

	it('"exempt:" with an empty reason → refused', () => {
		expect(readTddExemption(rootWith({ tdd: 'exempt:  ' }))).toEqual({
			kind: 'invalid',
			reason: '.dialecte/lot.json: "tdd" must be "exempt: <reason>", not "exempt:  "',
		})
	})

	it('a well-formed file → its exemption and acceptances', () => {
		const root = rootWith({
			tdd: 'exempt: a rename',
			accept: [{ case: 'a.test.ts::a', reason: 'r' }],
		})

		expect(readTddExemption(root)).toEqual({ kind: 'exempt', reason: 'a rename' })
		expect(readAcceptances(root)).toEqual([{ case: 'a.test.ts::a', reason: 'r' }])
	})
})

describe('the gone entries of the lot file', () => {
	it('"gone" entries naming a file and a glob, each with a reason → read as written', () => {
		const gone = [
			{ file: 'src/add.test.ts', reason: 'the table call was rewritten' },
			{ file: 'scripts/**/*.test.ts', reason: 'the loops were merged' },
		]

		expect(readGoneEntries(rootWith({ gone }))).toEqual(gone)
	})

	it('no "gone" key → no entry', () => {
		expect(readGoneEntries(rootWith({ tdd: 'exempt: a rename' }))).toEqual([])
	})

	for (const [name, gone] of Object.entries({
		'an entry without a reason': [{ file: 'src/add.test.ts' }],
		'an entry with an empty reason': [{ file: 'src/add.test.ts', reason: ' ' }],
		'an entry without a file': [{ reason: 'r' }],
		'an entry whose file is not a string': [{ file: 3, reason: 'r' }],
		'not a list': { file: 'src/add.test.ts', reason: 'r' },
	}))
		it(`${name} → refused with the shape of a "gone" entry`, () => {
			expect(readGoneEntries(rootWith({ gone }))).toEqual({
				failure:
					'.dialecte/lot.json: each "gone" entry must be { "file": "<file or glob>", "reason": "<why>" }',
			})
		})

	it('an entry naming a case instead of a file → refused, naming the unknown key "case"', () => {
		expect(
			readGoneEntries(rootWith({ gone: [{ case: 'src/add.test.ts::a', reason: 'r' }] })),
		).toEqual({
			failure: expect.stringMatching(
				/^\.dialecte\/lot\.json: unknown key "case" in an? "gone" entry \(known: file, reason\)$/,
			),
		})
	})

	it('an unknown key in a gone entry → refused, naming it and the known keys', () => {
		expect(
			readGoneEntries(rootWith({ gone: [{ file: 'src/add.test.ts', reason: 'r', reasn: 'x' }] })),
		).toEqual({
			failure: expect.stringMatching(
				/^\.dialecte\/lot\.json: unknown key "reasn" in an? "gone" entry \(known: file, reason\)$/,
			),
		})
	})
})
