/** `readLotsFile` checks `target`: one non-empty line when present; anything else is refused with a message naming it. */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { readLotsFile } from './read-lots-file.ts'

import { describe, expect, it } from 'vitest'

const HEAD = 'a'.repeat(40)

const REFUSED_TARGETS: { title: string; target: unknown }[] = [
	{ title: 'an empty target', target: '' },
	{ title: 'a target of two lines', target: 'main\nrelease' },
	{ title: 'a target that is a number', target: 7 },
	{ title: 'a target that is a list', target: ['main'] },
]

/** `readLotsFile` of a lots file holding one plain lot and `target`. */
function readWithTarget(target: unknown): ReturnType<typeof readLotsFile> {
	const path = join(temporaryFolder('dialecte-lots-target-'), 'lots.json')
	writeFileSync(
		path,
		JSON.stringify({
			repository: '/work/repository',
			branch: 'feat/x',
			head: HEAD,
			target,
			lots: [{ paths: ['src/a.ts'], message: 'feat(a): add a' }],
		}),
	)
	return readLotsFile(path)
}

describe('readLotsFile: target', () => {
	for (const row of REFUSED_TARGETS) {
		it(`${row.title} → refused with a message naming target`, () => {
			expect(readWithTarget(row.target)).toEqual(expect.stringContaining('target'))
		})
	}
})
