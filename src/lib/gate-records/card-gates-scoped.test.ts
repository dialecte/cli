/**
 * The hand-over card on a package with a scoped gate step: the scoped line's selection detail, the own records' base
 * check (current, older but current, the base moved), a hook record of another base left out (A4b), the invalid
 * config line, and a failed release record that changes nothing of an ordinary card (A17).
 */
import { writeFileSync } from 'node:fs'

import { gitPathOf, readRecordFile } from '../../../test/gate-records.ts'
import { show } from '../../../test/handover-store-scenario.ts'
import { TWO_LOTS } from '../../../test/scoped-handover.constants.ts'
import {
	cardOf,
	createScopedBranch,
	createScopedLotPackageOfOneStep,
	gateLineOf,
	mergeTreeOf,
	moveBaseBranch,
	readLotCard,
	rehashedCard,
	scopedHookScript,
	storeHookRecordAt,
	writeLotsHandover,
} from '../../../test/scoped-handover.ts'
import {
	createEmptySelectionStep,
	createFailsOnReleaseStep,
	createScopedHookedPackage,
} from '../../../test/scoped-hook-package.ts'
import {
	BRANCH_NAME,
	FULL_RECORD_FILE,
	READ_LOT,
	SCRATCH_REPOSITORY_TIMEOUT,
	SHORT_SHA_LENGTH,
} from '../../../test/scratch-checks.constants.ts'
import {
	createCounter,
	createHookedPackage,
	editReadLot,
	runFolder,
	runGateIn,
	seedFullGate,
} from '../../../test/scratch-checks.ts'
import { git } from '../../../test/scratch-repository.ts'
import { treeOfWorkingFiles } from '../../../test/scratch-tree.ts'
import { runRecap } from '../../commands/recap.ts'
import { validateGateConfig } from '../gate/gate-config.ts'
import { readJudgedCases } from './gate-records.ts'
import { computeStateTree, hashStateTree } from './state-hash.ts'

import { describe, expect, it } from 'vitest'

import type { GateRecord } from './gate-records.types.ts'

function short(sha: string): string {
	return sha.slice(0, SHORT_SHA_LENGTH)
}

/** The selection a card line holds (`--json`). */
function selectionOf(line: unknown): unknown {
	return (line as { selection?: unknown } | undefined)?.selection
}

/** The whole selection the `gate --full` record holds for its scoped step (base, tree, changed, ids, reasons, skipped). */
function recordedSelectionOf(root: string): unknown {
	const record = readRecordFile<GateRecord>({ root, name: FULL_RECORD_FILE })
	return record?.steps.find((step) => step.name === 'scoped')?.selection
}

const STALE_BASE_SUFFIX = ' (the base moved since)'

/** A scoped package on `feat/x` with its lot edited and a green `gate --full` of it; `main`'s head is the base. */
async function gatedPackage() {
	const { root, scoped } = createScopedLotPackageOfOneStep({ hookCounter: createCounter() })
	editReadLot(root)
	await seedFullGate(root)
	return { root, scoped, base: git({ root, args: ['rev-parse', 'main'] }).trim() }
}

