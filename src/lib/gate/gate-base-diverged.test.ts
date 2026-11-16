/**
 * A local base branch holding commits origin's lacks: the gate base is read from origin's (the queue lands on the
 * host), and the gate says so instead of moving the base silently.
 */
import { join } from 'node:path'

import { SCRATCH_REPOSITORY_TIMEOUT } from '../../../test/scratch-checks.constants.ts'
import {
	cloneRepository,
	createScratchRepository,
	git,
	temporaryFolder,
} from '../../../test/scratch-repository.ts'
import { resolveGateBase } from './gate-base.ts'

import { describe, expect, it } from 'vitest'

/** A clone of a scratch repository on `main`, with `local` commits origin lacks and `remote` ones it lacks. */
function cloneWith(params: { local: number; remote: number }): string {
	const origin = createScratchRepository()
	const clone = cloneRepository({
		origin,
		into: join(temporaryFolder('dialecte-diverged-'), 'clone'),
	})
	for (let index = 0; index < params.remote; index += 1)
		git({ root: origin, args: ['commit', '-q', '--allow-empty', '-m', `chore: remote ${index}`] })
	for (let index = 0; index < params.local; index += 1)
		git({ root: clone, args: ['commit', '-q', '--allow-empty', '-m', `chore: local ${index}`] })
	git({ root: clone, args: ['fetch', '-q', 'origin'] })
	return clone
}

describe('the gate base of a diverged base branch', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('a local main with 2 commits origin/main lacks, origin/main ahead too → a note naming the count and origin/main', () => {
		const clone = cloneWith({ local: 2, remote: 1 })

		const base = resolveGateBase({ root: clone })

		expect('note' in base ? base.note : undefined).toBe(
			'local main holds 2 commit(s) origin/main does not: the base is read from origin/main',
		)
	})

	it('a local main behind origin/main → no note', () => {
		const clone = cloneWith({ local: 0, remote: 1 })

		const base = resolveGateBase({ root: clone })

		expect('note' in base ? base.note : undefined).toBeUndefined()
	})
})
