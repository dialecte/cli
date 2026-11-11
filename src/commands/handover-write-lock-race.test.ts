/**
 * `handover write` takes the repository's hand-over lock exclusively: when another hand-over takes it between the
 * checks and the write, the write is refused naming that hand-over and its lock is left as it is, never overwritten.
 */
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { outcomeOf } from '../../test/call-outcome.ts'
import { STORE_WRITER_CLI } from '../../test/handover-store-scenario.constants.ts'
import {
	isolateStateFolder,
	startRealLot,
	writeLotHandover,
} from '../../test/lot-handover-workspace.ts'
import { snapshotOf } from '../../test/lot-start-workspace.ts'
import { noRepositoryCli } from '../../test/repository-cli-probe.ts'
import { temporaryFolder } from '../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { handoverLockPath } from '../lib/handover/handover-lock.ts'
import { runHandover } from './handover.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

describe('handover write, the lock taken meanwhile', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('another hand-over takes the lock between the checks and the write -> exit 2 naming its script, the lock still names it', () => {
		isolateStateFolder()
		const lot = startRealLot()
		writeLotHandover(lot)
		const lockPath = handoverLockPath(lot.worktree)
		rmSync(lockPath, { force: true })
		const otherScript = join(temporaryFolder('dialecte-other-handover-'), 'commit.sh')
		writeFileSync(otherScript, '#!/bin/sh\n')
		const handoverFilesBefore = snapshotOf(lot.lotFolder)

		const outcome = outcomeOf(() =>
			runHandover({
				argv: [lot.lotsPath, '--rehash', '--out', lot.lotFolder],
				cliPath: STORE_WRITER_CLI,
				probe: noRepositoryCli,
				cwd: lot.worktree,
				afterChecks: () => writeFileSync(lockPath, `${otherScript}\n`),
			}),
		)

		expect({
			outcome,
			lock: readFileSync(lockPath, 'utf8'),
			handoverFiles: snapshotOf(lot.lotFolder),
		}).toMatchObject({
			outcome: { value: { exitCode: 2, output: expect.stringContaining(otherScript) } },
			lock: `${otherScript}\n`,
			handoverFiles: handoverFilesBefore,
		})
	})
})
