/** `lot decide`: the usage error names the finding, not a second `<id>` (E17, R1-8). */
import { join } from 'node:path'

import { temporaryFolder } from '../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { runLot } from './lot.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

const USAGE_ROWS: Record<string, string[]> = {
	'no word at all': ['decide'],
	'only the folder': ['decide', 'folder'],
	'the folder and the finding, no state': ['decide', 'folder', 'R1-1'],
}

describe('lot decide, the usage error', { timeout: STORE_CASE_TIMEOUT }, () => {
	for (const [title, argv] of Object.entries(USAGE_ROWS))
		it(`${title} -> exit 2, a lot decide line naming <finding> and no bare <id>`, () => {
			const folder = temporaryFolder('dialecte-decide-')
			vi.stubEnv('XDG_STATE_HOME', join(folder, 'state'))

			expect(runLot({ cwd: folder, argv })).toEqual({
				exitCode: 2,
				output: expect.stringMatching(/^(?![^\n]*<id>)lot decide: [^\n]*<finding>/),
			})
		})
})
