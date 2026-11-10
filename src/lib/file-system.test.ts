import { mkdirSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { temporaryFolder } from '../../test/scratch-repository.ts'
import { realPathOf } from './file-system.ts'
import { probeCaseInsensitive } from './store/brief.ts'

import { describe, expect, it } from 'vitest'

/** Whether the temporary volume treats a path and its case-swapped spelling as one (the macOS default). */
const CASE_INSENSITIVE = probeCaseInsensitive({ path: tmpdir() })

describe('realPathOf', () => {
	it.skipIf(!CASE_INSENSITIVE)(
		'a path spelled in another letter case → the on-disk spelling (skipped on a case-sensitive volume: there is no other spelling of a path)',
		() => {
			const base = realpathSync(temporaryFolder('dialecte-real-path-'))
			mkdirSync(join(base, 'Repo', 'Src'), { recursive: true })

			expect(realPathOf(join(base, 'repo', 'src'))).toBe(join(base, 'Repo', 'Src'))
		},
	)

	it('a path that does not exist → as it is', () => {
		const base = realpathSync(temporaryFolder('dialecte-real-path-'))

		expect(realPathOf(join(base, 'Missing'))).toBe(join(base, 'Missing'))
	})
})
