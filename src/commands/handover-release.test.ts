/**
 * `handover write --release`: the lots file says `"release": true`, and the card of such a hand-over holds a required
 * `gate release` row read from the release record of the tree it commits (a hand-over not marked has no such row).
 */
import { readFileSync, writeFileSync } from 'node:fs'

import { gitPathOf, readRecordFile } from '../../test/gate-records.ts'
import { RELEASE_RECORD_FILE } from '../../test/scoped-gate-package.constants.ts'
import { createScopedStep } from '../../test/scoped-gate-package.ts'
import {
	cardOf,
	createScopedLotPackageOfOneStep,
	gateLineOf,
	scopedHookScript,
	writeLotsHandover,
} from '../../test/scoped-handover.ts'
import {
	createFailsOnReleaseStep,
	createScopedHookedPackage,
} from '../../test/scoped-hook-package.ts'
import { READ_LOT, SCRATCH_REPOSITORY_TIMEOUT } from '../../test/scratch-checks.constants.ts'
import {
	countingStep,
	createCounter,
	createHookedPackage,
	editReadLot,
	runGateIn,
} from '../../test/scratch-checks.ts'
import { removeCheckStore } from '../../test/scratch-contrib.ts'
import { writeFiles } from '../../test/scratch-repository.ts'

import { describe, expect, it } from 'vitest'

import type { GateRecord } from '../lib/gate-records/gate-records.types.ts'

const RELEASE_ROW = 'gate release'
const RELEASE_ARGV = ['--json', '--release']

/** The release row of the card written for the scratch lot with `argv`. */
function releaseRowOf(params: { root: string; argv: string[]; branch?: string }) {
	const { result } = writeLotsHandover({
		root: params.root,
		lots: [READ_LOT],
		argv: params.argv,
		branch: params.branch,
	})
	const card = cardOf(result)
	return { card, line: gateLineOf({ gates: card.gates, name: RELEASE_ROW }) }
}

/** A scoped package with its lot edited and a green `gate --release` of it. */
async function releasedPackage() {
	const { root } = createScopedLotPackageOfOneStep({ hookCounter: createCounter() })
	editReadLot(root)
	const releaseGate = await runGateIn({ cwd: root, argv: ['--release'] })
	expect(releaseGate.exitCode).toBe(0)
	return root
}

describe('handover write --release', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('the lots file holds "release": true', () => {
		const { root } = createScopedLotPackageOfOneStep({ hookCounter: createCounter() })
		editReadLot(root)

		const { lotsPath, result } = writeLotsHandover({
			root,
			lots: [READ_LOT],
			argv: RELEASE_ARGV,
		})

		expect(result.exitCode).toBe(0)
		expect(JSON.parse(readFileSync(lotsPath, 'utf8'))).toMatchObject({ release: true })
	})

	it('without --release the lots file holds no release mark', () => {
		const { root } = createScopedLotPackageOfOneStep({ hookCounter: createCounter() })
		editReadLot(root)

		const { lotsPath, result } = writeLotsHandover({ root, lots: [READ_LOT], argv: ['--json'] })

		expect(result.exitCode).toBe(0)
		expect(JSON.parse(readFileSync(lotsPath, 'utf8'))).not.toHaveProperty('release')
	})
})

