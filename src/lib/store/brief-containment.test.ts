/** Scope containment and coverage on path segments (decision E1); the lot-vs-lot overlap stays a string prefix. */
import { coversEntry, isInsideEntry, normaliseScopeEntry, overlaps } from './brief-scope.ts'

import { describe, expect, it } from 'vitest'

type BoundaryRow = {
	/** The scope entry as a brief writes it. */
	entry: string
	/** The lot path, normalised. */
	path: string
	inside: boolean
	/** A glob cut inside a name covers by plain string prefix, in either direction. */
	covers: boolean
	/** The conservative string prefix between the two. */
	overlap: boolean
}

const BOUNDARY_ROWS: BoundaryRow[] = [
	// a name that only shares a string prefix is outside, and does not cover
	{ entry: 'lib/', path: 'lib-other/x', inside: false, covers: false, overlap: true },
	{ entry: 'lib/', path: 'libx', inside: false, covers: false, overlap: true },
	{ entry: 'lib', path: 'libx', inside: false, covers: false, overlap: true },
	{ entry: 'src/a', path: 'src/ab', inside: false, covers: false, overlap: true },
	// the lot path equals the entry, or sits below it at a boundary
	{ entry: 'lib/', path: 'lib', inside: true, covers: true, overlap: true },
	{ entry: 'lib/', path: 'lib/x', inside: true, covers: true, overlap: true },
	{ entry: 'lib', path: 'lib/x', inside: true, covers: true, overlap: true },
	// a glob cut inside a name keeps the string prefix
	{ entry: 'src/data*', path: 'src/dataflow', inside: true, covers: true, overlap: true },
	{ entry: 'src/data*', path: 'src/data', inside: true, covers: true, overlap: true },
	{ entry: 'src/data*', path: 'src/dat', inside: false, covers: true, overlap: true },
	// a glob cut right after a slash holds the folder and what is below it, nothing that shares its prefix
	{ entry: 'src/**', path: 'src', inside: true, covers: true, overlap: true },
	{ entry: 'src/**', path: 'src/a', inside: true, covers: true, overlap: true },
	{ entry: 'src/**', path: 'srcx', inside: false, covers: false, overlap: false },
	{
		entry: 'src/dataflow/**/*.test.ts',
		path: 'src/dataflow',
		inside: true,
		covers: true,
		overlap: true,
	},
	{
		entry: 'src/dataflow/**/*.test.ts',
		path: 'src/dataflow-other',
		inside: false,
		covers: false,
		overlap: false,
	},
	// coverage both ways on segment boundaries
	{ entry: 'src/a', path: 'src', inside: false, covers: true, overlap: true },
	{ entry: 'src/a', path: 'sr', inside: false, covers: false, overlap: true },
	{ entry: 'src/a', path: 'src/a/b', inside: true, covers: true, overlap: true },
	{ entry: 'src/a/b', path: 'src/a', inside: false, covers: true, overlap: true },
	{ entry: 'src/a/b', path: 'src/a/bc', inside: false, covers: false, overlap: true },
	// no relation at all
	{ entry: 'lib/', path: 'src/a', inside: false, covers: false, overlap: false },
]

describe('segment containment and coverage, one table (E1)', () => {
	it('every row: inside and covers by path segments, overlap by string prefix', () => {
		expect(
			BOUNDARY_ROWS.map((row) => ({
				entry: row.entry,
				path: row.path,
				inside: isInsideEntry({ path: row.path, entry: normaliseScopeEntry(row.entry) }),
				covers: coversEntry({ path: row.path, entry: normaliseScopeEntry(row.entry) }),
				overlap: overlaps({
					a: normaliseScopeEntry(row.entry),
					b: row.path,
					caseInsensitive: false,
				}),
			})),
		).toEqual(BOUNDARY_ROWS)
	})
})
