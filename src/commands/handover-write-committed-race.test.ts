/** `handover write --rehash --out <lot folder>` while another process commits the hand-over: refused at the registry, nothing held. */
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { outcomeOf } from '../../test/call-outcome.ts'
import { STORE_WRITER_CLI } from '../../test/handover-store-scenario.constants.ts'
import { readIfPresent, setEntryState } from '../../test/handover-store-scenario.ts'
import {
	entryPathOf,
	isolateStateFolder,
	startRealLot,
	writeLotHandover,
} from '../../test/lot-handover-workspace.ts'
import { noRepositoryCli } from '../../test/repository-cli-probe.ts'
import { temporaryFolder } from '../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { handoverLockPath } from '../lib/handover/handover-lock.ts'
import { runHandover } from './handover.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** What the worktree's hand-over lock holds before the write. */
const LOCK_STATES = [
	{ title: 'absent', release: true, otherScript: false },
	{ title: "holding this folder's script", release: false, otherScript: false },
	{
		title: "taken by another folder's script between the checks and the write",
		release: true,
		otherScript: true,
	},
]

describe(
	'handover write --rehash on a lot folder committed meanwhile',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		for (const lockState of LOCK_STATES)
			it(`the entry becomes committed between the checks and the write, the lock ${lockState.title} -> exit 2 naming the committed entry, the entry byte-identical, the lock as the other writer left it or none (one naming this folder's script is removed, never written back)`, () => {
				isolateStateFolder()
				const lot = startRealLot()
				const name = writeLotHandover(lot)
				if (lockState.release) rmSync(handoverLockPath(lot.worktree), { force: true })
				const lockPath = handoverLockPath(lot.worktree)
				let entryAfterCommit: string | undefined
				let lockAfterChecks: string | undefined

				const outcome = outcomeOf(() =>
					runHandover({
						argv: [lot.lotsPath, '--rehash', '--out', lot.lotFolder],
						cliPath: STORE_WRITER_CLI,
						probe: noRepositoryCli,
						cwd: lot.worktree,
						afterChecks: () => {
							setEntryState({ root: lot.start.repository, name, state: 'committed' })
							entryAfterCommit = readFileSync(entryPathOf({ lot, name }), 'utf8')
							if (lockState.otherScript) {
								const otherScript = join(temporaryFolder('dialecte-other-handover-'), 'commit.sh')
								writeFileSync(otherScript, '#!/bin/sh\n')
								writeFileSync(lockPath, `${otherScript}\n`)
							}
							lockAfterChecks = readIfPresent(lockPath)
						},
					}),
				)

				expect(outcome).toMatchObject({
					value: {
						exitCode: 2,
						output: expect.stringContaining(
							`${name} is committed: a committed hand-over is never rewritten`,
						),
					},
				})
				expect(readFileSync(entryPathOf({ lot, name }), 'utf8')).toBe(entryAfterCommit)
				expect(readIfPresent(lockPath)).toBe(lockState.otherScript ? lockAfterChecks : undefined)
			})
	},
)