describe('the card of a release hand-over', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('no release record → ✗ gate release, never run on this tree; the card blocks', () => {
		const { root } = createScopedLotPackageOfOneStep({ hookCounter: createCounter() })
		editReadLot(root)

		const { card, line } = releaseRowOf({ root, argv: RELEASE_ARGV })

		expect(line).toEqual({
			name: RELEASE_ROW,
			status: 'failed',
			detail: 'never run on this tree',
		})
		expect(card.failedGates).toContain(RELEASE_ROW)
		expect(card.verdict).toBe('BLOCKED')
	})

	it('a green gate --release of the tree the hand-over commits → ✓ gate release, not stale, nothing blocks on it', async () => {
		const root = await releasedPackage()

		const { card, line } = releaseRowOf({ root, argv: RELEASE_ARGV })

		expect(line).toEqual({ name: RELEASE_ROW, status: 'passed', detail: 'green on this tree' })
		expect(card.failedGates).not.toContain(RELEASE_ROW)
		expect(card.otherTreeGates).not.toContain(RELEASE_ROW)
	})

	it('a green gate --release of the same tree whose release command changed since (its key no longer matches) → ✗ gate release, never run on this tree', async () => {
		const root = await releasedPackage()
		removeCheckStore(root)
		const record = readRecordFile<GateRecord>({ root, name: RELEASE_RECORD_FILE })
		writeFileSync(
			gitPathOf({ root, name: RELEASE_RECORD_FILE }),
			JSON.stringify({ ...record, key: { ...record?.key, commandHash: '0'.repeat(64) } }),
		)

		const { card, line } = releaseRowOf({ root, argv: RELEASE_ARGV })

		expect(line).toEqual({
			name: RELEASE_ROW,
			status: 'failed',
			detail: 'never run on this tree',
		})
		expect(card.verdict).toBe('BLOCKED')
	})

	it('a release hand-over whose only proof is a green gate --release that covers full → the ordinary lines are green, gate release ✓, the card is not blocked', async () => {
		const root = await releasedPackage()

		const { card, line } = releaseRowOf({ root, argv: RELEASE_ARGV })

		expect(gateLineOf({ gates: card.gates, name: 'scoped' })).toMatchObject({ status: 'passed' })
		expect(gateLineOf({ gates: card.gates, name: 'gate' })).toBeUndefined()
		expect(line).toMatchObject({ name: RELEASE_ROW, status: 'passed' })
		expect(card.failedGates).toEqual([])
		expect(card.otherTreeGates).toEqual([])
		expect(card.verdict).toBe('READY')
	})

	it('an ordinary hand-over whose only proof is a green gate --release that covers full → the ordinary lines are green, no gate release row', async () => {
		const root = await releasedPackage()

		const { card, line } = releaseRowOf({ root, argv: ['--json'] })

		expect(gateLineOf({ gates: card.gates, name: 'scoped' })).toMatchObject({ status: 'passed' })
		expect(line).toBeUndefined()
		expect(card.failedGates).toEqual([])
		expect(card.verdict).toBe('READY')
	})

	it('an ordinary hand-over whose only record is a green gate --release that does not cover full → the gate never ran on this tree', async () => {
		const scoped = createScopedStep()
		const plain = countingStep({ counter: createCounter() })
		const root = createScopedHookedPackage({
			gate: { fast: [plain], full: [plain, scoped.step], release: [plain] },
			hookScript: scopedHookScript(createCounter()),
			onFeatureBranch: true,
		})
		editReadLot(root)
		const releaseGate = await runGateIn({ cwd: root, argv: ['--release'] })
		expect(releaseGate.exitCode).toBe(0)

		const { card } = releaseRowOf({ root, argv: ['--json'] })

		expect(gateLineOf({ gates: card.gates, name: 'gate' })).toMatchObject({
			status: 'failed',
			detail: 'never run on this tree',
		})
	})

	it('a green gate --release of a list that does not cover full → still ✓: the row asks whether the release ran on this tree', async () => {
		const scoped = createScopedStep()
		const plain = countingStep({ counter: createCounter() })
		const root = createScopedHookedPackage({
			gate: { fast: [plain], full: [plain, scoped.step], release: [plain] },
			hookScript: scopedHookScript(createCounter()),
			onFeatureBranch: true,
		})
		editReadLot(root)
		const releaseGate = await runGateIn({ cwd: root, argv: ['--release'] })
		expect(releaseGate.exitCode).toBe(0)

		const { line } = releaseRowOf({ root, argv: RELEASE_ARGV })

		expect(line).toEqual({ name: RELEASE_ROW, status: 'passed', detail: 'green on this tree' })
	})

	it('a gate --release of another tree (the source changed after it) → stale: the row is a warning marked stale, the card blocks', async () => {
		const root = await releasedPackage()
		writeFiles({ root, files: { 'src/read.ts': 'export function read() {\n\treturn 2\n}\n' } })

		const { card, line } = releaseRowOf({ root, argv: RELEASE_ARGV })

		expect(line).toMatchObject({ name: RELEASE_ROW, status: 'warning', stale: true })
		expect(line?.detail).toContain('the tree changed since')
		expect(card.verdict).toBe('BLOCKED')
	})

	it('a failed gate --release of the tree → ✗ gate release, the card blocks', async () => {
		const failsOnRelease = createFailsOnReleaseStep()
		const root = createScopedHookedPackage({
			gate: { fast: [failsOnRelease.step], full: [failsOnRelease.step] },
			hookScript: scopedHookScript(createCounter()),
			onFeatureBranch: true,
		})
		editReadLot(root)
		const releaseGate = await runGateIn({ cwd: root, argv: ['--release'] })
		expect(releaseGate.exitCode).toBe(1)

		const { card, line } = releaseRowOf({ root, argv: RELEASE_ARGV })

		expect(line).toMatchObject({ name: RELEASE_ROW, status: 'failed' })
		expect(card.verdict).toBe('BLOCKED')
	})

	it('a hand-over not marked release has no gate release row, even with a green release record', async () => {
		const root = await releasedPackage()

		const { card } = releaseRowOf({ root, argv: ['--json'] })

		expect(card.gates.map((line) => line.name)).not.toContain(RELEASE_ROW)
	})
})

describe(
	'the card of a release hand-over: a package without a scoped step',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it('a green gate --release of the tree → ✓ gate release, green on this tree', async () => {
			const root = createHookedPackage({
				hookCounter: createCounter(),
				gateCounter: createCounter(),
			})
			editReadLot(root)
			const releaseGate = await runGateIn({ cwd: root, argv: ['--release'] })
			expect(releaseGate.exitCode).toBe(0)

			const { line } = releaseRowOf({ root, argv: RELEASE_ARGV, branch: 'main' })

			expect(line).toEqual({ name: RELEASE_ROW, status: 'passed', detail: 'green on this tree' })
		})

		it('no release record → ✗ gate release, never run on this tree', () => {
			const root = createHookedPackage({
				hookCounter: createCounter(),
				gateCounter: createCounter(),
			})
			editReadLot(root)

			const { line } = releaseRowOf({ root, argv: RELEASE_ARGV, branch: 'main' })

			expect(line).toEqual({
				name: RELEASE_ROW,
				status: 'failed',
				detail: 'never run on this tree',
			})
		})
	},
)
