/** `lot accept|revised|gone --remove <entry>`: a receipt leaves the lot declaration through its verb, never a hand edit. */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { temporaryFolder, writeFiles } from '../../test/scratch-repository.ts'
import { renderLotUsage } from '../lib/command-map/render-help.ts'
import { runLot } from './lot.ts'

import { describe, expect, it } from 'vitest'

const CASE_A = 'src/a.test.ts::a > one'
const CASE_B = 'src/b.test.ts::b > two'
const DECLARATION = {
	tdd: 'exempt: a rename',
	accept: [
		{ case: CASE_A, reason: 'a reason' },
		{ case: CASE_B, reason: 'another reason' },
	],
	revised: [
		{ case: 'src/a.test.ts', reason: 'a reason' },
		{ case: 'scripts/**/*.test.ts', reason: 'another reason' },
	],
	gone: [
		{ file: 'src/a.test.ts', reason: 'a reason' },
		{ file: 'src/b.test.ts', reason: 'another reason' },
	],
}

/** The text `lot` writes: tab-indented JSON, a final newline. */
function lotText(value: unknown): string {
	return `${JSON.stringify(value, null, '\t')}\n`
}

/** A package folder whose lot declaration is `declaration`. */
function declaredPackage(declaration: unknown): string {
	const root = temporaryFolder('dialecte-lot-remove-')
	writeFiles({
		root,
		files: { 'package.json': '{}\n', '.dialecte/lot.json': lotText(declaration) },
	})
	return root
}

function declarationOf(root: string): unknown {
	return JSON.parse(readFileSync(join(root, '.dialecte', 'lot.json'), 'utf8'))
}

describe('dialecte lot <list> --remove', () => {
	it.each([
		{ verb: 'accept', entry: CASE_A, kept: { accept: [DECLARATION.accept[1]] } },
		{ verb: 'revised', entry: 'src/a.test.ts', kept: { revised: [DECLARATION.revised[1]] } },
		{ verb: 'gone', entry: 'src/b.test.ts', kept: { gone: [DECLARATION.gone[0]] } },
	])(
		'$verb --remove $entry → that entry dropped, the rest of the declaration kept',
		({ verb, entry, kept }) => {
			const root = declaredPackage(DECLARATION)

			const result = runLot({ cwd: root, argv: [verb, '--remove', entry] })

			expect(result.exitCode).toBe(0)
			expect(result.output).toContain(`removed ${verb} ${entry}`)
			expect(declarationOf(root)).toEqual({ ...DECLARATION, ...kept })
		},
	)

	it('the last entry of a list removed → the list leaves the declaration', () => {
		const root = declaredPackage({ tdd: 'exempt: a rename', gone: [DECLARATION.gone[0]] })

		runLot({ cwd: root, argv: ['gone', '--remove', 'src/a.test.ts'] })

		expect(declarationOf(root)).toEqual({ tdd: 'exempt: a rename' })
	})

	it('--remove of an entry its list does not hold → refused naming the closest entries, nothing written', () => {
		const root = declaredPackage(DECLARATION)

		const result = runLot({ cwd: root, argv: ['accept', '--remove', 'src/a.test.ts::a > on'] })

		expect(result).toEqual({
			exitCode: 1,
			output: `lot: accept holds no "src/a.test.ts::a > on" (closest: "${CASE_A}", "${CASE_B}"); nothing written`,
		})
		expect(declarationOf(root)).toEqual(DECLARATION)
	})

	it.each([
		{ label: 'a reason after the entry', argv: ['accept', '--remove', CASE_A, 'a reason'] },
		{ label: 'no entry', argv: ['revised', '--remove'] },
	])('--remove with $label → usage, exit 2, nothing written', ({ argv }) => {
		const root = declaredPackage(DECLARATION)

		expect(runLot({ cwd: root, argv })).toEqual({ exitCode: 2, output: renderLotUsage() })
		expect(declarationOf(root)).toEqual(DECLARATION)
	})
})
