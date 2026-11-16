/** `packedFilesOf`: the packed paths of `npm pack --dry-run --json` in each shape npm prints. */
import { packedFilesOf } from './npm-pack-files.ts'

import { describe, expect, it } from 'vitest'

const FILES = [{ path: 'dist/cli.js' }, { path: 'dist/schemas/a.schema.json' }]

const SHAPES: { name: string; printed: unknown }[] = [
	{ name: 'an array of packages', printed: [{ id: 'scratch@1.0.0', files: FILES }] },
	{ name: 'one package object', printed: { id: 'scratch@1.0.0', files: FILES } },
	{
		name: 'an object keyed by package name',
		printed: { scratch: { id: 'scratch@1.0.0', files: FILES } },
	},
]

describe('packedFilesOf', () => {
	it.each(SHAPES)('$name → the packed paths', ({ printed }) => {
		expect(packedFilesOf(JSON.stringify(printed))).toEqual([
			'dist/cli.js',
			'dist/schemas/a.schema.json',
		])
	})

	const REFUSED: { name: string; printed: unknown }[] = [
		{ name: 'an object with no files list', printed: { error: 'x' } },
		{ name: 'an empty array', printed: [] },
		{ name: 'an array holding only an error', printed: [{ error: 'x' }] },
		{ name: 'a files entry with no text path', printed: [{ files: [{ size: 1 }] }] },
	]

	it.each(REFUSED)('$name → throws naming what was printed', ({ printed }) => {
		expect(() => packedFilesOf(JSON.stringify(printed))).toThrow(
			`npm pack --json printed no files list: ${JSON.stringify(printed)}`,
		)
	})
})
