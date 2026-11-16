/**
 * Scratch package for the landing's hook reuse: real git hooks running this worktree's cli `gate --hook`, counting
 * check, build and tests steps, a lot then a merge lot of a main that moved, a hand-over written around them.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { runHandover } from '../src/commands/handover.ts'
import { HOOK_LANDING_LINE } from '../src/lib/handover/hook-output.constants.ts'
import { shellQuote } from '../src/lib/shell-quote.ts'
import { HOOK_GATE_COMMAND } from './gate-hook.constants.ts'
import {
	LANDING_MERGE_MESSAGE,
	LANDING_MOVED_FILE,
	LANDING_MOVED_MESSAGE,
	LANDING_MOVED_TEXT,
	LANDING_NOTES_AFTER,
	LANDING_NOTES_BEFORE,
	LANDING_NOTES_FILE,
	LANDING_SECOND_FILE,
	LANDING_SECOND_LOT,
	LANDING_SECOND_TEXT,
	LANDING_STEP_NAMES,
	LANDING_TESTS_FAIL,
	LANDING_TESTS_PASS,
} from './handover-landing.constants.ts'
import { INSTALLED_LOCK_FILE, PACKAGES, ROOT_FIELDS_A } from './lock-key.constants.ts'
import { noRepositoryCli } from './repository-cli-probe.ts'
import { createScopedHookedPackage } from './scoped-hook-package.ts'
import { BRANCH_NAME, READ_LOT, TEST_COUNT_LINE, WRITER_CLI } from './scratch-checks.constants.ts'
import {
	countRuns,
	createCounter,
	editReadLot,
	headOf,
	runGateIn,
	writeHandoverFolder,
} from './scratch-checks.ts'
import { git, temporaryFolder, writeFiles } from './scratch-repository.ts'
import { treeOfWorkingFiles } from './scratch-tree.ts'

import { expect } from 'vitest'

import type { GateStep } from '../src/lib/gate/gate-config.types.ts'
import type { LotsFile, MergeLotPlan } from '../src/lib/handover/handover.types.ts'
import type { LandingCounters, LandingScenario } from './handover-landing.types.ts'

/**
 * The gate steps of the landing package: `check` and `build` count their runs, `tests` counts and reads `requires`
 * (and, with `needsSecondFile`, fails while the second lot's file is not in the tree it runs on).
 */
function landingSteps(params: {
	counters: LandingCounters
	requires: string
	needsSecondFile: boolean
}): GateStep[] {
	const { counters, requires, needsSecondFile } = params
	return [
		{ name: 'check', run: `echo run >> ${shellQuote(counters.check)}` },
		{ name: 'build', run: `echo run >> ${shellQuote(counters.build)}` },
		{
			name: 'tests',
			run: [
				`echo run >> ${shellQuote(counters.tests)}`,
				`printf '%s\\n' ${shellQuote(TEST_COUNT_LINE)}`,
				`grep -qx ${LANDING_TESTS_PASS} ${shellQuote(requires)}`,
				...(needsSecondFile ? [`test -f ${shellQuote(LANDING_SECOND_FILE)}`] : []),
			].join(' && '),
			counts: 'tests',
		},
	]
}

/** How many times each hook step ran, in list order. */
export function runCounts(counters: LandingCounters): number[] {
	return LANDING_STEP_NAMES.map((name) => countRuns(counters[name]))
}

/** The installed lock of the repository, as npm writes it: `root` fields and `packages`. */
export function writeInstalledLock(params: {
	root: string
	fields?: object
	packages?: object
}): void {
	writeFiles({
		root: params.root,
		files: {
			[INSTALLED_LOCK_FILE]: `${JSON.stringify({ ...(params.fields ?? ROOT_FIELDS_A), packages: params.packages ?? PACKAGES }, null, 2)}\n`,
		},
	})
}

/** The `tests` step's file written: the step passes (`true`) or fails. */
export function setTestsPassing(params: { requires: string; passing: boolean }): void {
	writeFileSync(params.requires, params.passing ? LANDING_TESTS_PASS : LANDING_TESTS_FAIL)
}

/**
 * A package whose commit hook is the real `gate --hook` of this worktree's cli, on `BRANCH_NAME` cut from `main`,
 * which then gained a file; the working files hold the scratch lot's edit; an installed lock is written. The hand-over
 * is written for the lot, then (with `laterLot`) a second plain lot adding `LANDING_SECOND_FILE` and changing
 * `LANDING_NOTES_FILE` (a file the base holds), then (with `merge`) a merge lot bringing main in. With
 * `laterLot: 'required'` the `tests` step fails on any tree without the second lot's file, so the first lot alone
 * breaks it. With `gated`, a green `gate --full` of the tree every lot leaves is run first.
 */
