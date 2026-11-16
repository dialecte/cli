/**
 * `dialecte health` writes nothing: a run on a copy of the real 0105 fixture (test/fixtures/health-0105, through
 * FIXTURE_0105 and copyHealthFixture) leaves every file and folder of the common dir and of the tmp with its bytes
 * and its modification time, and exits 1 (a red finding), so the run really happened. No `--disk` flag.
 */
import { mkdirSync, utimesSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { LOTS_FOLDER, VERB_NOW } from '../../test/health-verb.constants.ts'
import { fileStatesOf } from '../../test/health-verb.ts'
import { FIXTURE_0105 } from '../../test/health.constants.ts'
import { copyHealthFixture } from '../../test/health.ts'
import { temporaryFolder } from '../../test/scratch-repository.ts'
import { runHealth } from './health.ts'

import { describe, expect, it } from 'vitest'

describe('health reads only', () => {
	it('a run without --disk → the common dir and the tmp keep their bytes and modification times, exit 1', () => {
		const common = copyHealthFixture({ name: FIXTURE_0105 })
		const tmp = temporaryFolder('dialecte-health-tmp-')
		const scratch = join(tmp, 'dialecte-scratch-old')
		mkdirSync(scratch)
		writeFileSync(join(scratch, 'file.txt'), 'kept')
		const old = new Date(VERB_NOW.getTime() - 3 * 86_400_000)
		utimesSync(scratch, old, old)
		const listPath = join(temporaryFolder('dialecte-health-list-'), 'lot-stores')
		writeFileSync(listPath, `${join(common, LOTS_FOLDER)}\n`)
		const commonBefore = fileStatesOf(common)
		const tmpBefore = fileStatesOf(tmp)

		const result = runHealth({
			cwd: temporaryFolder('dialecte-health-cwd-'),
			argv: ['--since', '2026-11-15'],
			now: VERB_NOW,
			tmp,
			listPath,
			isAlive: () => false,
		})

		expect(result.exitCode).toBe(1)
		expect(fileStatesOf(common)).toEqual(commonBefore)
		expect(fileStatesOf(tmp)).toEqual(tmpBefore)
	})
})
