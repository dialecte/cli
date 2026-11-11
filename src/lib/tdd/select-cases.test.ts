import { mkdirSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { probeCaseInsensitive } from '../store/brief.ts'
import { modulesOf } from './select-cases.ts'

import { describe, expect, it } from 'vitest'

/** Whether the temporary volume treats a path and its case-swapped spelling as one (the macOS default). */
const CASE_INSENSITIVE = probeCaseInsensitive({ path: tmpdir() })

describe('modulesOf', () => {
	it.skipIf(!CASE_INSENSITIVE)(
		'a root given spelled in another letter case → the module vitest reported under the on-disk spelling is still found (skipped on a case-sensitive volume: there is no other spelling)',
		() => {
			const base = realpathSync(temporaryFolder('dialecte-select-cases-'))
			mkdirSync(join(base, 'Repo', 'src'), { recursive: true })
			writeFileSync(join(base, 'Repo', 'src', 'a.test.ts'), '')
			const reported = { file: join(base, 'Repo', 'src', 'a.test.ts'), errors: [], cases: [] }

			expect(
				modulesOf({ root: join(base, 'repo'), modules: [reported], file: 'src/a.test.ts' }),
			).toEqual([reported])
		},
	)

	it('a root spelled as on disk → the module of the file, none for another file', () => {
		const base = realpathSync(temporaryFolder('dialecte-select-cases-'))
		mkdirSync(join(base, 'repo', 'src'), { recursive: true })
		writeFileSync(join(base, 'repo', 'src', 'a.test.ts'), '')
		const reported = { file: join(base, 'repo', 'src', 'a.test.ts'), errors: [], cases: [] }

		expect(
			modulesOf({ root: join(base, 'repo'), modules: [reported], file: 'src/a.test.ts' }),
		).toEqual([reported])
		expect(
			modulesOf({ root: join(base, 'repo'), modules: [reported], file: 'src/b.test.ts' }),
		).toEqual([])
	})
})
