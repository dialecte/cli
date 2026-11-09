/**
 * `handover run --rehearse` on a package with a scoped gate step: the plan reads the records at the hand-over's base
 * (a record of another base is rehearsed, `the base moved`, A3, A4b, A4c), a green covering release record answers a
 * plain and a merge lot (A18), a failed or non-covering one answers nothing (A17, A18b), and a package without a
 * scoped step keeps today's reasons.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { createScopedStep } from '../../test/scoped-gate-package.ts'
import {
	createBranchThatMergedMain,
	createScopedBranch,
	createScopedLotPackageOfOneStep,
	mergeTreeOf,
	moveBaseBranch,
	scopedHookScript,
	storeHookRecordAt,
	writeLotsHandover,
} from '../../test/scoped-handover.ts'
import {
	createFailsOnReleaseStep,
	createScopedHookedPackage,
} from '../../test/scoped-hook-package.ts'
import {
	BRANCH_NAME,
	READ_LOT,
	SCRATCH_REPOSITORY_TIMEOUT,
	SHORT_SHA_LENGTH,
} from '../../test/scratch-checks.constants.ts'
import {
	countRuns,
	countingStep,
	createCounter,
	createHookedPackage,
	editReadLot,
	lotLine,
	runFolder,
	runGateIn,
	seedFullGate,
	writeHandoverFolder,
	writeMergeHandover,
} from '../../test/scratch-checks.ts'
import { git } from '../../test/scratch-repository.ts'
import { treeOfWorkingFiles } from '../../test/scratch-tree.ts'
import { readTreeRecords, storeCheckRecord } from '../lib/gate-records/check-store.ts'

import { describe, expect, it } from 'vitest'

const SKIPPED_LINE = "rehearsal skipped: every lot's tree has a green record"

function short(sha: string): string {
	return sha.slice(0, SHORT_SHA_LENGTH)
}

/** The decision of each lot as `rehearsal.json` holds it. */
function readDecisions(out: string): Record<string, unknown>[] {
	return JSON.parse(readFileSync(join(out, 'rehearsal.json'), 'utf8')).lots
}

/** The base moved, as the rehearsal says it: the record's base, the hand-over's. */
function baseMovedReason(params: { record: string; handover: string }): string {
	return `the base moved: record ${short(params.record)}, hand-over ${short(params.handover)}`
}

