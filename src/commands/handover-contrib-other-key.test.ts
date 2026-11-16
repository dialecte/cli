/**
 * `handover run`'s `contrib` guard when the tree's green contrib record was made under another key - another cli (an
 * installed one older than the one that ran contrib) or other contrib rows: the guard names it and this cli's version
 * instead of saying only that there is none.
 */
import { rekeyStoredLocks } from '../../test/gate-records.ts'
import { editedPackage, installAgain, writeProfileHandover } from '../../test/handover-profile.ts'
import { FOREIGN_LOCK_HASH } from '../../test/lock-key.constants.ts'
import { SCRATCH_REPOSITORY_TIMEOUT } from '../../test/scratch-checks.constants.ts'
import { runFolder } from '../../test/scratch-checks.ts'
import { runContribIn } from '../../test/scratch-contrib.ts'
import { readCliVersion } from '../lib/read-cli-version.ts'

import { describe, expect, it } from 'vitest'

describe(
	'handover run: the contrib guard and another key',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it('no contrib record of this key, a green one of the same tree under another key → the guard names it and this cli', async () => {
			const root = editedPackage({ steps: [] })
			installAgain(root)
			await runContribIn({ cwd: root })
			rekeyStoredLocks({ root, lockHash: FOREIGN_LOCK_HASH })
			const out = writeProfileHandover({ root })

			const run = await runFolder({ out })

			const line = run.text.split('\n').find((text) => /^[✗!] contrib\b/.test(text)) ?? ''
			expect({
				otherKey: line.includes('a green one of this tree at '),
				recordedUnder: line.includes('was recorded under another key'),
				version: line.includes(`this cli is ${readCliVersion()}`),
			}).toEqual({ otherKey: true, recordedUnder: true, version: true })
		})
	},
)
