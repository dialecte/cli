import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { PACKAGE_NAME, SCOPE_FILE } from '../../../test/mutation-package.constants.ts'
import { ledgerKeyOf, reportedRun, survivorOf } from '../../../test/mutation-package.ts'
import { SCRATCH_REPOSITORY_TIMEOUT } from '../../../test/scratch-checks.constants.ts'
import { createScratchRepository } from '../../../test/scratch-repository.ts'
import { commonGitDirOf } from '../../../test/scratch-tree.ts'
import { processStartTime } from '../process-start-time.ts'
import { readLedger, updateLedger } from './ledger.ts'
import { MUTATION_STORE_FOLDER } from './mutation.constants.ts'

import { describe, expect, it } from 'vitest'

const LOCK_FILE = 'ledger.lock'

describe('a ledger lock naming this very process', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('(its pid and its start time) → its own: the update lands at once', () => {
		const root = createScratchRepository({
			'package.json': `${JSON.stringify({ name: PACKAGE_NAME })}\n`,
		})
		const store = join(commonGitDirOf(root), MUTATION_STORE_FOLDER)
		mkdirSync(store, { recursive: true })
		const owner = { pid: process.pid, startedAt: processStartTime(process.pid) }
		writeFileSync(join(store, LOCK_FILE), `${JSON.stringify(owner)}\n`)
		const run = reportedRun({ root, runId: 'r1', survivors: [survivorOf({ key: 'k1' })] })

		expect(() => updateLedger({ root, run, records: {}, targets: [SCOPE_FILE] })).not.toThrow()
		expect(Object.keys(readLedger({ root }))).toEqual([ledgerKeyOf({ key: 'k1' })])
	})
})