describe(
	'handover run --rehearse: a plain lot, a scoped package',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it('a green gate --full of the tree at the hand-over base → reused: the reuse line, the skipped line, no clone, the hook not run', async () => {
			const hookCounter = createCounter()
			const { root } = createScopedLotPackageOfOneStep({ hookCounter })
			editReadLot(root)
			await seedFullGate(root)
			const tree = treeOfWorkingFiles(root)
			const { out } = writeLotsHandover({ root, lots: [READ_LOT] })

			const result = await runFolder({ out, argv: ['--rehearse'] })

			expect(result.exitCode).toBe(0)
			expect(result.text).toContain(
				lotLine({
					index: 1,
					count: 1,
					decision: 'reused',
					reason: `green gate --full on tree ${short(tree)}`,
				}),
			)
			expect(result.text).toContain(SKIPPED_LINE)
			expect(result.rehearsalFolders).toEqual([])
			expect(countRuns(hookCounter)).toBe(0)
		})

		it('A3: the gate --full is of another base (the base branch moved and was merged, the tree is the same) → rehearsed: the base moved, both bases; a clone, the hook runs once', async () => {
			const hookCounter = createCounter()
			const { root } = createScopedLotPackageOfOneStep({ hookCounter })
			editReadLot(root)
			await seedFullGate(root)
			const recordBase = git({ root, args: ['rev-parse', 'main'] }).trim()
			const handoverBase = moveBaseBranch(root)
			const { out } = writeLotsHandover({ root, lots: [READ_LOT] })

			const result = await runFolder({ out, argv: ['--rehearse'] })

			expect(result.exitCode).toBe(0)
			expect(result.text).toContain(
				lotLine({
					index: 1,
					count: 1,
					decision: 'rehearse',
					reason: baseMovedReason({ record: recordBase, handover: handoverBase }),
				}),
			)
			expect(result.text).not.toContain(SKIPPED_LINE)
			expect(result.rehearsalFolders).toHaveLength(1)
			expect(countRuns(hookCounter)).toBe(1)
			expect(readDecisions(out)).toEqual([
				expect.objectContaining({ lot: 1, decision: 'rehearsed' }),
			])
		})

		it('A18: no gate --full, a green gate --release of the tree (its list covers full) → reused with the release record: no clone, the hook not run', async () => {
			const hookCounter = createCounter()
			const { root } = createScopedLotPackageOfOneStep({ hookCounter })
			editReadLot(root)
			const releaseGate = await runGateIn({ cwd: root, argv: ['--release'] })
			expect(releaseGate.exitCode).toBe(0)
			const tree = treeOfWorkingFiles(root)
			const { out } = writeLotsHandover({ root, lots: [READ_LOT] })

			const result = await runFolder({ out, argv: ['--rehearse'] })

			expect(result.exitCode).toBe(0)
			expect(result.text).toContain(
				lotLine({
					index: 1,
					count: 1,
					decision: 'reused',
					reason: `green gate --release on tree ${short(tree)}`,
				}),
			)
			expect(result.text).toContain(SKIPPED_LINE)
			expect(result.rehearsalFolders).toEqual([])
			expect(countRuns(hookCounter)).toBe(0)
			expect(readDecisions(out)).toEqual([
				expect.objectContaining({
					lot: 1,
					decision: 'reused',
					record: expect.objectContaining({ mode: 'release' }),
				}),
			])
		})

		it('A17: a failed gate --release newer than the green gate --full of the tree → the lot is still reused with the full record', async () => {
			const hookCounter = createCounter()
			const failsOnRelease = createFailsOnReleaseStep()
			const root = createScopedHookedPackage({
				gate: { fast: [failsOnRelease.step], full: [failsOnRelease.step] },
				hookScript: scopedHookScript(hookCounter),
				onFeatureBranch: true,
			})
			editReadLot(root)
			await seedFullGate(root)
			const releaseGate = await runGateIn({ cwd: root, argv: ['--release'] })
			expect(releaseGate.exitCode).toBe(1)
			const { out } = writeLotsHandover({ root, lots: [READ_LOT] })

			const result = await runFolder({ out, argv: ['--rehearse'] })

			expect(result.exitCode).toBe(0)
			expect(result.text).toContain(SKIPPED_LINE)
			expect(result.rehearsalFolders).toEqual([])
			expect(readDecisions(out)).toEqual([
				expect.objectContaining({
					lot: 1,
					decision: 'reused',
					record: expect.objectContaining({ mode: 'full' }),
				}),
			])
		})

		it('A18b: a green gate --release of a list that does not cover full (it leaves the scoped step out), no gate --full → rehearsed: no green gate --full', async () => {
			const hookCounter = createCounter()
			const scoped = createScopedStep()
			const plain = countingStep({ counter: createCounter() })
			const root = createScopedHookedPackage({
				gate: { fast: [plain], full: [plain, scoped.step], release: [plain] },
				hookScript: scopedHookScript(hookCounter),
				onFeatureBranch: true,
			})
			editReadLot(root)
			const releaseGate = await runGateIn({ cwd: root, argv: ['--release'] })
			expect(releaseGate.exitCode).toBe(0)
			const tree = treeOfWorkingFiles(root)
			const { out } = writeLotsHandover({ root, lots: [READ_LOT] })

			const result = await runFolder({ out, argv: ['--rehearse'] })

			expect(result.exitCode).toBe(0)
			expect(result.text).toContain(
				lotLine({
					index: 1,
					count: 1,
					decision: 'rehearse',
					reason: `no green gate --full on tree ${short(tree)}`,
				}),
			)
			expect(result.rehearsalFolders).toHaveLength(1)
			expect(countRuns(hookCounter)).toBe(1)
		})
	},
)

describe(
	'handover run --rehearse: a package without a scoped step',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it('a green gate --full record of the tree that holds a base of another commit → still reused, no base said: no base is read without a scoped step', async () => {
			const hookCounter = createCounter()
			const root = createHookedPackage({ hookCounter, gateCounter: createCounter() })
			editReadLot(root)
			await seedFullGate(root)
			const tree = treeOfWorkingFiles(root)
			const [stored] = readTreeRecords({ root, tree }).filter((record) => record.mode === 'full')
			storeCheckRecord({
				root,
				record: { ...stored, base: { commit: 'a'.repeat(40), source: 'base-branch' } },
			})
			const { out } = writeHandoverFolder({ root, lots: [READ_LOT] })

			const result = await runFolder({ out, argv: ['--rehearse'] })

			expect(result.exitCode).toBe(0)
			expect(result.text).toContain(
				lotLine({
					index: 1,
					count: 1,
					decision: 'reused',
					reason: `green gate --full on tree ${short(tree)}`,
				}),
			)
			expect(result.text).not.toContain('the base moved')
			expect(countRuns(hookCounter)).toBe(0)
		})
	},
)

