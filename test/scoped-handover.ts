/**
 * Scratch packages with a scoped gate step handed over: the hook that prints the base line, lots written with the
 * card as `--json`, a base branch that moves, a branch whose commit was handed over or gated.
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { runHandover } from '../src/commands/handover.ts'
import {
	foldHookBase,
	hashHookCommand,
	readInstalledKey,
} from '../src/lib/gate-records/check-key.ts'
import { storeCheckRecord } from '../src/lib/gate-records/check-store.ts'
import { hashStateTree } from '../src/lib/gate-records/state-hash.ts'
import { shellQuote } from '../src/lib/shell-quote.ts'
import { noRepositoryCli } from './repository-cli-probe.ts'
import { createScopedStep } from './scoped-gate-package.ts'
import {
	EMPTY_MOVE_MESSAGE,
	HOOK_BASE_LINE_COMMAND,
	HOOK_COUNT_LINE,
	HOOK_HEADER_LINES,
	MERGE_MAIN_MESSAGE,
	MOVED_FILE,
	MOVED_FILE_MESSAGE,
	MOVED_FILE_TEXT,
} from './scoped-handover.constants.ts'
import { createScopedHookedPackage } from './scoped-hook-package.ts'
import { BRANCH_NAME, READ_LOT, WRITER_CLI } from './scratch-checks.constants.ts'
import { editReadLot, headOf, runFolder, runGateIn } from './scratch-checks.ts'
import { git, temporaryFolder, writeFiles } from './scratch-repository.ts'

import { expect } from 'vitest'

import type { CommandResult } from '../src/lib/command-result.types.ts'
import type { CardGateLine } from '../src/lib/gate-records/gate-records.types.ts'
import type { HandoverVerdict, LotsFile } from '../src/lib/handover/handover.types.ts'
import type { ScopedHookGate } from './scoped-hook-package.types.ts'

/**
 * The commit hook of a scoped package: it counts its run in `counter`, prints a test step and the base line a
 * `gate --hook` of this cli prints, with the merge-base of HEAD and `main` it computes.
 */
export function scopedHookScript(counter: string): string {
	return [
		`echo run >> ${shellQuote(counter)}`,
		`printf '%s\\n' ${HOOK_HEADER_LINES.map((line) => shellQuote(line)).join(' ')}`,
		HOOK_BASE_LINE_COMMAND,
		`printf '%s\\n' ${shellQuote(HOOK_COUNT_LINE)}`,
	].join('\n')
}

/** A scoped package whose hook is `scopedHookScript`, on `feat/x` (cut from `main`) unless `onMain`. */
export function createScopedLotPackage(params: {
	gate: ScopedHookGate
	hookCounter: string
	onMain?: boolean
}): string {
	return createScopedHookedPackage({
		gate: params.gate,
		hookScript: scopedHookScript(params.hookCounter),
		onFeatureBranch: !params.onMain,
	})
}

/** A package with one scoped step in `fast` and `full` (and the step itself), on `feat/x` unless `onMain`. */
export function createScopedLotPackageOfOneStep(params: {
	hookCounter: string
	onMain?: boolean
}): {
	root: string
	scoped: ReturnType<typeof createScopedStep>
} {
	const scoped = createScopedStep()
	const root = createScopedLotPackage({
		gate: { fast: [scoped.step], full: [scoped.step] },
		hookCounter: params.hookCounter,
		onMain: params.onMain,
	})
	return { root, scoped }
}

/**
 * The lots file written in a folder of the test's own and handed to `handover write` with `argv`; the result is
 * not judged here. `branch` is the branch the lots are committed on (default: `feat/x`).
 */
export function writeLotsHandover(params: {
	root: string
	lots: LotsFile['lots']
	branch?: string
	argv?: string[]
}): { out: string; lotsPath: string; result: CommandResult } {
	const out = temporaryFolder('dialecte-handover-')
	const lotsPath = join(out, 'lots.json')
	const lotsFile: LotsFile = {
		repository: params.root,
		branch: params.branch ?? BRANCH_NAME,
		head: headOf(params.root),
		gates: 'npm run check',
		lots: params.lots,
	}
	writeFileSync(lotsPath, JSON.stringify(lotsFile))
	const result = runHandover({
		argv: [lotsPath, ...(params.argv ?? [])],
		cliPath: WRITER_CLI,
		probe: noRepositoryCli,
	})
	return { out, lotsPath, result }
}

/** The card of a hand-over of the scratch package's lot (`--json`), as `gates`, the verdict and what blocks. */
export function cardOf(result: CommandResult): {
	gates: CardGateLine[]
	verdict: HandoverVerdict
	failedGates: string[]
	otherTreeGates: string[]
} {
	expect(result.exitCode).toBe(0)
	const { gates, verdict, failedGates, otherTreeGates } = JSON.parse(result.output)
	return { gates, verdict, failedGates, otherTreeGates }
}

/** The card (`--json`) of the scratch package's `READ_LOT`, written now; the package's lot is edited already. */
export function readLotCard(params: { root: string; argv?: string[] }) {
	return cardOf(
		writeLotsHandover({
			root: params.root,
			lots: [READ_LOT],
			argv: ['--json', ...(params.argv ?? [])],
		}).result,
	)
}

/**
 * A hook record of `tree` in the repository's store as a commit's hook that used `gateBase` leaves it: the step
 * `test:run` passed, the key folding the base into the hook's command hash.
 */
