import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { deadPid } from '../../../test/dead-pid.ts'
import {
	mutationPackage,
	runFiles,
	storeFileTexts,
	storedReportedRun,
	survivorOf,
} from '../../../test/mutation-package.ts'
import { SCRATCH_REPOSITORY_TIMEOUT } from '../../../test/scratch-checks.constants.ts'
import { commonGitDirOf } from '../../../test/scratch-tree.ts'
import { dropRun } from './drop-run.ts'
import { readLedger } from './ledger.ts'
import { MUTATION_RUNS_FOLDER, MUTATION_STORE_FOLDER } from './mutation.constants.ts'
import { abandonRun, readRuns, startRun } from './run-store.ts'

import { describe, expect, it } from 'vitest'

const TREE = 'c'.repeat(40)
const STARTED = '2026-11-02T10:00:00.000Z'

function runFileOf(params: { root: string; runId: string }): string {
	return join(
		commonGitDirOf(params.root),
		MUTATION_STORE_FOLDER,
		MUTATION_RUNS_FOLDER,
		`${params.runId}.json`,
	)
}

/** A run whose owner is gone, still marked running: it reads as died. */
function diedRun(root: string): string {
	return startRun({ root, pid: deadPid(), lot: 'lot-a', tree: TREE, mode: 'changed' }).runId
}

/** A run of this very process, marked running: its owner is alive. */
function runningRun(root: string): string {
	return startRun({ root, pid: process.pid, lot: 'lot-a', tree: TREE, mode: 'changed' }).runId
}

/** A reported run no ledger reader has taken in. */
function unappliedRun(root: string): string {
	return storedReportedRun({ root, startedAt: STARTED, survivors: [survivorOf({ key: 'k1' })] })
		.runId
}

/** A reported run a ledger reader took in. */
function appliedRun(root: string): string {
	const { runId } = storedReportedRun({
		root,
		startedAt: STARTED,
		survivors: [survivorOf({ key: 'k1' })],
	})
	expect(Object.keys(readLedger({ root }))).toHaveLength(1)
	return runId
}

/** A run abandoned after it died. */
function abandonedRun(root: string): string {
	const runId = diedRun(root)
	expect(abandonRun({ root, runId })).toEqual({ ok: true })
	return runId
}

describe('dropRun: the runs it removes', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it.each([
		['an abandoned run', abandonedRun],
		['a reported run the ledger has taken in', appliedRun],
	])(
		'%s → removed: its file gone, readRuns no longer lists it, the ledger and applied runs untouched',
		(_label, make) => {
			const root = mutationPackage()
			const runId = make(root)
			const before = storeFileTexts(root)

			expect(dropRun({ root, runId })).toEqual({ ok: true })
			expect(existsSync(runFileOf({ root, runId }))).toBe(false)
			expect(readRuns({ root }).map((run) => run.runId)).not.toContain(runId)
			expect(storeFileTexts(root)).toEqual(before)
		},
	)

	it('only the run it names is removed', () => {
		const root = mutationPackage()
		const kept = unappliedRun(root)
		const dropped = abandonedRun(root)

		expect(dropRun({ root, runId: dropped })).toEqual({ ok: true })
		expect(runFiles(root)).toEqual([`${kept}.json`])
	})
})

describe('dropRun: the runs it refuses', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('a running run (its owner is alive) → refused naming it, its file kept, the ledger and applied runs untouched', () => {
		const root = mutationPackage()
		const runId = runningRun(root)
		const before = storeFileTexts(root)

		expect(dropRun({ root, runId })).toMatchObject({
			ok: false,
			reason: expect.stringContaining(runId),
		})
		expect(existsSync(runFileOf({ root, runId }))).toBe(true)
		expect(storeFileTexts(root)).toEqual(before)
	})

	it.each([
		['a died run', diedRun, /mutants abandon/],
		['a reported run the ledger has not taken in', unappliedRun, /not yet taken into the ledger/],
	])(
		'%s → refused, its file kept, the ledger and applied runs untouched',
		(_label, make, reason) => {
			const root = mutationPackage()
			const runId = make(root)
			const before = storeFileTexts(root)

			expect(dropRun({ root, runId })).toMatchObject({
				ok: false,
				reason: expect.stringMatching(reason),
			})
			expect(existsSync(runFileOf({ root, runId }))).toBe(true)
			expect(storeFileTexts(root)).toEqual(before)
		},
	)

	it('a died run → the refusal names the abandon command for that run', () => {
		const root = mutationPackage()
		const runId = diedRun(root)

		expect(dropRun({ root, runId })).toMatchObject({
			ok: false,
			reason: expect.stringContaining(`dialecte mutants abandon ${runId}`),
		})
	})

	it('a run id the store does not hold → refused, naming it', () => {
		const root = mutationPackage()

		expect(dropRun({ root, runId: 'no-such-run' })).toMatchObject({
			ok: false,
			reason: expect.stringContaining('no-such-run'),
		})
	})

	it.each([
		['a slash', 'runs/other'],
		['a parent folder', '../ledger'],
		['a bare parent', '..'],
		['a backslash', '..\\ledger'],
	])('a run id holding %s → refused, nothing outside the runs folder removed', (_label, runId) => {
		const root = mutationPackage()
		appliedRun(root)
		const before = storeFileTexts(root)

		expect(dropRun({ root, runId })).toMatchObject({ ok: false })
		expect(storeFileTexts(root)).toEqual(before)
		expect(before.ledger).toBeDefined()
	})

	it.each([
		['a run entry one folder above the runs folder', '../escaped', 'escaped.json'],
		['a run entry in a sub-folder of the runs folder', 'sub/x', 'runs/sub/x.json'],
	])('%s → refused, the planted file still there', (_label, runId, planted) => {
		const root = mutationPackage()
		const store = join(commonGitDirOf(root), MUTATION_STORE_FOLDER)
		const path = join(store, planted)
		mkdirSync(dirname(path), { recursive: true })
		writeFileSync(
			path,
			JSON.stringify({ runId: 'planted', pid: 1, startedAt: STARTED, state: 'abandoned' }),
		)

		expect(dropRun({ root, runId })).toMatchObject({ ok: false })
		expect(existsSync(path)).toBe(true)
	})

	it('a died run, then abandoned → can be dropped (abandon first, as the refusal says)', () => {
		const root = mutationPackage()
		const runId = diedRun(root)
		expect(abandonRun({ root, runId })).toEqual({ ok: true })

		expect(dropRun({ root, runId })).toEqual({ ok: true })
	})
})

describe(
	'dropRun: a reported run and its own fold',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it('before any ledger reader took it in → refused and the entry stays; after a reader took it in → removed; the ledger bytes are the same before and after the drop', () => {
			const root = mutationPackage()
			const { runId } = storedReportedRun({
				root,
				startedAt: STARTED,
				survivors: [survivorOf({ key: 'k1' })],
			})

			expect(dropRun({ root, runId })).toMatchObject({
				ok: false,
				reason: expect.stringMatching(/not yet taken into the ledger/),
			})
			expect(existsSync(runFileOf({ root, runId }))).toBe(true)

			expect(Object.keys(readLedger({ root }))).toHaveLength(1)
			const folded = storeFileTexts(root)

			expect(dropRun({ root, runId })).toEqual({ ok: true })
			expect(existsSync(runFileOf({ root, runId }))).toBe(false)
			expect(storeFileTexts(root)).toEqual(folded)
			expect(folded.ledger).toContain('k1')
			expect(folded.applied).toContain(runId)
		})
	},
)
