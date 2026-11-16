/** The corpora's cache folder: the environment variable first, else `corpora/` in the cli cache root. */
import { join } from 'node:path'

import { corporaFolderOf } from './corpora-folder-of.ts'

import { describe, expect, it } from 'vitest'

describe('corporaFolderOf', () => {
	it.each([
		{
			case: 'DIALECTE_CORPORA_DIR set',
			environment: {
				DIALECTE_CORPORA_DIR: '/ci/cache/corpora',
				XDG_CACHE_HOME: '/xdg',
				HOME: '/home/person-a',
			},
			expected: '/ci/cache/corpora',
		},
		{
			case: 'DIALECTE_CORPORA_DIR empty, XDG_CACHE_HOME set',
			environment: { DIALECTE_CORPORA_DIR: '', XDG_CACHE_HOME: '/xdg', HOME: '/home/person-a' },
			expected: join('/xdg', 'dialecte', 'corpora'),
		},
		{
			case: 'neither set',
			environment: { HOME: '/home/person-a' },
			expected: join('/home/person-a', '.cache', 'dialecte', 'corpora'),
		},
	])('$case -> $expected', ({ environment, expected }) => {
		expect(corporaFolderOf({ environment })).toBe(expected)
	})
})
