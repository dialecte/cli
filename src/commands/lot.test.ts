import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { temporaryFolder, writeFiles } from '../../test/scratch-repository.ts'
import { runLot } from './lot.ts'

import { describe, expect, it } from 'vitest'

const CASE_A = 'src/a.test.ts::a > one'
const CASE_B = 'src/b.test.ts::b > two'

/** A package folder (its package.json marks the root). */
function packageRoot(): string {
	const root = temporaryFolder('dialecte-lot-')
	writeFiles({ root, files: { 'package.json': '{}\n' } })
	return root
}

function lotFile(root: string): string {
	return join(root, '.dialecte', 'lot.json')
}

/** The text `lot` writes: tab-indented JSON, a final newline. */
function lotText(value: unknown): string {
	return `${JSON.stringify(value, null, '\t')}\n`
}

describe('dialecte lot', { timeout: 60_000 }, () => {
	it('exempt <reason> → .dialecte/lot.json holds the exemption, as tab-indented JSON with a final newline', () => {
		const root = packageRoot()

		expect(runLot({ cwd: root, argv: ['exempt', 'a rename'] }).exitCode).toBe(0)

		expect(readFileSync(lotFile(root), 'utf8')).toBe(lotText({ tdd: 'exempt: a rename' }))
	})

	for (const verb of ['accept', 'revised'])
		it(`${verb} twice with two cases → both entries; the same case again → its reason replaced, no duplicate; the other keys stay`, () => {
			const root = packageRoot()
			writeFiles({ root, files: { '.dialecte/lot.json': lotText({ tdd: 'exempt: a rename' }) } })

			expect(runLot({ cwd: root, argv: [verb, CASE_A, 'a reason'] }).exitCode).toBe(0)
			expect(runLot({ cwd: root, argv: [verb, CASE_B, 'another reason'] }).exitCode).toBe(0)
			expect(runLot({ cwd: root, argv: [verb, CASE_A, 'a better reason'] }).exitCode).toBe(0)

			expect(readFileSync(lotFile(root), 'utf8')).toBe(
				lotText({
					tdd: 'exempt: a rename',
					[verb]: [
						{ case: CASE_A, reason: 'a better reason' },
						{ case: CASE_B, reason: 'another reason' },
					],
				}),
			)
		})

	it('run from a subfolder → the file is written at the package root (the nearest package.json above), not in the subfolder', () => {
		const root = packageRoot()
		const deep = join(root, 'src', 'deep')
		mkdirSync(deep, { recursive: true })

		expect(runLot({ cwd: deep, argv: ['accept', CASE_A, 'a reason'] }).exitCode).toBe(0)

		expect(readFileSync(lotFile(root), 'utf8')).toBe(
			lotText({ accept: [{ case: CASE_A, reason: 'a reason' }] }),
		)
		expect(existsSync(join(deep, '.dialecte'))).toBe(false)
	})

	it('no package.json above the folder → refused, nothing written', () => {
		const root = temporaryFolder('dialecte-lot-')

		expect(runLot({ cwd: root, argv: ['exempt', 'a rename'] })).toEqual({
			exitCode: 1,
			output: expect.stringMatching(/^lot: no package\.json (at or )?above /),
		})
		expect(existsSync(lotFile(root))).toBe(false)
	})

	it('accept without a reason → usage, exit 2, nothing written', () => {
		const root = packageRoot()

		expect(runLot({ cwd: root, argv: ['accept', CASE_A] })).toEqual({
			exitCode: 2,
			output: expect.stringMatching(/^lot: /),
		})
		expect(existsSync(lotFile(root))).toBe(false)
	})

	it('an existing lot file that is not JSON → refused naming it, the file untouched', () => {
		const root = packageRoot()
		writeFiles({ root, files: { '.dialecte/lot.json': '{ not json' } })

		expect(runLot({ cwd: root, argv: ['exempt', 'a rename'] })).toEqual({
			exitCode: 1,
			output: expect.stringContaining('.dialecte/lot.json'),
		})
		expect(readFileSync(lotFile(root), 'utf8')).toBe('{ not json')
	})

	for (const content of ['null', '[]', '"text"'])
		it(`a lot file holding ${content} → refused with a plain message naming it, the file untouched`, () => {
			const root = packageRoot()
			writeFiles({ root, files: { '.dialecte/lot.json': content } })

			expect(runLot({ cwd: root, argv: ['accept', CASE_A, 'a reason'] })).toEqual({
				exitCode: 1,
				output: expect.stringMatching(/^lot: .*\.dialecte\/lot\.json.* (an )?object/),
			})
			expect(readFileSync(lotFile(root), 'utf8')).toBe(content)
		})

	it('accept with a case not shaped <file>::<name> → refused at write, nothing written', () => {
		const root = packageRoot()

		expect(runLot({ cwd: root, argv: ['accept', 'src/a.test.ts', 'a reason'] })).toEqual({
			exitCode: 2,
			output: expect.stringMatching(/^lot: .*<file>::<name>/),
		})
		expect(existsSync(lotFile(root))).toBe(false)
	})

	it("revised with a file, then with a glob → each written as the entry's case, one reason each; accept with the same glob, revised with an empty argument and gone naming a case → refused, nothing else written", () => {
		const root = packageRoot()

		expect(runLot({ cwd: root, argv: ['revised', 'src/a.test.ts', 'a reason'] }).exitCode).toBe(0)
		expect(
			runLot({ cwd: root, argv: ['revised', 'scripts/**/*.test.ts', 'another reason'] }).exitCode,
		).toBe(0)
		expect(
			runLot({ cwd: root, argv: ['accept', 'scripts/**/*.test.ts', 'a reason'] }).exitCode,
		).toBe(2)
		expect(runLot({ cwd: root, argv: ['revised', '', 'a reason'] }).exitCode).toBe(2)
		expect(
			runLot({ cwd: root, argv: ['gone', 'src/a.test.ts::a > one', 'a reason'] }).exitCode,
		).toBe(2)

		expect(readFileSync(lotFile(root), 'utf8')).toBe(
			lotText({
				revised: [
					{ case: 'src/a.test.ts', reason: 'a reason' },
					{ case: 'scripts/**/*.test.ts', reason: 'another reason' },
				],
			}),
		)
	})

	it('gone <file> and gone <glob> → "gone" entries { file, reason }; the same file again → its reason replaced; the other keys stay', () => {
		const root = packageRoot()
		writeFiles({ root, files: { '.dialecte/lot.json': lotText({ tdd: 'exempt: a rename' }) } })

		expect(runLot({ cwd: root, argv: ['gone', 'src/a.test.ts', 'a reason'] }).exitCode).toBe(0)
		expect(
			runLot({ cwd: root, argv: ['gone', 'scripts/**/*.test.ts', 'another reason'] }).exitCode,
		).toBe(0)
		expect(runLot({ cwd: root, argv: ['gone', 'src/a.test.ts', 'a better reason'] }).exitCode).toBe(
			0,
		)

		expect(readFileSync(lotFile(root), 'utf8')).toBe(
			lotText({
				tdd: 'exempt: a rename',
				gone: [
					{ file: 'src/a.test.ts', reason: 'a better reason' },
					{ file: 'scripts/**/*.test.ts', reason: 'another reason' },
				],
			}),
		)
	})

	it('gone without a reason → usage naming the gone verb, exit 2, nothing written', () => {
		const root = packageRoot()

		expect(runLot({ cwd: root, argv: ['gone', 'src/a.test.ts'] })).toEqual({
			exitCode: 2,
			output: expect.stringMatching(/^lot: .* gone /),
		})
		expect(existsSync(lotFile(root))).toBe(false)
	})

	it('an unknown verb → usage, exit 2', () => {
		const root = packageRoot()

		expect(runLot({ cwd: root, argv: ['bless', 'x'] })).toEqual({
			exitCode: 2,
			output: expect.stringMatching(
				/^lot: exempt <reason> \| accept <case> <reason> \| revised <case\|file\|glob> <reason>/,
			),
		})
	})
})
