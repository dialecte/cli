import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { deadPid } from '../../../test/dead-pid.ts'
import {
	declaredRepositoryWithOtherPackage,
	onBranch,
	startedAt,
} from '../../../test/mutation-hooks.ts'
import {
	latestReportedRefusal,
	mutationPackage,
	olderAndLatestReportedRuns,
	runFiles,
	storeFileTexts,
	storedReportedRun,
	survivorOf,
} from '../../../test/mutation-package.ts'
import { SCRATCH_REPOSITORY_TIMEOUT } from '../../../test/scratch-checks.constants.ts'
import { commonGitDirOf } from '../../../test/scratch-tree.ts'
import { dropRun } from './drop-run.ts'
import { readLedger } from './ledger.ts'
import {
	MUTATION_LEDGER_LOCK_FILE,
	MUTATION_RUNS_FOLDER,
	MUTATION_STORE_FOLDER,
} from './mutation.constants.ts'
import { abandonRun, finishRun, readRuns, startRun } from './run-store.ts'

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

/** An older reported run (a newer one of its branch reported), both taken in by a ledger reader. */
function appliedRun(root: string): string {
	const { older } = olderAndLatestReportedRuns(root)
	expect(Object.keys(readLedger({ root }))).toHaveLength(2)
	return older
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
		['an older reported run the ledger has taken in', appliedRun],
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

	it('a died run → refused naming abandon, its file kept, the ledger and applied runs untouched', () => {
		const root = mutationPackage()
		const runId = diedRun(root)
		const before = storeFileTexts(root)

		expect(dropRun({ root, runId })).toMatchObject({
			ok: false,
			reason: expect.stringMatching(/mutants abandon/),
		})
		expect(existsSync(runFileOf({ root, runId }))).toBe(true)
		expect(storeFileTexts(root)).toEqual(before)
	})

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
		it('an older reported run no ledger reader took in → removed: the drop takes it in under the lock first, the ledger then holds its survivors', () => {
			const root = mutationPackage()
			const { older, latest } = olderAndLatestReportedRuns(root)
			expect(storeFileTexts(root).applied).toBeUndefined()

			expect(dropRun({ root, runId: older })).toEqual({ ok: true })
			expect(existsSync(runFileOf({ root, runId: older }))).toBe(false)
			expect(existsSync(runFileOf({ root, runId: latest }))).toBe(true)

			const folded = storeFileTexts(root)
			expect(Object.keys(readLedger({ root })).sort()).toEqual(['demo-pkg::k1', 'demo-pkg::k2'])
			expect(folded.applied).toContain(older)
			expect(folded.applied).toContain(latest)
			expect(storeFileTexts(root)).toEqual(folded)
		})

		it('a lone reported run no ledger reader took in → refused as the latest of its branch, its file kept', () => {
			const root = mutationPackage()
			const runId = unappliedRun(root)

			expect(dropRun({ root, runId })).toEqual({
				ok: false,
				reason: latestReportedRefusal({ runId, branch: 'main' }),
			})
			expect(existsSync(runFileOf({ root, runId }))).toBe(true)
		})
	},
)

