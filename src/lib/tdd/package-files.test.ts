/** A tree path is written with `/` whatever separator the platform split it with. */
import { posix, win32 } from 'node:path'

import { posixPathOf } from './package-files.ts'

import { describe, expect, it } from 'vitest'

describe('posixPathOf', () => {
	it.each([
		{
			name: "Windows' separator",
			path: 'src\\lib\\host\\github\\github-host.ts',
			separator: win32.sep,
			written: 'src/lib/host/github/github-host.ts',
		},
		{
			name: "POSIX's separator",
			path: 'src/lib/host/github/github-host.ts',
			separator: posix.sep,
			written: 'src/lib/host/github/github-host.ts',
		},
	])('$name → the path with /', ({ path, separator, written }) => {
		expect(posixPathOf({ path, separator })).toBe(written)
	})
})