export async function createLandingScenario(params: {
	merge: boolean
	gated: boolean
	hookExtra?: string
	laterLot?: 'plain' | 'required'
}): Promise<LandingScenario> {
	const counters: LandingCounters = {
		check: createCounter(),
		build: createCounter(),
		tests: createCounter(),
	}
	const requires = join(temporaryFolder('dialecte-requires-'), 'tests.txt')
	setTestsPassing({ requires, passing: true })
	const steps = landingSteps({
		counters,
		requires,
		needsSecondFile: params.laterLot === 'required',
	})
	const root = createScopedHookedPackage({
		gate: { fast: steps, full: steps },
		hookScript: [HOOK_GATE_COMMAND, ...(params.hookExtra ? [params.hookExtra] : [])].join('\n'),
	})
	writeInstalledLock({ root })
	if (params.laterLot) {
		writeFiles({ root, files: { [LANDING_NOTES_FILE]: LANDING_NOTES_BEFORE } })
		git({ root, args: ['add', '--', LANDING_NOTES_FILE] })
		git({ root, args: ['commit', '-q', '--no-verify', '-m', 'docs(notes): the base notes'] })
	}
	git({ root, args: ['branch', BRANCH_NAME] })
	// main moves only when a merge lot brings it in: the hand-over's target guard refuses a moved main otherwise
	if (params.merge) {
		writeFiles({ root, files: { [LANDING_MOVED_FILE]: LANDING_MOVED_TEXT } })
		git({ root, args: ['add', '--', LANDING_MOVED_FILE] })
		git({ root, args: ['commit', '-q', '--no-verify', '-m', LANDING_MOVED_MESSAGE] })
	}
	const moved = headOf(root)
	git({ root, args: ['checkout', '-q', BRANCH_NAME] })
	editReadLot(root)
	const lotTree = treeOfWorkingFiles(root)
	if (params.laterLot)
		writeFiles({
			root,
			files: {
				[LANDING_SECOND_FILE]: LANDING_SECOND_TEXT,
				[LANDING_NOTES_FILE]: LANDING_NOTES_AFTER,
			},
		})
	const finalTree = params.laterLot ? treeOfWorkingFiles(root) : lotTree
	if (params.gated) {
		const gated = await runGateIn({ cwd: root, argv: ['--full'] })
		expect(gated.exitCode).toBe(0)
	}
	const mergeLot: MergeLotPlan = {
		kind: 'merge',
		branch: 'main',
		tip: moved,
		resolved: {},
		message: LANDING_MERGE_MESSAGE,
	}
	const plainLots = params.laterLot ? [READ_LOT, LANDING_SECOND_LOT] : [READ_LOT]
	const { out } = writeHandoverFolder({
		root,
		lots: params.merge ? [...plainLots, mergeLot] : plainLots,
		branch: BRANCH_NAME,
	})
	return { root, out, counters, requires, lotTree, finalTree }
}

/** The tree a rehearsal prints for its merge lot (`  tree <sha>`); empty when it prints none. */
export function mergeTreeOf(text: string): string {
	return /^ {2}tree (\S+)$/m.exec(text)?.[1] ?? ''
}

/** The lines of a run's text that start with `start` (the landing lines: `LANDING_LINE_START`). */
export function landingLinesOf(params: { text: string; start: string }): string[] {
	return params.text.split('\n').filter((line) => line.startsWith(params.start))
}

/** The hand-over folder taken again from the files as they are now (`handover --rehash`), as a person does after an edit. */
export function rehashFolder(out: string): void {
	expect(
		runHandover({
			argv: [join(out, 'lots.json'), '--rehash'],
			cliPath: WRITER_CLI,
			probe: noRepositoryCli,
		}).exitCode,
	).toBe(0)
}

/**
 * The tree the merge lot must hold recorded in the hand-over folder and the folder rehashed, as a person does after
 * reviewing the rehearsal (a real run commits a merge lot only with its tree): the merge of main into a commit
 * holding the first lot's tree, made without touching the repository's index or branches.
 */
export function recordMergeTree(params: { root: string; out: string; lotTree: string }): string {
	const { root } = params
	const lotCommit = git({
		root,
		args: ['commit-tree', params.lotTree, '-p', 'HEAD', '-m', READ_LOT.message],
	}).trim()
	const tree = git({ root, args: ['merge-tree', '--write-tree', lotCommit, 'main'] })
		.split('\n')[0]
		.trim()
	const lotsPath = join(params.out, 'lots.json')
	const lotsFile: LotsFile = JSON.parse(readFileSync(lotsPath, 'utf8'))
	const merge = lotsFile.lots.at(-1)
	if (!merge || !('kind' in merge)) throw new Error('the last lot is no merge lot')
	merge.tree = tree
	writeFileSync(lotsPath, JSON.stringify(lotsFile))
	rehashFolder(params.out)
	return tree
}

/** The landing line of a lot whose hook answered every step from the run `mode` at `at`, none ran. */
export function reusedLandingOf(params: { mode: string; at: string }): string {
	return HOOK_LANDING_LINE.replace(
		'{reused}',
		LANDING_STEP_NAMES.map((step) => `${step} (${params.mode} ${params.at})`).join(', '),
	).replace('{ran}', 'none')
}