export function storeHookRecordAt(params: { root: string; tree: string; gateBase: string }): void {
	const { root, tree, gateBase } = params
	storeCheckRecord({
		root,
		record: {
			mode: 'hook',
			at: '2026-11-09T10:00:00.000Z',
			head: headOf(root),
			stateHash: hashStateTree(tree),
			steps: [
				{
					name: 'test:run',
					status: 'passed',
					counts: { tests: { passed: 4, failed: 0, skipped: 0, total: 4 } },
				},
			],
			key: {
				tree,
				...readInstalledKey(root),
				commandHash: foldHookBase({ hook: hashHookCommand(root), gateBase }),
			},
			base: { commit: gateBase, source: 'base-branch' },
		},
	})
}

/** The tree a merge of `branch` into the current branch leaves. */
export function mergeTreeOf(params: { root: string; branch: string }): string {
	return git({
		root: params.root,
		args: ['merge-tree', '--write-tree', 'HEAD', params.branch],
	})
		.split('\n')[0]
		.trim()
}

/** The card (`--json`) of a hand-over written already, recomputed by `--rehash` (the repository is held by that folder). */
export function rehashedCard(lotsPath: string) {
	return cardOf(
		runHandover({
			argv: [lotsPath, '--rehash', '--json'],
			cliPath: WRITER_CLI,
			probe: noRepositoryCli,
		}),
	)
}

/** The line of the card named `name`. */
export function gateLineOf(params: {
	gates: readonly CardGateLine[]
	name: string
}): CardGateLine | undefined {
	return params.gates.find((line) => line.name === params.name)
}

/**
 * The base branch moves without its tree changing (one empty commit on `main`, made without a checkout) and the
 * current branch merges it: the tree stays, the merge-base moves forward. Returns `main`'s new head.
 */
export function moveBaseBranch(root: string): string {
	const tree = git({ root, args: ['rev-parse', 'main^{tree}'] }).trim()
	const moved = git({
		root,
		args: ['commit-tree', tree, '-p', 'main', '-m', EMPTY_MOVE_MESSAGE],
	}).trim()
	git({ root, args: ['update-ref', 'refs/heads/main', moved] })
	git({ root, args: ['merge', '-q', '--no-verify', '--no-edit', 'main'] })
	return moved
}

/**
 * A scoped package on `main`, then `feat/x` with the scratch lot committed on it: by a real `handover run` (its hook
 * printed the base line and left its record) when `recorded`, else by a plain commit; a `gate --release` green on the
 * tip's tree when `releaseOnTip`. Back on `main`, which has moved by one empty commit when `mainMoves`.
 * `before` is `main`'s head when the branch was cut, `after` its head now.
 */
export async function createScopedBranch(params: {
	hookCounter: string
	recorded: boolean
	releaseOnTip?: boolean
	mainMoves?: boolean
}): Promise<{ root: string; tip: string; before: string; after: string }> {
	const { root } = createScopedLotPackageOfOneStep({
		hookCounter: params.hookCounter,
		onMain: true,
	})
	const before = headOf(root)
	git({ root, args: ['checkout', '-q', '-b', BRANCH_NAME] })
	editReadLot(root)
	if (params.recorded) {
		const { out, result } = writeLotsHandover({ root, lots: [READ_LOT] })
		expect(result.exitCode).toBe(0)
		const folderRun = await runFolder({ out })
		expect(folderRun.exitCode).toBe(0)
	} else {
		git({ root, args: ['add', '--', ...READ_LOT.paths] })
		git({ root, args: ['commit', '-q', '--no-verify', '-m', READ_LOT.message] })
	}
	const tip = headOf(root)
	if (params.releaseOnTip) {
		const releaseGate = await runGateIn({ cwd: root, argv: ['--release'] })
		expect(releaseGate.exitCode).toBe(0)
	}
	git({ root, args: ['checkout', '-q', 'main'] })
	if (params.mainMoves)
		git({ root, args: ['commit', '-q', '--no-verify', '--allow-empty', '-m', EMPTY_MOVE_MESSAGE] })
	return { root, tip, before, after: headOf(root) }
}

/**
 * A scoped package on `main`, `feat/x` cut from it, then `main` moves by a commit of a file; `feat/x` merges `main`
 * in a real hand-over (a merge lot whose hook printed the base it used: the one `feat/x` was cut at). Back on
 * `main`. `cut` is that base, `moved` `main`'s head now.
 */
export async function createBranchThatMergedMain(params: { hookCounter: string }): Promise<{
	root: string
	tip: string
	cut: string
	moved: string
}> {
	const { root } = createScopedLotPackageOfOneStep({
		hookCounter: params.hookCounter,
		onMain: true,
	})
	const cut = headOf(root)
	git({ root, args: ['branch', BRANCH_NAME] })
	writeFiles({ root, files: { [MOVED_FILE]: MOVED_FILE_TEXT } })
	git({ root, args: ['add', '--', MOVED_FILE] })
	git({ root, args: ['commit', '-q', '--no-verify', '-m', MOVED_FILE_MESSAGE] })
	const moved = headOf(root)
	git({ root, args: ['checkout', '-q', BRANCH_NAME] })
	const { out, result } = writeLotsHandover({
		root,
		lots: [
			{
				kind: 'merge',
				branch: 'main',
				tip: moved,
				resolved: {},
				message: MERGE_MAIN_MESSAGE,
				// a real run commits a merge lot only with the tree it must hold
				tree: mergeTreeOf({ root, branch: 'main' }),
			},
		],
	})
	expect(result.exitCode).toBe(0)
	const folderRun = await runFolder({ out })
	expect(folderRun.exitCode).toBe(0)
	const tip = headOf(root)
	git({ root, args: ['checkout', '-q', 'main'] })
	return { root, tip, cut, moved }
}