describe(
	'dropRun: the latest reported run of a branch is its evidence',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it('the latest reported run (taken in or not) → refused with the evidence wording, every run file kept', () => {
			const root = mutationPackage()
			const { latest } = olderAndLatestReportedRuns(root)
			const before = runFiles(root)

			expect(dropRun({ root, runId: latest })).toEqual({
				ok: false,
				reason: latestReportedRefusal({ runId: latest, branch: 'main' }),
			})
			expect(runFiles(root)).toEqual(before)
			expect(dropRun({ root, runId: latest })).toMatchObject({ ok: false })
			expect(runFiles(root)).toEqual(before)
		})

		it('two runs started together → the one that finished last is the latest, the other drops', () => {
			const root = mutationPackage()
			const first = storedReportedRun({
				root,
				startedAt: '2026-11-02T10:00:00.000Z',
				finishedAt: '2026-11-02T10:05:00.000Z',
				survivors: [survivorOf({ key: 'k1' })],
			})
			const second = storedReportedRun({
				root,
				startedAt: '2026-11-02T10:00:00.000Z',
				finishedAt: '2026-11-02T10:06:00.000Z',
				survivors: [survivorOf({ key: 'k2', line: 5 })],
			})

			expect(dropRun({ root, runId: second.runId })).toMatchObject({ ok: false })
			expect(dropRun({ root, runId: first.runId })).toEqual({ ok: true })
		})

		it('a newer run of the branch that is running, died or abandoned → the reported run stays refused', () => {
			const root = mutationPackage()
			const reported = unappliedRun(root)
			diedRun(root)
			abandonedRun(root)
			startRun({
				root,
				pid: process.pid,
				lot: 'lot-a',
				tree: TREE,
				mode: 'changed',
				now: new Date('2026-11-02T12:00:00.000Z'),
			})

			expect(dropRun({ root, runId: reported })).toMatchObject({
				ok: false,
				reason: latestReportedRefusal({ runId: reported, branch: 'main' }),
			})
			expect(existsSync(runFileOf({ root, runId: reported }))).toBe(true)
		})

		it('a newer reported run of another branch → the reported run stays refused', () => {
			const root = mutationPackage()
			const reported = unappliedRun(root)
			onBranch({
				root,
				branch: 'feat/other',
				work: () =>
					storedReportedRun({
						root,
						startedAt: '2026-11-02T12:00:00.000Z',
						survivors: [survivorOf({ key: 'k9' })],
					}),
			})

			expect(dropRun({ root, runId: reported })).toMatchObject({
				ok: false,
				reason: latestReportedRefusal({ runId: reported, branch: 'main' }),
			})
		})

		it('a newer reported run of another package on the same branch name → the reported run stays refused', () => {
			const { root, other } = declaredRepositoryWithOtherPackage()
			const reported = unappliedRun(root)
			const { runId } = startRun({
				root: other,
				pid: process.pid,
				lot: 'lot-a',
				tree: TREE,
				mode: 'changed',
				now: new Date('2026-11-02T12:00:00.000Z'),
			})
			finishRun({
				root: other,
				runId,
				counts: { killed: 1, survived: 0, timedOut: 0, noCoverage: 0 },
				survivors: [],
				now: new Date('2026-11-02T12:05:00.000Z'),
			})

			expect(dropRun({ root, runId: reported })).toMatchObject({
				ok: false,
				reason: latestReportedRefusal({ runId: reported, branch: 'main' }),
			})
		})

		it('an older reported run of the branch, with a newer one died → removed', () => {
			const root = mutationPackage()
			const { older } = olderAndLatestReportedRuns(root)
			diedRun(root)

			expect(dropRun({ root, runId: older })).toEqual({ ok: true })
		})
	},
)

describe(
	'dropRun: the decision and the removal are one step under the ledger lock',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it('a run reports between the decision and the removal → the dropped run is the older one, the new run and the latest stay, the next reader takes the new run in', () => {
			const root = mutationPackage()
			const { older, latest } = olderAndLatestReportedRuns(root)
			expect(Object.keys(readLedger({ root }))).toHaveLength(2)
			let between = ''

			expect(
				dropRun({
					root,
					runId: older,
					afterDecision() {
						expect(
							existsSync(
								join(commonGitDirOf(root), MUTATION_STORE_FOLDER, MUTATION_LEDGER_LOCK_FILE),
							),
						).toBe(true)
						between = storedReportedRun({
							root,
							startedAt: startedAt(20).toISOString(),
							survivors: [survivorOf({ key: 'k3', line: 6 })],
						}).runId
					},
				}),
			).toEqual({ ok: true })

			expect(between).not.toBe('')
			expect(existsSync(runFileOf({ root, runId: older }))).toBe(false)
			expect(existsSync(runFileOf({ root, runId: latest }))).toBe(true)
			expect(existsSync(runFileOf({ root, runId: between }))).toBe(true)
			expect(Object.keys(readLedger({ root })).sort()).toEqual([
				'demo-pkg::k1',
				'demo-pkg::k2',
				'demo-pkg::k3',
			])
		})

		it('a refused drop never calls afterDecision and removes nothing', () => {
			const root = mutationPackage()
			const { latest } = olderAndLatestReportedRuns(root)
			const before = runFiles(root)
			let calls = 0

			expect(
				dropRun({
					root,
					runId: latest,
					afterDecision() {
						calls += 1
					},
				}),
			).toMatchObject({ ok: false })
			expect(calls).toBe(0)
			expect(runFiles(root)).toEqual(before)
		})
	},
)
