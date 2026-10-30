import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { readAcceptances, readTddExemption } from './lot-declaration.ts'

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
			failure: '.dialecte/lot.json: unknown key "acept" (known: tdd, accept, revised)',
		})
		expect(readTddExemption(rootWith({ tdd: 'exempt: a rename', acept: [] }))).toEqual({
			kind: 'invalid',
			reason: '.dialecte/lot.json: unknown key "acept" (known: tdd, accept, revised)',
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
