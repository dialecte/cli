import {
	createScratchRepository,
	temporaryFolder,
	writeFiles,
} from '../../../test/scratch-repository.ts'
import { SCRATCH_GIT_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { parseSourceFile } from './source-file-functions.ts'
import { readSourceFunctions } from './source-functions.ts'

import { describe, expect, it } from 'vitest'

function exporting(name: string): string {
	return `export function ${name}(): void {}\n`
}

describe('readSourceFunctions', () => {
	it(
		'tracked and untracked-not-ignored src files, tests and ignored files left out → entries by path',
		() => {
			const root = createScratchRepository({
				'.gitignore': 'src/ignored.ts\n',
				'src/a.ts': exporting('alpha'),
				'src/lib/b.ts': exporting('beta'),
				'src/a.test.ts': exporting('alphaTest'),
				'src/b.spec.ts': exporting('betaSpec'),
				'src/ignored.ts': exporting('ignored'),
				'src/types.d.ts': 'export declare function x(): void\n',
				'src/data.js': 'export function data() {}\n',
				'index.ts': exporting('rootIndex'),
				'test/helper.ts': exporting('helper'),
			})
			writeFiles({ root, files: { 'src/c.ts': exporting('gamma') } })

			expect(readSourceFunctions({ root }).entries.map((entry) => entry.path)).toEqual([
				'src/a.ts#alpha',
				'src/c.ts#gamma',
				'src/lib/b.ts#beta',
			])
			expect(readSourceFunctions({ root }).notes).toEqual([])
		},
		SCRATCH_GIT_CASE_TIMEOUT,
	)

	it('a folder outside git → its src files, tests left out', () => {
		const root = temporaryFolder('dialecte-source-nogit-')
		writeFiles({
			root,
			files: {
				'src/a.ts': exporting('alpha'),
				'src/lib/b.ts': exporting('beta'),
				'src/a.test.ts': exporting('alphaTest'),
			},
		})

		expect(readSourceFunctions({ root }).entries.map((entry) => entry.path)).toEqual([
			'src/a.ts#alpha',
			'src/lib/b.ts#beta',
		])
		expect(readSourceFunctions({ root }).notes).toEqual([])
	})

	it(
		'a second read of the same tree → no file parsed, the same answer',
		() => {
			const root = createScratchRepository({
				'src/a.ts': exporting('alpha'),
				'src/b.ts': exporting('beta'),
			})
			const first = readSourceFunctions({ root })
			const parsed: string[] = []

			const second = readSourceFunctions({
				root,
				parse: function countedParse(params) {
					parsed.push(params.file)
					return parseSourceFile(params)
				},
			})

			expect(parsed).toEqual([])
			expect(second).toEqual(first)
		},
		SCRATCH_GIT_CASE_TIMEOUT,
	)

	it('a package without src/ → no entries and one note', () => {
		const root = temporaryFolder('dialecte-source-none-')

		expect(readSourceFunctions({ root })).toEqual({
			entries: [],
			notes: [`no src/ folder in ${root}`],
		})
	})

	it(
		'a file that does not parse among good ones → the good entries and one note, never thrown',
		() => {
			const root = createScratchRepository({
				'src/good.ts': exporting('good'),
				'src/bad.ts': 'export function broken( {\n',
			})

			expect(readSourceFunctions({ root }).entries.map((entry) => entry.path)).toEqual([
				'src/good.ts#good',
			])
			expect(readSourceFunctions({ root }).notes).toHaveLength(1)
			expect(readSourceFunctions({ root }).notes[0]).toMatch(/^src\/bad\.ts: not parsed \(.+\)$/)
		},
		SCRATCH_GIT_CASE_TIMEOUT,
	)
})