describe(
	'handover run --rehearse: a merge lot, a scoped package',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it("the branch commit's hook record is of the base the hand-over has (main unchanged) → reused with the tip's record, no clone, the hook not run again", async () => {
			const hookCounter = createCounter()
			const { root, tip } = await createScopedBranch({ hookCounter, recorded: true })
			const runsBefore = countRuns(hookCounter)
			const { out } = writeMergeHandover({ root, tip })
			const tipTree = git({ root, args: ['rev-parse', `${tip}^{tree}`] }).trim()

			const result = await runFolder({ out, argv: ['--rehearse'] })

			expect(result.exitCode).toBe(0)
			expect(result.text).toContain(
				lotLine({
					index: 1,
					count: 1,
					decision: 'reused',
					reason: `green hook record of the tip's tree ${short(tipTree)}`,
				}),
			)
			expect(result.rehearsalFolders).toEqual([])
			expect(countRuns(hookCounter) - runsBefore).toBe(0)
		})

		it('A4b: a hook record of base B1, a merge lot of a hand-over at base B2 (main moved by an empty commit, the merge leaves the tip’s tree) → rehearsed: the base moved', async () => {
			const hookCounter = createCounter()
			const { root, tip, before, after } = await createScopedBranch({
				hookCounter,
				recorded: false,
				mainMoves: true,
			})
			storeHookRecordAt({
				root,
				tree: mergeTreeOf({ root, branch: BRANCH_NAME }),
				gateBase: before,
			})
			const runsBefore = countRuns(hookCounter)
			const { out } = writeMergeHandover({ root, tip })

			const result = await runFolder({ out, argv: ['--rehearse'] })

			expect(result.exitCode).toBe(0)
			expect(result.text).toContain(
				lotLine({
					index: 1,
					count: 1,
					decision: 'rehearse',
					reason: baseMovedReason({ record: before, handover: after }),
				}),
			)
			expect(result.rehearsalFolders).toHaveLength(1)
			expect(countRuns(hookCounter) - runsBefore).toBe(1)
		})

		it('A4c: the branch merged main in its own hand-over, then main merges it → the tip’s hook record holds the branch’s base, not main’s head: rehearsed with the base moved', async () => {
			const hookCounter = createCounter()
			const { root, tip, cut, moved } = await createBranchThatMergedMain({ hookCounter })
			const runsBefore = countRuns(hookCounter)
			const { out } = writeMergeHandover({ root, tip })

			const result = await runFolder({ out, argv: ['--rehearse'] })

			expect(result.exitCode).toBe(0)
			expect(result.text).toContain(
				lotLine({
					index: 1,
					count: 1,
					decision: 'rehearse',
					reason: baseMovedReason({ record: cut, handover: moved }),
				}),
			)
			expect(countRuns(hookCounter) - runsBefore).toBe(1)
		})

		it('A18: no hook record of the tip, a green covering gate --release of its tree → reused with the release record: no clone, the hook not run', async () => {
			const hookCounter = createCounter()
			const { root, tip } = await createScopedBranch({
				hookCounter,
				recorded: false,
				releaseOnTip: true,
			})
			const { out } = writeMergeHandover({ root, tip })
			const tipTree = git({ root, args: ['rev-parse', `${tip}^{tree}`] }).trim()

			const result = await runFolder({ out, argv: ['--rehearse'] })

			expect(result.exitCode).toBe(0)
			expect(result.text).toContain(
				lotLine({
					index: 1,
					count: 1,
					decision: 'reused',
					reason: `green gate --release on tree ${short(tipTree)}`,
				}),
			)
			expect(result.text).toContain(SKIPPED_LINE)
			expect(result.rehearsalFolders).toEqual([])
			expect(countRuns(hookCounter)).toBe(0)
			expect(readDecisions(out)).toEqual([
				expect.objectContaining({
					lot: 1,
					decision: 'reused',
					record: expect.objectContaining({ mode: 'release' }),
				}),
			])
		})
	},
)
