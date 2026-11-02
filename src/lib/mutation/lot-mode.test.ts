import { SMALL_CASE_TIMEOUT } from '../../../test/mutation-package.constants.ts'
import { temporaryFolder, writeFiles } from '../../../test/scratch-repository.ts'
import { readAcceptances, readTddExemption } from '../tdd/lot-declaration.ts'
import { effectiveMode, readMutationMode } from './lot-mode.ts'
import { MUTATION_MODES } from './mutation.constants.ts'

import { describe, expect, it } from 'vitest'

const LOT_FILE = '.dialecte/lot.json'

function packageWith(lot: Record<string, unknown> | undefined): string {
	const root = temporaryFolder('dialecte-lot-mode-')
	writeFiles({
		root,
		files: lot === undefined ? {} : { [LOT_FILE]: `${JSON.stringify(lot, null, '\t')}\n` },
	})
	return root
}

describe('readMutationMode', { timeout: SMALL_CASE_TIMEOUT }, () => {
	it('no lot file → default', () => {
		expect(readMutationMode({ root: packageWith(undefined) })).toEqual({ kind: 'default' })
	})

	it('a lot file with no mutation key → default', () => {
		expect(readMutationMode({ root: packageWith({ tdd: 'exempt: a rename' }) })).toEqual({
			kind: 'default',
		})
	})

	for (const mode of MUTATION_MODES)
		it(`mutation "${mode}" → that mode`, () => {
			expect(readMutationMode({ root: packageWith({ mutation: mode }) })).toEqual({ kind: mode })
		})

	it('another value → invalid, the reason names the four modes', () => {
		expect(readMutationMode({ root: packageWith({ mutation: 'sometimes' }) })).toMatchObject({
			kind: 'invalid',
			reason: expect.stringMatching(/off.*changed.*audit.*gate/s),
		})
	})

	it('a value that is not a string → invalid', () => {
		expect(readMutationMode({ root: packageWith({ mutation: true }) })).toMatchObject({
			kind: 'invalid',
		})
	})
})

describe('effectiveMode', () => {
	it('default and the lot touches the scope → changed', () => {
		expect(effectiveMode({ mode: { kind: 'default' }, touchesScope: true })).toBe('changed')
	})

	it('default and the lot touches no scope file → off', () => {
		expect(effectiveMode({ mode: { kind: 'default' }, touchesScope: false })).toBe('off')
	})

	for (const mode of MUTATION_MODES)
		for (const touchesScope of [true, false])
			it(`${mode} stays ${mode} when touchesScope is ${touchesScope}`, () => {
				expect(effectiveMode({ mode: { kind: mode }, touchesScope })).toBe(mode)
			})
})

describe('a lot file that holds mutation', { timeout: SMALL_CASE_TIMEOUT }, () => {
	it('the tdd exemption reader → still reads the exemption, no unknown-key failure', () => {
		expect(readTddExemption(packageWith({ tdd: 'exempt: a rename', mutation: 'audit' }))).toEqual({
			kind: 'exempt',
			reason: 'a rename',
		})
	})

	it('the acceptances reader → still reads the entries, no unknown-key failure', () => {
		expect(
			readAcceptances(
				packageWith({
					mutation: 'changed',
					accept: [{ case: 'src/a.test.ts::a > one', reason: 'exists' }],
				}),
			),
		).toEqual([{ case: 'src/a.test.ts::a > one', reason: 'exists' }])
	})
})
