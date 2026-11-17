/** `dialecte health` names the scratch folders leaked in the scratch root. */
import { mkdirSync, utimesSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { VERB_NOW } from '../../test/health-verb.constants.ts'
import { temporaryFolder } from '../../test/scratch-repository.ts'
import { runHealth } from './health.ts'

import { describe, expect, it, vi } from 'vitest'

/** A scratch folder in `root`, older than every leak budget, its owner gone. */
function leakedFolderIn(root: string): string {
	const folder = join(root, 'dialecte-gate-scope-leaked')
	mkdirSync(folder, { recursive: true })
	const old = new Date('2026-11-01T00:00:00.000Z')
	writeFileSync(
		join(folder, 'scratch.json'),
		JSON.stringify({ pid: 1, startedAt: old.toISOString(), command: 'x' }),
	)
	utimesSync(folder, old, old)
	return folder
}

/** The health text over no store, the scratch root at `root`. */
function healthOverScratch(root: string): string {
	const listPath = join(temporaryFolder('dialecte-health-list-'), 'lot-stores')
	writeFileSync(listPath, '')
	vi.stubEnv('DIALECTE_SCRATCH', root)
	try {
		return runHealth({
			cwd: temporaryFolder('dialecte-health-cwd-'),
			argv: ['--since', '2026-11-15'],
			now: VERB_NOW,
			tmp: temporaryFolder('dialecte-health-tmp-'),
			listPath,
			isAlive: () => false,
		}).output
	} finally {
		vi.unstubAllEnvs()
	}
}

describe('health over the scratch root', () => {
	it('a scratch folder leaked in the scratch root → named in the leaked scratch finding', () => {
		const root = temporaryFolder('dialecte-health-scratch-')
		const folder = leakedFolderIn(root)
		expect(healthOverScratch(root)).toContain(`1 leaked scratch folder (oldest ${folder}`)
	})
})
