/** `lot moved <from> <to>`: the lot file's `moved` entries, written through the verb, never by hand. */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { temporaryFolder, writeFiles } from '../../test/scratch-repository.ts'
import { renderLotUsage } from '../lib/command-map/render-help.ts'
import { runLot } from './lot.ts'

import { describe, expect, it } from 'vitest'

const OLD_CASE = 'src/a.test.ts::a > one'
const NEW_CASE = 'src/b.test.ts::a > one'

/** A package folder whose lot declaration is `declaration`. */
function declaredPackage(declaration: unknown): string {
	const root = temporaryFolder('dialecte-lot-moved-')
	writeFiles({
		root,
		files: {
			'package.json': '{}\n',
			'.dialecte/lot.json': `${JSON.stringify(declaration, null, '\t')}\n`,
		},
	})
	return root
}

function declarationOf(root: string): unknown {
	return JSON.parse(readFileSync(join(root, '.dialecte', 'lot.json'), 'utf8'))
}

describe('dialecte lot moved', () => {
	it.each([
		{ form: 'two cases', from: OLD_CASE, to: NEW_CASE },
		{ form: 'a file and a glob', from: 'src/a.test.ts', to: 'src/a-*.test.ts' },
	])('moved <from> <to> of $form → a { from, to } entry, the rest kept', ({ from, to }) => {
		const root = declaredPackage({ tdd: 'exempt: a rename' })

		expect(runLot({ cwd: root, argv: ['moved', from, to] }).exitCode).toBe(0)

		expect(declarationOf(root)).toEqual({ tdd: 'exempt: a rename', moved: [{ from, to }] })
	})

	it('a second file moved into the same file → both entries kept; the same pair again → no duplicate', () => {
		const root = declaredPackage({ moved: [{ from: 'src/a.test.ts', to: 'src/c.test.ts' }] })

		runLot({ cwd: root, argv: ['moved', 'src/b.test.ts', 'src/c.test.ts'] })
		runLot({ cwd: root, argv: ['moved', 'src/a.test.ts', 'src/c.test.ts'] })

		expect(declarationOf(root)).toEqual({
			moved: [
				{ from: 'src/a.test.ts', to: 'src/c.test.ts' },
				{ from: 'src/b.test.ts', to: 'src/c.test.ts' },
			],
		})
	})

	it('a glob as from → refused: the cases moved from one file, nothing written', () => {
		const root = declaredPackage({})

		expect(runLot({ cwd: root, argv: ['moved', 'src/a-*.test.ts', 'src/b.test.ts'] })).toEqual({
			exitCode: 2,
			output: 'lot: moved takes the file the cases moved from, not a glob: "src/a-*.test.ts"',
		})
		expect(declarationOf(root)).toEqual({})
	})

	it('a case moved to a file → refused: both name cases, or both name files, nothing written', () => {
		const root = declaredPackage({})

		expect(runLot({ cwd: root, argv: ['moved', OLD_CASE, 'src/b.test.ts'] })).toEqual({
			exitCode: 2,
			output: `lot: moved takes two cases (<file>::<name>) or a file and a file or glob, not "${OLD_CASE}" and "src/b.test.ts"`,
		})
		expect(declarationOf(root)).toEqual({})
	})

	it('moved --remove <from> <to> → that entry dropped, another into the same file kept', () => {
		const root = declaredPackage({
			moved: [
				{ from: 'src/a.test.ts', to: 'src/c.test.ts' },
				{ from: 'src/b.test.ts', to: 'src/c.test.ts' },
			],
		})

		expect(
			runLot({ cwd: root, argv: ['moved', '--remove', 'src/a.test.ts', 'src/c.test.ts'] }).exitCode,
		).toBe(0)

		expect(declarationOf(root)).toEqual({ moved: [{ from: 'src/b.test.ts', to: 'src/c.test.ts' }] })
	})

	it('moved with one word → usage, exit 2', () => {
		const root = declaredPackage({})

		expect(runLot({ cwd: root, argv: ['moved', OLD_CASE] })).toEqual({
			exitCode: 2,
			output: renderLotUsage(),
		})
	})
})
