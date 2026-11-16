/** `dialecte health` walks the store list: a store that cannot be listed is left out, the others are read. */
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { VERB_NOW } from '../../test/health-verb.constants.ts'
import { FIXTURE_0105 } from '../../test/health.constants.ts'
import { copyHealthFixture } from '../../test/health.ts'
import { temporaryFolder } from '../../test/scratch-repository.ts'
import { runHealth } from './health.ts'

import { describe, expect, it } from 'vitest'

const SINCE_ARGUMENTS = ['--since', '2026-11-15']
const NO_ACCESS = 0o000
const READABLE = 0o755

function healthOverStores(stores: string[]): { exitCode: number; output: string } {
	const listPath = join(temporaryFolder('dialecte-health-list-'), 'lot-stores')
	writeFileSync(listPath, stores.map((store) => `${store}\n`).join(''))
	const { exitCode, output } = runHealth({
		cwd: temporaryFolder('dialecte-health-cwd-'),
		argv: SINCE_ARGUMENTS,
		now: VERB_NOW,
		tmp: temporaryFolder('dialecte-health-tmp-'),
		listPath,
		isAlive: () => false,
	})
	return { exitCode, output }
}

describe('health over a store list holding stores that cannot be listed', () => {
	it('a file and a folder that cannot be read beside a good store → exit normally, those two left out, the good store read, the text as without them', () => {
		const good = join(copyHealthFixture({ name: FIXTURE_0105 }), 'dialecte-lots')
		const file = join(temporaryFolder('dialecte-health-file-'), 'not-a-store')
		writeFileSync(file, 'a file, not a folder\n')
		const locked = join(temporaryFolder('dialecte-health-locked-'), 'dialecte-lots')
		mkdirSync(locked)
		chmodSync(locked, NO_ACCESS)

		try {
			const alone = healthOverStores([good])

			expect({ withOthers: healthOverStores([file, good, locked]), reds: alone.exitCode }).toEqual({
				withOthers: alone,
				reds: 1,
			})
		} finally {
			chmodSync(locked, READABLE)
		}
	})
})
