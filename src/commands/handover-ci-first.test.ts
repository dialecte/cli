/**
 * `handover write` and `handover run` (with or without `--rehearse`) in a CI-first repository: refused with exit 2
 * before anything is written, the refusal naming the flow (commit on the lot branch through the hook, then
 * `lot land <id> --draft`); a repository that is not CI-first writes its hand-over as before.
 */
import {
	HANDOVER_LOT_NAME,
	STORE_FIRST_NAME,
	STORE_WRITER_CLI,
} from '../../test/handover-store-scenario.constants.ts'
import {
	createBranchRepository,
	headOf,
	runIn,
	snapshotOf,
	storeLotFolder,
	writeLotsFile,
	writeStoreHandover,
} from '../../test/handover-store-scenario.ts'
import { noRepositoryCli } from '../../test/repository-cli-probe.ts'
import { git, writeFiles } from '../../test/scratch-repository.ts'
import { HANDOVER_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import {
	CI_FIRST_CHANGES,
	CI_FIRST_FILES,
	CI_FIRST_REFUSAL,
} from './handover-ci-first.constants.ts'
import { runHandover } from './handover.ts'

import { describe, expect, it } from 'vitest'

/** A branch repository whose committed ci.yml makes it CI-first. */
function ciFirstRepository(): string {
	const root = createBranchRepository()
	writeFiles({ root, files: CI_FIRST_FILES })
	git({ root, args: ['add', '.'] })
	git({ root, args: ['commit', '-q', '-m', 'ci: the merge queue'] })
	return root
}

describe('handover in a CI-first repository', { timeout: HANDOVER_CASE_TIMEOUT }, () => {
	it('CI-first repo: handover write → exit 2, the refusal names the flow, no folder written', () => {
		const root = ciFirstRepository()
		writeFiles({ root, files: CI_FIRST_CHANGES })
		const lotsPath = writeLotsFile({ root, name: STORE_FIRST_NAME })
		const folder = storeLotFolder({ root, name: HANDOVER_LOT_NAME })
		const before = snapshotOf({ paths: [folder] })

		const written = runHandover({
			argv: [lotsPath, '--out', folder],
			cliPath: STORE_WRITER_CLI,
			probe: noRepositoryCli,
		})

		expect(written).toMatchObject({ exitCode: 2, output: expect.stringMatching(CI_FIRST_REFUSAL) })
		expect(snapshotOf({ paths: [folder] })).toEqual(before)
	})

	it.each([
		{ name: 'CI-first repo: handover run → exit 2, nothing written in the folder', argv: [] },
		{
			name: 'CI-first repo: handover run --rehearse → exit 2, nothing written in the folder',
			argv: ['--rehearse'],
		},
	])('$name', async ({ argv }) => {
		const root = createBranchRepository()
		const { folder } = writeStoreHandover({
			root,
			name: STORE_FIRST_NAME,
			changes: CI_FIRST_CHANGES,
		})
		// the repository became CI-first after its hand-over was written
		writeFiles({ root, files: CI_FIRST_FILES })
		const before = snapshotOf({ paths: [folder] })
		const head = headOf(root)

		const run = await runIn({ cwd: root, argv: [folder, ...argv] })

		expect(run).toMatchObject({ exitCode: 2, text: expect.stringMatching(CI_FIRST_REFUSAL) })
		expect(snapshotOf({ paths: [folder] })).toEqual(before)
		expect(headOf(root)).toBe(head)
	})

	it('hand-over repo: handover write → written as today', () => {
		const root = createBranchRepository()
		writeFiles({ root, files: CI_FIRST_CHANGES })
		const lotsPath = writeLotsFile({ root, name: STORE_FIRST_NAME })
		const folder = storeLotFolder({ root, name: HANDOVER_LOT_NAME })

		const written = runHandover({
			argv: [lotsPath, '--out', folder],
			cliPath: STORE_WRITER_CLI,
			probe: noRepositoryCli,
		})

		expect(written.exitCode).toBe(0)
		expect(written.output).not.toMatch(CI_FIRST_REFUSAL)
	})
})
