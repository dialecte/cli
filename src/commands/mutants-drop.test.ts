import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { deadPid } from '../../test/dead-pid.ts'
import {
	mutationPackage,
	parsedOutput,
	runMutantsIn,
	storeFileTexts,
	storedReportedRun,
	survivorOf,
} from '../../test/mutation-package.ts'
import { SCRATCH_REPOSITORY_TIMEOUT } from '../../test/scratch-checks.constants.ts'
import { commonGitDirOf } from '../../test/scratch-tree.ts'
import { readLedger } from '../lib/mutation/ledger.ts'
import { MUTATION_RUNS_FOLDER, MUTATION_STORE_FOLDER } from '../lib/mutation/mutation.constants.ts'
import { abandonRun, startRun } from '../lib/mutation/run-store.ts'

import { describe, expect, it } from 'vitest'

const TREE = 'c'.repeat(40)

function runFileOf(params: { root: string; runId: string }): string {
	return join(
		commonGitDirOf(params.root),
		MUTATION_STORE_FOLDER,
		MUTATION_RUNS_FOLDER,
		`${params.runId}.json`,
	)
}

/** An abandoned run (it died, then was abandoned). */
function abandoned(root: string): string {
	const { runId } = startRun({ root, pid: deadPid(), lot: 'lot-a', tree: TREE, mode: 'changed' })
	expect(abandonRun({ root, runId })).toEqual({ ok: true })
	return runId
}

/** A reported run no ledger reader has taken in. */
function unapplied(root: string): string {
	return storedReportedRun({
		root,
		startedAt: '2026-11-02T10:00:00.000Z',
		survivors: [survivorOf({ key: 'k1' })],
	}).runId
}

describe('mutants drop', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('an abandoned run → exit 0, "mutants drop: run <id> removed", its file gone', async () => {
		const root = mutationPackage()
		const runId = abandoned(root)

		await expect(runMutantsIn({ root, argv: ['drop', runId] })).resolves.toEqual({
			exitCode: 0,
			output: `mutants drop: run ${runId} removed`,
		})
		expect(existsSync(runFileOf({ root, runId }))).toBe(false)
	})

	it('a reported run the ledger took in → removed, the ledger bytes unchanged', async () => {
		const root = mutationPackage()
		const runId = unapplied(root)
		expect(Object.keys(readLedger({ root }))).toHaveLength(1)
		const before = storeFileTexts(root)

		await expect(runMutantsIn({ root, argv: ['drop', runId] })).resolves.toMatchObject({
			exitCode: 0,
		})
		expect(existsSync(runFileOf({ root, runId }))).toBe(false)
		expect(storeFileTexts(root)).toEqual(before)
	})

	it('a reported run the ledger has not taken in → exit 1 saying so, the file kept', async () => {
		const root = mutationPackage()
		const runId = unapplied(root)

		await expect(runMutantsIn({ root, argv: ['drop', runId] })).resolves.toMatchObject({
			exitCode: 1,
			output: expect.stringMatching(/not yet taken into the ledger/),
		})
		expect(existsSync(runFileOf({ root, runId }))).toBe(true)
	})

	it('a running run → exit 1, the file kept', async () => {
		const root = mutationPackage()
		const { runId } = startRun({
			root,
			pid: process.pid,
			lot: 'lot-a',
			tree: TREE,
			mode: 'changed',
		})

		await expect(runMutantsIn({ root, argv: ['drop', runId] })).resolves.toMatchObject({
			exitCode: 1,
			output: expect.stringContaining(runId),
		})
		expect(existsSync(runFileOf({ root, runId }))).toBe(true)
	})

	it('a died run → exit 1 naming abandon, the file kept', async () => {
		const root = mutationPackage()
		const { runId } = startRun({ root, pid: deadPid(), lot: 'lot-a', tree: TREE, mode: 'changed' })

		await expect(runMutantsIn({ root, argv: ['drop', runId] })).resolves.toMatchObject({
			exitCode: 1,
			output: expect.stringContaining(`dialecte mutants abandon ${runId}`),
		})
		expect(existsSync(runFileOf({ root, runId }))).toBe(true)
	})

	it('an unknown run id → exit 1 naming it', async () => {
		await expect(
			runMutantsIn({ root: mutationPackage(), argv: ['drop', 'no-such-run'] }),
		).resolves.toMatchObject({ exitCode: 1, output: expect.stringContaining('no-such-run') })
	})

	it.each([
		['no run id', ['drop']],
		['two run ids', ['drop', 'a', 'b']],
		['an unknown option', ['drop', '--bogus', 'a']],
	])('%s → usage, exit 2', async (_label, argv) => {
		await expect(runMutantsIn({ root: mutationPackage(), argv })).resolves.toMatchObject({
			exitCode: 2,
			output: expect.stringContaining('mutants drop'),
		})
	})

	it('--json → { verb, ok, runId }, exactly one JSON object', async () => {
		const root = mutationPackage()
		const runId = abandoned(root)

		await expect(
			runMutantsIn({ root, argv: ['drop', runId, '--json'] }).then(({ exitCode, output }) => ({
				exitCode,
				json: parsedOutput(output),
			})),
		).resolves.toEqual({ exitCode: 0, json: { verb: 'drop', ok: true, runId } })
	})

	it('--json with a usage error → one JSON object, ok false, exit 2', async () => {
		await expect(
			runMutantsIn({ root: mutationPackage(), argv: ['drop', '--json'] }).then(
				({ exitCode, output }) => ({ exitCode, json: parsedOutput(output) }),
			),
		).resolves.toMatchObject({
			exitCode: 2,
			json: { verb: 'drop', ok: false, reason: expect.any(String) },
		})
	})

	it('--json refused → { verb, ok: false, reason }, exit 1', async () => {
		await expect(
			runMutantsIn({ root: mutationPackage(), argv: ['drop', 'no-such-run', '--json'] }).then(
				({ exitCode, output }) => ({ exitCode, json: parsedOutput(output) }),
			),
		).resolves.toMatchObject({
			exitCode: 1,
			json: { verb: 'drop', ok: false, reason: expect.stringContaining('no-such-run') },
		})
	})
})