describe('the card: a scoped step', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('the line says what it selected since the base, and --json holds the selection', async () => {
		const { root, base } = await gatedPackage()

		const card = readLotCard({ root })

		const line = gateLineOf({ gates: card.gates, name: 'scoped' })
		expect(line).toMatchObject({
			status: 'passed',
			detail: `4/4 · selected T0 since ${short(base)}`,
		})
		expect(selectionOf(line)).toEqual(recordedSelectionOf(root))
		expect(selectionOf(line)).toMatchObject({ base, ids: ['T0'] })
		expect(line?.stale).toBeUndefined()
	})

	it('an empty selection says nothing was selected and how many paths changed', async () => {
		const empty = createEmptySelectionStep()
		const root = createScopedHookedPackage({
			gate: { fast: [empty.step], full: [empty.step] },
			hookScript: scopedHookScript(createCounter()),
			onFeatureBranch: true,
		})
		editReadLot(root)
		await seedFullGate(root)
		const base = git({ root, args: ['rev-parse', 'main'] }).trim()
		const changed = git({
			root,
			args: ['diff', '--name-only', '-z', base, treeOfWorkingFiles(root)],
		})
			.split('\0')
			.filter(Boolean)

		const card = readLotCard({ root })

		expect(gateLineOf({ gates: card.gates, name: 'scoped' })).toMatchObject({
			status: 'passed',
			detail: `nothing selected since ${short(base)} (${changed.length} paths)`,
		})
		expect(selectionOf(gateLineOf({ gates: card.gates, name: 'scoped' }))).toEqual(
			recordedSelectionOf(root),
		)
	})

	it('A4e rule: the record is of an older base, an ancestor of the card’s (the base branch moved and was merged), the tree is current → current, the line says older base', async () => {
		const { root, base } = await gatedPackage()
		moveBaseBranch(root)

		const card = readLotCard({ root })

		const line = gateLineOf({ gates: card.gates, name: 'scoped' })
		expect(line).toMatchObject({
			status: 'passed',
			detail: `4/4 · selected T0 since ${short(base)} (older base)`,
		})
		expect(line?.stale).toBeUndefined()
		expect(card.otherTreeGates).not.toContain('scoped')
		expect(card.failedGates).not.toContain('scoped')
	})

	it('the record is of a base that is no ancestor of the card’s (gate --full --base on the branch tip) → the base moved since, stale, the card blocks', async () => {
		const { root } = createScopedLotPackageOfOneStep({ hookCounter: createCounter() })
		editReadLot(root)
		const fullGate = await runGateIn({ cwd: root, argv: ['--full', '--base', 'HEAD'] })
		expect(fullGate.exitCode).toBe(0)

		const card = readLotCard({ root })

		const line = gateLineOf({ gates: card.gates, name: 'scoped' })
		expect(line).toMatchObject({ status: 'warning', stale: true })
		expect(line?.detail.endsWith(STALE_BASE_SUFFIX)).toBe(true)
		expect(card.otherTreeGates).toContain('scoped')
		expect(card.verdict).toBe('BLOCKED')
	})

	it('A4e: right after a two-lot hand-over on the base branch, the card and the recap read the records at the hand-over’s base (the lots head): current, no older note, the lot hooks’ line counted with that base', async () => {
		const { root } = createScopedLotPackageOfOneStep({
			hookCounter: createCounter(),
			onMain: true,
		})
		editReadLot(root)
		await seedFullGate(root)
		const base = git({ root, args: ['rev-parse', 'HEAD'] }).trim()
		const { out, result } = writeLotsHandover({ root, lots: TWO_LOTS, branch: 'main' })
		expect(result.exitCode).toBe(0)
		const folderRun = await runFolder({ out })
		expect(folderRun.exitCode).toBe(0)

		const card = cardOf(show({ cwd: root, argv: [out, '--json'] }))
		const recap = runRecap({ cwd: root, argv: [out] }).output

		// the card and the recap resolve the base on the lots file's HEAD: the hand-over's base, whatever HEAD is now
		const line = gateLineOf({ gates: card.gates, name: 'scoped' })
		expect(line).toMatchObject({
			status: 'passed',
			detail: `4/4 · selected T0 since ${short(base)}`,
		})
		expect(line?.stale).toBeUndefined()
		expect(card.otherTreeGates).not.toContain('scoped')
		expect(gateLineOf({ gates: card.gates, name: 'test:run' })).toMatchObject({
			status: 'passed',
			detail: expect.stringContaining(`base ${short(base)}`),
		})
		expect(recap.split('\n')).toContain(`- ✓ scoped 4/4 · selected T0 since ${short(base)}`)
		expect(recap).toMatch(new RegExp(`^- ✓ test:run .*base ${short(base)}`, 'm'))
		expect(recap).not.toContain(STALE_BASE_SUFFIX)
	})
})

describe(
	'the card: a hook record of another base (A4b)',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		/** A merge hand-over on `main` (moved by an empty commit) and a stored hook record of the merged tree at `gateBase`. */
		async function mergeCardWithHookRecordAt(pick: 'before' | 'after') {
			const { root, tip, before, after } = await createScopedBranch({
				hookCounter: createCounter(),
				recorded: false,
				mainMoves: true,
			})
			storeHookRecordAt({
				root,
				tree: mergeTreeOf({ root, branch: BRANCH_NAME }),
				gateBase: pick === 'before' ? before : after,
			})
			const { result } = writeLotsHandover({
				root,
				branch: 'main',
				argv: ['--json'],
				lots: [
					{
						kind: 'merge',
						branch: BRANCH_NAME,
						tip,
						resolved: {},
						message: 'merge: bring feat/x in',
					},
				],
			})
			return { card: cardOf(result), before, after }
		}

		it('a hook record of the base the hand-over has → counted: its step is on the card, saying its base', async () => {
			const { card, after } = await mergeCardWithHookRecordAt('after')

			expect(gateLineOf({ gates: card.gates, name: 'test:run' })).toMatchObject({
				status: 'passed',
				detail: expect.stringContaining(`base ${short(after)}`),
			})
		})

		it('a hook record of another base (B1, the hand-over is at B2) → not counted: no line of its step, the gate never ran on this tree', async () => {
			const { card } = await mergeCardWithHookRecordAt('before')

			expect(gateLineOf({ gates: card.gates, name: 'test:run' })).toBeUndefined()
			expect(gateLineOf({ gates: card.gates, name: 'gate' })).toMatchObject({
				status: 'failed',
				detail: 'never run on this tree',
			})
		})
	},
)

