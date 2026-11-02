import { mkdirSync, utimesSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { PACKAGE_NAME, SCOPE_FILE } from '../../../test/mutation-package.constants.ts'
import { ledgerKeyOf, reportedRun, survivorOf } from '../../../test/mutation-package.ts'
import { SCRATCH_REPOSITORY_TIMEOUT } from '../../../test/scratch-checks.constants.ts'
import { createScratchRepository } from '../../../test/scratch-repository.ts'
import { commonGitDirOf } from '../../../test/scratch-tree.ts'
import { readLedger, updateLedger } from './ledger.ts'
import { MUTATION_STORE_FOLDER } from './mutation.constants.ts'

import { describe, expect, it } from 'vitest'

const LOCK_FILE = 'ledger.lock'
const AN_HOUR_AGO_SECONDS = Date.now() / 1000 - 3600

/** A repository whose ledger lock already holds `text`. */
function lockedRepository(text: string): { root: string; lock: string } {
	const root = createScratchRepository({
		'package.json': `${JSON.stringify({ name: PACKAGE_NAME })}\n`,
	})
	const store = join(commonGitDirOf(root), MUTATION_STORE_FOLDER)
	mkdirSync(store, { recursive: true })
	const lock = join(store, LOCK_FILE)
	writeFileSync(lock, text)
	return { root, lock }
}

function takeK1In(root: string): void {
	const run = reportedRun({ root, runId: 'r1', survivors: [survivorOf({ key: 'k1' })] })
	updateLedger({ root, run, records: {}, targets: [SCOPE_FILE] })
}

describe('a ledger lock its owner left behind', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('a live pid that started at another time than the lock says (the pid was reused) → taken over', () => {
		const { root } = lockedRepository(
			`${JSON.stringify({ pid: process.pid, startedAt: 'Thu Jan  1 00:00:00 1970' })}\n`,
		)

		expect(() => takeK1In(root)).not.toThrow()
		expect(Object.keys(readLedger({ root }))).toEqual([ledgerKeyOf({ key: 'k1' })])
	})

	it('a lock naming no process, written long ago (its writer crashed before writing) → taken over', () => {
		const { root, lock } = lockedRepository('')
		utimesSync(lock, AN_HOUR_AGO_SECONDS, AN_HOUR_AGO_SECONDS)

		expect(() => takeK1In(root)).not.toThrow()
		expect(Object.keys(readLedger({ root }))).toEqual([ledgerKeyOf({ key: 'k1' })])
	})
})
