import { join } from 'node:path'

import { ISO_TIME_PATTERN, SHA256_PATTERN } from '../../test/gate-records.constants.ts'
import { readRecordFile } from '../../test/gate-records.ts'
import { createScratchRepository, git, writeFiles } from '../../test/scratch-repository.ts'
import { runRules } from './rules.ts'

import { describe, expect, it } from 'vitest'

import type { RulesRecord } from '../lib/gate-records/gate-records.types.ts'

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

describe('runRules: the record in the git folder', () => {
	/** The rules record as the last run left it; undefined when there is none. */
	function readRecord(root: string): RulesRecord | undefined {
		return readRecordFile<RulesRecord>({ root, name: 'dialecte-rules.json' })
	}

	it('no file given → dialecte-rules.json: when, HEAD, the state hash, the files, errors and warnings; a later run on named files → the record left as it was', () => {
		const root = createScratchRepository({
			'src/kept.ts': 'export function keep() {}\n',
			'src/join.ts': 'export function join(first: string, count: number) {}\n',
		})
		writeFiles({
			root,
			files: {
				'src/kept.ts': 'export function keep() {\n\tconst write = () => 2\n}\n',
				'src/new.ts': 'export type Name = string\n',
			},
		})

		runRules({ cwd: root, argv: [] })
		const recorded = readRecord(root)
		const named = runRules({ cwd: root, argv: ['src/join.ts'] })

		expect(recorded).toEqual({
			at: expect.stringMatching(ISO_TIME_PATTERN),
			head: git({ root, args: ['rev-parse', 'HEAD'] }).trim(),
			stateHash: expect.stringMatching(SHA256_PATTERN),
			files: ['src/kept.ts', 'src/new.ts'],
			errors: 2,
			warnings: 0,
		})
		expect(named.exitCode).toBe(0)
		expect(readRecord(root)).toEqual(recorded)
	})

	it('the state hash builds a tree only: no commit object is left in the repository by a record', () => {
		const root = createScratchRepository({ 'src/kept.ts': 'export function keep() {}\n' })
		writeFiles({ root, files: { 'src/new.ts': 'export function make() {}\n' } })
		/** The commit objects the repository holds, reachable or not. */
		function commitObjects(): string[] {
			return git({
				root,
				args: ['cat-file', '--batch-all-objects', '--batch-check=%(objecttype) %(objectname)'],
			})
				.split('\n')
				.filter((line) => line.startsWith('commit '))
				.sort()
		}
		const before = commitObjects()

		runRules({ cwd: root, argv: [] })

		expect({ recorded: readRecord(root) !== undefined, commits: commitObjects() }).toEqual({
			recorded: true,
			commits: before,
		})
	})
})
