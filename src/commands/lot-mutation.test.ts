import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { SMALL_CASE_TIMEOUT } from '../../test/mutation-package.constants.ts'
import { temporaryFolder, writeFiles } from '../../test/scratch-repository.ts'
import { runLot } from './lot.ts'

import { describe, expect, it } from 'vitest'

function packageRoot(): string {
	const root = temporaryFolder('dialecte-lot-mutation-')
	writeFiles({ root, files: { 'package.json': '{}\n' } })
	return root
}

function lotText(value: unknown): string {
	return `${JSON.stringify(value, null, '\t')}\n`
}

describe('dialecte lot mutation <mode>', { timeout: SMALL_CASE_TIMEOUT }, () => {
	for (const mode of ['off', 'changed', 'audit', 'gate'])
		it(`${mode} → .dialecte/lot.json holds mutation "${mode}", as tab-indented JSON with a final newline`, () => {
			const root = packageRoot()

			expect(runLot({ cwd: root, argv: ['mutation', mode] }).exitCode).toBe(0)

			expect(readFileSync(join(root, '.dialecte', 'lot.json'), 'utf8')).toBe(
				lotText({ mutation: mode }),
			)
		})

	it('a lot file with other keys → they stay, and a second mode replaces the first', () => {
		const root = packageRoot()
		writeFiles({
			root,
			files: { '.dialecte/lot.json': lotText({ tdd: 'exempt: a rename', mutation: 'off' }) },
		})

		expect(runLot({ cwd: root, argv: ['mutation', 'gate'] }).exitCode).toBe(0)

		expect(readFileSync(join(root, '.dialecte', 'lot.json'), 'utf8')).toBe(
			lotText({ tdd: 'exempt: a rename', mutation: 'gate' }),
		)
	})

	it('an unknown mode → refused naming the four modes, nothing written', () => {
		const root = packageRoot()

		expect(runLot({ cwd: root, argv: ['mutation', 'sometimes'] })).toMatchObject({
			exitCode: 2,
			output: expect.stringMatching(/off.*changed.*audit.*gate/s),
		})
		expect(existsSync(join(root, '.dialecte', 'lot.json'))).toBe(false)
	})

	it('a reason after the mode → refused (the verb takes none), nothing written', () => {
		const root = packageRoot()

		expect(runLot({ cwd: root, argv: ['mutation', 'changed', 'because'] })).toMatchObject({
			exitCode: 2,
			output: expect.stringMatching(/takes no reason/),
		})
		expect(existsSync(join(root, '.dialecte', 'lot.json'))).toBe(false)
	})

	it('no mode → refused, nothing written', () => {
		const root = packageRoot()

		expect(runLot({ cwd: root, argv: ['mutation'] })).toMatchObject({
			exitCode: 2,
			output: expect.stringContaining('mutation'),
		})
		expect(existsSync(join(root, '.dialecte', 'lot.json'))).toBe(false)
	})
})
