import { literalPartOf, normaliseScopeEntry, overlaps, scopeFaultOf } from './brief-scope.ts'

import { describe, expect, it } from 'vitest'

type NormaliseRow = { entry: string; normalised: string }

const NORMALISE_ROWS: NormaliseRow[] = [
	{ entry: 'src/dataflow', normalised: 'src/dataflow' },
	{ entry: 'src/dataflow/', normalised: 'src/dataflow' },
	{ entry: './src/dataflow/', normalised: 'src/dataflow' },
	{ entry: 'src//dataflow///x', normalised: 'src/dataflow/x' },
	{ entry: 'src/./dataflow/./x/', normalised: 'src/dataflow/x' },
	{ entry: '././src', normalised: 'src' },
	{ entry: 'src//', normalised: 'src' },
	{ entry: 'src/**/*.test.ts', normalised: 'src/**/*.test.ts' },
	{ entry: './src//**/*.ts', normalised: 'src/**/*.ts' },
	{ entry: 'src/a.b/', normalised: 'src/a.b' },
]

describe('normaliseScopeEntry: ./ dropped, // collapsed, trailing / dropped', () => {
	it.each(NORMALISE_ROWS)('$entry -> $normalised', ({ entry, normalised }) => {
		expect(normaliseScopeEntry(entry)).toBe(normalised)
	})
})

type FaultRow = { entry: string; refused: boolean }

const FAULT_ROWS: FaultRow[] = [
	{ entry: '../core/src', refused: true },
	{ entry: '..', refused: true },
	{ entry: 'src/../core', refused: true },
	{ entry: 'src/dataflow/..', refused: true },
	{ entry: '/abs', refused: true },
	{ entry: '/abs/src/x', refused: true },
	{ entry: '/', refused: true },
	{ entry: '.git/hooks', refused: true },
	{ entry: './.git/hooks', refused: true },
	{ entry: '.git', refused: true },
	{ entry: '.dialecte/', refused: true },
	{ entry: '.dialecte/lot', refused: true },
	{ entry: '**', refused: true },
	{ entry: './**', refused: true },
	{ entry: '**/', refused: true },
	{ entry: 'src/', refused: false },
	{ entry: './src//dataflow/', refused: false },
	{ entry: 'src/**', refused: false },
	{ entry: 'src/**/*.test.ts', refused: false },
	{ entry: '**/*.test.ts', refused: false },
	{ entry: '.github/workflows', refused: false },
	{ entry: '.gitignore', refused: false },
	{ entry: '.dialecte-notes/x', refused: false },
	{ entry: 'src/a..b', refused: false },
]

describe('scopeFaultOf: the entries a brief refuses, after normalisation', () => {
	it.each(FAULT_ROWS)('$entry -> refused: $refused', ({ entry, refused }) => {
		expect(typeof scopeFaultOf({ entry })).toBe(refused ? 'string' : 'undefined')
	})
})

type LiteralRow = { entry: string; literal: string }

const LITERAL_ROWS: LiteralRow[] = [
	{ entry: 'src/dataflow', literal: 'src/dataflow' },
	{ entry: 'src/a.b/c', literal: 'src/a.b/c' },
	{ entry: 'src/data*', literal: 'src/data' },
	{ entry: 'src/**/*.test.ts', literal: 'src/' },
	{ entry: '*.ts', literal: '' },
	{ entry: 'src/a?c', literal: 'src/a' },
	{ entry: 'src/[ab]', literal: 'src/' },
	{ entry: 'src/x{a,b}', literal: 'src/x' },
	{ entry: 'src/y(a|b)', literal: 'src/y' },
	{ entry: 'src/z!x', literal: 'src/z' },
	{ entry: 'src/a*b?c', literal: 'src/a' },
]

describe('literalPartOf: everything before the first of * ? [ { ( !', () => {
	it.each(LITERAL_ROWS)('$entry -> $literal', ({ entry, literal }) => {
		expect(literalPartOf(entry)).toBe(literal)
	})
})

type OverlapRow = { a: string; b: string; caseInsensitive?: boolean; overlap: boolean }

const OVERLAP_ROWS: OverlapRow[] = [
	{ a: 'src/dataflow', b: 'src/dataflow', overlap: true },
	{ a: 'src', b: 'src/dataflow', overlap: true },
	{ a: 'src/dataflow', b: 'src', overlap: true },
	{ a: 'src/data*', b: 'src/dataflow', overlap: true },
	{ a: 'src/dataflow', b: 'src/data*', overlap: true },
	{ a: 'src/data', b: 'src/dataflow', overlap: true },
	{ a: 'src/a', b: 'src/b', overlap: false },
	{ a: 'src/a', b: 'lib/a', overlap: false },
	{ a: 'src/**/x.ts', b: 'src/b', overlap: true },
	{ a: '*.ts', b: 'src/b', overlap: true },
	{ a: 'src/a*', b: 'src/b*', overlap: false },
	{ a: 'src/a*', b: 'src/ab*', overlap: true },
	// the literal part is cut at the first glob character, whatever follows it
	{ a: 'src/a?c', b: 'src/abd', overlap: true },
	{ a: 'src/ab*', b: 'src/ab', overlap: true },
	// each glob character cuts the literal part
	{ a: 'src/ab*', b: 'src/abxyz', overlap: true },
	{ a: 'src/ab?', b: 'src/abxyz', overlap: true },
	{ a: 'src/ab[x]', b: 'src/abxyz', overlap: true },
	{ a: 'src/ab{x,y}', b: 'src/abxyz', overlap: true },
	{ a: 'src/ab(x)', b: 'src/abxyz', overlap: true },
	{ a: 'src/ab!x', b: 'src/abxyz', overlap: true },
	{ a: 'src/x*', b: 'src/y/z', overlap: false },
	{ a: 'src/x?', b: 'src/y/z', overlap: false },
	{ a: 'src/x[a]', b: 'src/y/z', overlap: false },
	{ a: 'src/x{a,b}', b: 'src/y/z', overlap: false },
	{ a: 'src/x(a)', b: 'src/y/z', overlap: false },
	{ a: 'src/x!a', b: 'src/y/z', overlap: false },
	// the case-insensitive flag
	{ a: 'src/Data', b: 'src/data', caseInsensitive: false, overlap: false },
	{ a: 'src/Data', b: 'src/data', caseInsensitive: true, overlap: true },
	{ a: 'src/DATA*', b: 'src/dataflow', caseInsensitive: true, overlap: true },
	{ a: 'src/Data', b: 'src/Other', caseInsensitive: true, overlap: false },
]

describe('overlaps: a literal part that is a string prefix of the other', () => {
	it.each(OVERLAP_ROWS)('$a vs $b (insensitive: $caseInsensitive) -> $overlap', (row) => {
		expect(overlaps({ a: row.a, b: row.b, caseInsensitive: row.caseInsensitive ?? false })).toBe(
			row.overlap,
		)
	})
})
