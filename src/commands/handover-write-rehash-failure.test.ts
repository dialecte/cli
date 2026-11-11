/**
 * R2-2: a `handover write --rehash` of a still-pending hand-over that fails leaves its lock as it was, bytes
 * unchanged (the hand-over is still pending: the repository stays held by it).
 */
import { existsSync, readFileSync } from 'node:fs'

import { outcomeOf } from '../../test/call-outcome.ts'
import { WRITE_FAILURE_MESSAGE } from '../../test/handover-lock-writers.constants.ts'
import { STORE_FIRST_NAME, STORE_WRITER_CLI } from '../../test/handover-store-scenario.constants.ts'
import { createBranchRepository, writeStoreHandover } from '../../test/handover-store-scenario.ts'
import { noRepositoryCli } from '../../test/repository-cli-probe.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { handoverLockPath } from '../lib/handover/handover-lock.ts'
import { writeHandover } from '../lib/handover/write-handover.ts'
import { runHandover } from './handover.ts'

import { describe, expect, it, vi } from 'vitest'

vi.mock('../lib/handover/write-handover.ts', async function mockWriteHandover(importOriginal) {
	const original = await importOriginal<typeof import('../lib/handover/write-handover.ts')>()
	return { ...original, writeHandover: vi.fn(original.writeHandover) }
})

describe(
	'a failed handover write --rehash of a pending hand-over',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it('the write fails -> the error is thrown, the lock still there with the bytes it had', () => {
			const root = createBranchRepository()
			const { folder, lotsPath } = writeStoreHandover({
				root,
				name: STORE_FIRST_NAME,
				changes: { 'src/read.ts': 'export function read() {\n\treturn 1\n}\n' },
				keepLock: true,
			})
			const lockPath = handoverLockPath(root)
			const lockBefore = readFileSync(lockPath, 'utf8')
			vi.mocked(writeHandover).mockImplementationOnce(function failing() {
				throw new Error(WRITE_FAILURE_MESSAGE)
			})

			const outcome = outcomeOf(() =>
				runHandover({
					argv: [lotsPath, '--rehash', '--out', folder],
					cliPath: STORE_WRITER_CLI,
					probe: noRepositoryCli,
					cwd: root,
				}),
			)

			expect(outcome).toEqual({ error: WRITE_FAILURE_MESSAGE })
			expect(existsSync(lockPath) ? readFileSync(lockPath, 'utf8') : undefined).toBe(lockBefore)
		})
	},
)
