import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { readExportEntries } from './export-entries.ts'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

/** Reads a few files of a temp folder: wide slack for a loaded shared machine. */
const DISK_TEST_TIMEOUT = 30_000

let root: string

function write(path: string, content: string): void {
	mkdirSync(dirname(join(root, path)), { recursive: true })
	writeFileSync(join(root, path), content)
}

function writePackage(manifest: Record<string, unknown>): void {
	write('package.json', JSON.stringify(manifest))
}

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), 'dialecte-cli-export-entries-'))
})

afterEach(() => {
	rmSync(root, { recursive: true, force: true })
})

describe('readExportEntries', { timeout: DISK_TEST_TIMEOUT }, () => {
	it('exports map with ., ./sqlite, ./test (types under dist) → specifiers and sources in the order of the map (test before sqlite), src/test.ts absent', () => {
		writePackage({
			name: '@acme/pkg',
			exports: {
				'.': { types: './dist/index.d.ts', import: './dist/index.js' },
				'./test': { types: './dist/test.d.ts', import: './dist/test.js' },
				'./sqlite': { types: './dist/sqlite.d.ts', import: './dist/sqlite.js' },
			},
		})
		write('src/index.ts', 'export {}\n')
		write('src/sqlite.ts', 'export {}\n')
		write('src/test/index.ts', 'export {}\n')

		expect(readExportEntries({ root })).toEqual([
			{ specifier: '@acme/pkg', source: 'src/index.ts' },
			{ specifier: '@acme/pkg/test', source: 'src/test/index.ts' },
			{ specifier: '@acme/pkg/sqlite', source: 'src/sqlite.ts' },
		])
	})

	it('a ./test/xsd/* subpath and a subpath whose target is not a .d.ts → skipped', () => {
		writePackage({
			name: '@acme/pkg',
			exports: {
				'.': { types: './dist/index.d.ts' },
				'./test/xsd/*': { types: './dist/test/xsd/*.d.ts' },
				'./schema': { import: './dist/schema.js' },
				'./data': './data/file.json',
			},
		})
		write('src/index.ts', 'export {}\n')

		expect(readExportEntries({ root })).toEqual([
			{ specifier: '@acme/pkg', source: 'src/index.ts' },
		])
	})

	it('a string target ending in .d.ts → an entry', () => {
		writePackage({ name: '@acme/pkg', exports: { './sub': './dist/sub.d.ts' } })
		write('src/sub.ts', 'export {}\n')

		expect(readExportEntries({ root })).toEqual([
			{ specifier: '@acme/pkg/sub', source: 'src/sub.ts' },
		])
	})

	it('an entry whose source exists in neither form → throws naming the subpath and both paths tried', () => {
		writePackage({
			name: '@acme/pkg',
			exports: { './missing': { types: './dist/missing.d.ts' } },
		})

		expect(() => readExportEntries({ root })).toThrow(
			/\.\/missing.*src\/missing\.ts.*src\/missing\/index\.ts/s,
		)
	})

	it('no exports field → no entries', () => {
		writePackage({ name: '@acme/pkg' })

		expect(readExportEntries({ root })).toEqual([])
	})

	it('both src/x.ts and src/x/index.ts exist → src/x.ts', () => {
		writePackage({ name: '@acme/pkg', exports: { './x': { types: './dist/x.d.ts' } } })
		write('src/x.ts', 'export {}\n')
		write('src/x/index.ts', 'export {}\n')

		expect(readExportEntries({ root })).toEqual([{ specifier: '@acme/pkg/x', source: 'src/x.ts' }])
	})

	it('types under ./build/ → the source under src/', () => {
		writePackage({ name: '@acme/pkg', exports: { './y': { types: './build/y.d.ts' } } })
		write('src/y.ts', 'export {}\n')

		expect(readExportEntries({ root })).toEqual([{ specifier: '@acme/pkg/y', source: 'src/y.ts' }])
	})

	it('a condition object nesting the types one level (import.types) → an entry with source src/x.ts', () => {
		writePackage({
			name: '@acme/pkg',
			exports: {
				'./x': { import: { types: './dist/x.d.ts', default: './dist/x.js' } },
			},
		})
		write('src/x.ts', 'export {}\n')

		expect(readExportEntries({ root })).toEqual([{ specifier: '@acme/pkg/x', source: 'src/x.ts' }])
	})

	it('types ending in .d.mts and .d.cts → sources src/x.mts and src/y/index.cts (the index fallback keeps the extension)', () => {
		writePackage({
			name: '@acme/pkg',
			exports: {
				'./x': { types: './dist/x.d.mts' },
				'./y': { types: './dist/y.d.cts' },
			},
		})
		write('src/x.mts', 'export {}\n')
		write('src/y/index.cts', 'export {}\n')

		expect(readExportEntries({ root })).toEqual([
			{ specifier: '@acme/pkg/x', source: 'src/x.mts' },
			{ specifier: '@acme/pkg/y', source: 'src/y/index.cts' },
		])
	})

	it('types ending in .d.mts or .d.cts with only src/x.ts present → src/x.ts', () => {
		writePackage({
			name: '@acme/pkg',
			exports: { './x': { types: './dist/x.d.mts' }, './c': { types: './dist/c.d.cts' } },
		})
		write('src/x.ts', 'export {}\n')
		write('src/c.ts', 'export {}\n')

		expect(readExportEntries({ root })).toEqual([
			{ specifier: '@acme/pkg/x', source: 'src/x.ts' },
			{ specifier: '@acme/pkg/c', source: 'src/c.ts' },
		])
	})

	it('types ending in .d.mts or .d.cts with only src/x/index.ts present → src/x/index.ts', () => {
		writePackage({
			name: '@acme/pkg',
			exports: { './x': { types: './dist/x.d.mts' }, './c': { types: './dist/c.d.cts' } },
		})
		write('src/x/index.ts', 'export {}\n')
		write('src/c/index.ts', 'export {}\n')

		expect(readExportEntries({ root })).toEqual([
			{ specifier: '@acme/pkg/x', source: 'src/x/index.ts' },
			{ specifier: '@acme/pkg/c', source: 'src/c/index.ts' },
		])
	})

	it('types ending in .d.mts with both src/x.mts and src/x.ts present → src/x.mts', () => {
		writePackage({ name: '@acme/pkg', exports: { './x': { types: './dist/x.d.mts' } } })
		write('src/x.mts', 'export {}\n')
		write('src/x.ts', 'export {}\n')

		expect(readExportEntries({ root })).toEqual([{ specifier: '@acme/pkg/x', source: 'src/x.mts' }])
	})
})
