import { join } from 'node:path'

import { createScratchRepository, writeFiles } from '../../test/scratch-repository.ts'
import { runRules } from './rules.ts'

import { describe, expect, it } from 'vitest'

describe('runRules', () => {
	it('no file given → the changed and new files are checked, unchanged ones and binaries are not', () => {
		const root = createScratchRepository({
			'src/old.ts': 'export const read = () => 1\n',
			'src/kept.ts': 'export function keep() {}\n',
		})
		writeFiles({
			root,
			files: {
				'src/kept.ts': 'export function keep() {\n\tconst write = () => 2\n}\n',
				'src/new.ts': 'export type Name = string\n',
				'logo.png': 'x',
			},
		})

		const result = runRules({ cwd: root, argv: [] })

		expect(result.exitCode).toBe(1)
		expect(result.output).toBe(
			[
				'src/kept.ts:2:8  error  function-as-const  `write` is a function: declare it with `function write`',
				'src/new.ts:1:13  error  type-outside-types-file  type `Name` belongs in a `*.types.ts` file next to this one',
				'rules: 2 file(s), 2 error(s), 0 warning(s)',
			].join('\n'),
		)
	})

	it('files given and --json → only those, as JSON; warnings alone exit 0', () => {
		const root = createScratchRepository({
			'src/join.ts': 'export function join(first: string, count: number) {}\n',
		})

		const result = runRules({ cwd: root, argv: ['src/join.ts', '--json'] })

		expect(result.exitCode).toBe(0)
		expect(JSON.parse(result.output)).toEqual({
			files: ['src/join.ts'],
			errors: 0,
			warnings: 1,
			findings: [
				{
					file: 'src/join.ts',
					line: 1,
					column: 17,
					rule: 'positional-parameters',
					severity: 'warning',
					message:
						'`join` takes positional parameters: take one params object (a leading query or tx may stay)',
				},
			],
		})
	})

	it('nothing changed → says so, exit 0', () => {
		const root = createScratchRepository()

		expect(runRules({ cwd: root, argv: [] })).toEqual({
			exitCode: 0,
			output: 'rules: no changed file to check',
		})
	})

	it('an absolute path → read where it is, outside the package too', () => {
		const root = createScratchRepository()
		const elsewhere = createScratchRepository({ 'notes.md': `As ${'Annex'} B says.\n` })

		const result = runRules({ cwd: root, argv: [join(elsewhere, 'notes.md')] })

		expect(result.exitCode).toBe(1)
		expect(result.output).toContain(
			`${join(elsewhere, 'notes.md')}:1:4  error  committed-text-reference`,
		)
	})

	it('a folder → its tracked and new text files, ignored and binary files left out', () => {
		const root = createScratchRepository({
			'.gitignore': 'dist/\n',
			'src/a.ts': 'export function a() {}\n',
			'src/nested/b.ts': 'export const b = () => 1\n',
		})
		writeFiles({
			root,
			files: {
				'src/nested/c.md': `As ${'Annex'} C says.\n`,
				'src/logo.png': 'x',
				'dist/out.ts': 'export const out = () => 1\n',
			},
		})

		const result = runRules({ cwd: root, argv: ['src', '--json'] })

		expect(JSON.parse(result.output).files).toEqual([
			'src/a.ts',
			'src/nested/b.ts',
			'src/nested/c.md',
		])
		expect(result.exitCode).toBe(1)
	})
})