describe('the card: the gate config', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('A11: a config the cli cannot run → one failed gate line with the message, the card still prints and blocks', () => {
		const bad = { name: 'bad', run: 'true', scoped: true, changedOnly: true }
		const root = createScopedHookedPackage({
			gate: { fast: [bad], full: [bad] },
			hookScript: scopedHookScript(createCounter()),
			onFeatureBranch: true,
		})
		editReadLot(root)
		const message = invalidMessageOf(root)

		const card = readLotCard({ root })

		expect(card.gates).toContainEqual({
			name: 'gate',
			status: 'failed',
			detail: `invalid gate config: ${message}`,
		})
		expect(card.verdict).toBe('BLOCKED')
	})
})

/** What `validateGateConfig` says of the package at `root` (it throws). */
function invalidMessageOf(root: string): string {
	const packageJson = JSON.parse(git({ root, args: ['show', 'HEAD:package.json'] })) as Parameters<
		typeof validateGateConfig
	>[0]
	try {
		validateGateConfig(packageJson)
	} catch (error) {
		return (error as Error).message
	}
	throw new Error('the config is valid')
}

describe('the card: a failed gate --release (A17)', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('newer than the green gate --full of the tree → the card’s gates, the judged cases and the recap’s checks are what they were', async () => {
		const failsOnRelease = createFailsOnReleaseStep()
		const root = createScopedHookedPackage({
			gate: { fast: [failsOnRelease.step], full: [failsOnRelease.step] },
			hookScript: scopedHookScript(createCounter()),
			onFeatureBranch: true,
		})
		editReadLot(root)
		await seedFullGate(root)
		const { out, lotsPath, result } = writeLotsHandover({
			root,
			lots: [READ_LOT],
			argv: ['--json'],
		})
		const before = {
			gates: cardOf(result).gates,
			judged: readJudgedCases({ root, stateHash: hashStateTree(computeStateTree(root)) }),
			checks: checkLinesOf(runRecap({ cwd: root, argv: [out] }).output),
		}

		const releaseGate = await runGateIn({ cwd: root, argv: ['--release'] })
		expect(releaseGate.exitCode).toBe(1)
		const after = {
			gates: rehashedCard(lotsPath).gates,
			judged: readJudgedCases({ root, stateHash: hashStateTree(computeStateTree(root)) }),
			checks: checkLinesOf(runRecap({ cwd: root, argv: [out] }).output),
		}

		expect(after).toEqual(before)
		expect(before.checks.some((line) => line.includes('selected T0 since'))).toBe(true)
	})
})

/** The recap's check lines (`- ✓ name detail`). */
function checkLinesOf(recap: string): string[] {
	return recap.split('\n').filter((line) => /^- [✓!✗] /.test(line))
}

describe(
	'the card: a package without a scoped step',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it('a record holding a base of another commit → read as today: current, no base said', async () => {
			const root = createHookedPackage({
				hookCounter: createCounter(),
				gateCounter: createCounter(),
			})
			editReadLot(root)
			await seedFullGate(root)
			const record = readRecordFile<GateRecord>({ root, name: FULL_RECORD_FILE })
			writeFileSync(
				gitPathOf({ root, name: FULL_RECORD_FILE }),
				JSON.stringify({ ...record, base: { commit: 'a'.repeat(40), source: 'base-branch' } }),
			)

			const card = readLotCardOnMain(root)

			const line = gateLineOf({ gates: card.gates, name: 'count' })
			expect(line).toMatchObject({ status: 'passed', detail: '4/4' })
			expect(line?.stale).toBeUndefined()
		})
	},
)

/** The card of the scratch lot of a package on `main`. */
function readLotCardOnMain(root: string) {
	return cardOf(
		writeLotsHandover({
			root,
			branch: 'main',
			lots: [READ_LOT],
			argv: ['--json'],
		}).result,
	)
}
