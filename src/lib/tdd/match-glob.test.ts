import { matchesGlob } from './match-glob.ts'

import { describe, expect, it } from 'vitest'

const ROWS: Array<{ name: string; glob: string; path: string; matches: boolean }> = [
	{
		name: '** matches zero folders',
		glob: 'scripts/**/*.test.ts',
		path: 'scripts/tiers.test.ts',
		matches: true,
	},
	{
		name: '** matches one folder',
		glob: 'scripts/**/*.test.ts',
		path: 'scripts/test-tiers/tiers.test.ts',
		matches: true,
	},
	{
		name: '** matches several folders',
		glob: 'scripts/**/*.test.ts',
		path: 'scripts/a/b/c/tiers.test.ts',
		matches: true,
	},
	{
		name: '** keeps the prefix: another root folder does not match',
		glob: 'scripts/**/*.test.ts',
		path: 'src/scripts/tiers.test.ts',
		matches: false,
	},
	{
		name: 'a leading ** matches from the root',
		glob: '**/*.test.ts',
		path: 'src/deep/add.test.ts',
		matches: true,
	},
	{ name: '* within one folder', glob: 'src/*.test.ts', path: 'src/add.test.ts', matches: true },
	{
		name: '* never crosses a /',
		glob: 'src/*.test.ts',
		path: 'src/deep/add.test.ts',
		matches: false,
	},
	{ name: '? is one character', glob: 'src/a?d.test.ts', path: 'src/add.test.ts', matches: true },
	{
		name: '? is never a /',
		glob: 'src/a?d.test.ts',
		path: 'src/a/d.test.ts',
		matches: false,
	},
	{
		name: '? is exactly one character, not zero',
		glob: 'src/a?d.test.ts',
		path: 'src/ad.test.ts',
		matches: false,
	},
	{
		name: 'a literal path matches itself',
		glob: 'src/add.test.ts',
		path: 'src/add.test.ts',
		matches: true,
	},
	{
		name: 'a literal path matches nothing else (no prefix match)',
		glob: 'src/add.test.ts',
		path: 'src/add.test.ts.snap',
		matches: false,
	},
	{
		name: 'a literal path does not match a longer path ending with it',
		glob: 'add.test.ts',
		path: 'src/add.test.ts',
		matches: false,
	},
	{
		name: 'a . is a literal dot, not any character',
		glob: 'src/add.test.ts',
		path: 'src/addXtestXts',
		matches: false,
	},
	{
		name: '+ and ( ) are literal',
		glob: 'src/a+(b).test.ts',
		path: 'src/a+(b).test.ts',
		matches: true,
	},
	{
		name: '+ is not a repetition',
		glob: 'src/a+.test.ts',
		path: 'src/aa.test.ts',
		matches: false,
	},
	{
		name: 'a glob matching nothing',
		glob: 'lib/**/*.test.ts',
		path: 'src/add.test.ts',
		matches: false,
	},
]

describe('matchesGlob', () => {
	for (const row of ROWS)
		it(`${row.name}: ${row.glob} against ${row.path} → ${row.matches}`, () => {
			expect(matchesGlob({ path: row.path, glob: row.glob })).toBe(row.matches)
		})
})
