/** `unifiedDiff`: the lines a drifted file prints, two lines of context around each change. */
import { unifiedDiff } from './text-diff.ts'

import { describe, expect, it } from 'vitest'

describe('unifiedDiff', () => {
	it.each([
		{
			name: 'equal texts → no line',
			before: 'a\nb\n',
			after: 'a\nb\n',
			lines: [],
		},
		{
			name: 'one line changed in the middle → one hunk, two lines of context each side',
			before: 'a\nb\nc\nd\ne\nf\ng\n',
			after: 'a\nb\nc\nX\ne\nf\ng\n',
			lines: [
				'--- f.yml (repository)',
				'+++ f.yml (template)',
				'@@ -2,5 +2,5 @@',
				' b',
				' c',
				'-d',
				'+X',
				' e',
				' f',
			],
		},
		{
			name: 'a line added at the end → the hunk counts it on the template side only',
			before: 'a\n',
			after: 'a\nb\n',
			lines: ['--- f.yml (repository)', '+++ f.yml (template)', '@@ -1,1 +1,2 @@', ' a', '+b'],
		},
		{
			name: 'two changes far apart → two hunks',
			before: '1\n2\n3\n4\n5\n6\n7\n8\n9\n',
			after: 'X\n2\n3\n4\n5\n6\n7\n8\nY\n',
			lines: [
				'--- f.yml (repository)',
				'+++ f.yml (template)',
				'@@ -1,3 +1,3 @@',
				'-1',
				'+X',
				' 2',
				' 3',
				'@@ -7,3 +7,3 @@',
				' 7',
				' 8',
				'-9',
				'+Y',
			],
		},
	])('$name', ({ before, after, lines }) => {
		expect(unifiedDiff({ path: 'f.yml', before, after })).toEqual(lines)
	})
})
