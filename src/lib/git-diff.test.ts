import { addedLineRangesOf } from './git-diff.ts'

import { describe, expect, it } from 'vitest'

const DIFF = [
	'diff --git a/src/a.ts b/src/a.ts',
	'index 1111111..2222222 100644',
	'--- a/src/a.ts',
	'+++ b/src/a.ts',
	'@@ -6 +7 @@ export function first() {',
	'-const old = 1',
	'+const next = 1',
	'@@ -9,0 +10,3 @@ export function second() {',
	'+const one = 1',
	'+const two = 2',
	'+const three = 3',
	'@@ -20,2 +22,0 @@ export function third() {',
	'-const gone = 1',
	'-const alsoGone = 2',
	'diff --git a/src/new.ts b/src/new.ts',
	'new file mode 100644',
	'index 0000000..3333333',
	'--- /dev/null',
	'+++ b/src/new.ts',
	'@@ -0,0 +1,4 @@',
	'+export function made() {',
	'+\treturn 1',
	'+}',
	'+',
	'',
].join('\n')

describe('addedLineRangesOf', () => {
	it('a diff of two files → per path the lines added: a hunk with a count, a hunk without one, a new file; a deleting hunk adds none', () => {
		expect(Object.fromEntries(addedLineRangesOf({ diff: DIFF }))).toEqual({
			'src/a.ts': [
				{ start: 7, end: 7 },
				{ start: 10, end: 12 },
			],
			'src/new.ts': [{ start: 1, end: 4 }],
		})
	})
})
