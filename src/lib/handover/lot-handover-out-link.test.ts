/**
 * `--out` naming a dangling symbolic link (or a path below one) is refused up front, never followed: the folder it
 * leads to is not made, and the write does not go on to fail later with a stack.
 */
import { existsSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'

import {
	DANGLING_LINK_NAME,
	MISSING_TARGET_NAME,
	OUT_ROWS,
} from '../../../test/lot-handover-out-link.constants.ts'
import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { resolveHandoverOut } from './lot-handover.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

describe('resolveHandoverOut, a dangling link', { timeout: STORE_CASE_TIMEOUT }, () => {
	for (const row of OUT_ROWS)
		it(`${row.title} -> a refusal naming the link, nothing made where it points`, () => {
			const folder = temporaryFolder('dialecte-out-')
			vi.stubEnv('XDG_STATE_HOME', join(folder, 'state'))
			const missing = join(folder, MISSING_TARGET_NAME)
			const link = join(folder, DANGLING_LINK_NAME)
			symlinkSync(missing, link)

			expect({
				resolved: resolveHandoverOut({ word: row.word(link), cwd: folder }),
				made: existsSync(missing),
			}).toEqual({
				resolved: { refusal: expect.stringContaining(DANGLING_LINK_NAME) },
				made: false,
			})
		})
})
