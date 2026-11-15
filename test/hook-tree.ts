/**
 * Scratch repositories for a record judged with the commands of the tree it checked: a worktree whose commit hook is
 * not the one of the tree its merge leaves, with the hand-over of that merge written around it.
 */
import { chmodSync } from 'node:fs'
import { join } from 'node:path'

import { hashHookCommand } from '../src/lib/gate-records/check-key.ts'
import { shellQuote } from '../src/lib/shell-quote.ts'
import { REPOSITORY_CLI_PATH } from './gate-hook.constants.ts'
import { writeInstalledLock } from './handover-landing.ts'
import {
	HOOK_TREE_MERGE_MESSAGE,
	HOOK_TREE_STEPS,
	GITHOOKS_FOLDER,
	GITHOOKS_PRE_COMMIT_FILE,
	MAIN_PRE_COMMIT,
	OLD_PRE_COMMIT,
	PRE_COMMIT_FILE,
} from './hook-tree.constants.ts'
import { WIRED_DEFAULT_SCRIPTS } from './rule-gaps-unwired.constants.ts'
import { createScopedHookedPackage } from './scoped-hook-package.ts'
import { BRANCH_NAME, READ_LOT, TEST_COUNT_LINE } from './scratch-checks.constants.ts'
import {
	createCounter,
	editReadLot,
	headOf,
	runGateIn,
	writeHandoverFolder,
} from './scratch-checks.ts'
import { createScratchRepository, git, writeFiles } from './scratch-repository.ts'
import { treeOfWorkingFiles } from './scratch-tree.ts'

import { expect } from 'vitest'

import type { GateStep } from '../src/lib/gate/gate-config.types.ts'
import type { MergeLotPlan } from '../src/lib/handover/handover.types.ts'
import type { LandingCounters } from './handover-landing.types.ts'
import type { HookTreeRepository, HookTreeScenario } from './hook-tree.types.ts'

/** The text of `.husky/pre-commit` for a hook script: the script and a final newline. */
export function preCommitTextOf(script: string): string {
	return `${script}\n`
}

/** The package.json text of a package whose `fast` and `full` gates run `steps`. */
export function packageJsonOf(steps: readonly GateStep[]): string {
	return `${JSON.stringify({
		name: 'demo',
		scripts: WIRED_DEFAULT_SCRIPTS,
		dialecte: { gate: { fast: steps, full: steps } },
	})}\n`
}

/**
 * A package on `main` whose commit hook is the old three lines, and `feat/x` cut from it with one commit that
 * rewrites the hook to main's one line (and the files of `branchFiles`); HEAD back on `main`, the branch not merged.
 */
export function createHookTreeRepository(
	params: { branchFiles?: Record<string, string> } = {},
): HookTreeRepository {
	const root = createScopedHookedPackage({
		gate: { fast: HOOK_TREE_STEPS, full: HOOK_TREE_STEPS },
		hookScript: OLD_PRE_COMMIT,
	})
	git({ root, args: ['checkout', '-q', '-b', BRANCH_NAME] })
	writeFiles({
		root,
		files: { [PRE_COMMIT_FILE]: preCommitTextOf(MAIN_PRE_COMMIT), ...params.branchFiles },
	})
	git({ root, args: ['add', '-A'] })
	git({ root, args: ['commit', '-q', '--no-verify', '-m', 'chore: the hook is one line'] })
	return finishHookTreeRepository({ root })
}

/**
 * HEAD of `feat/x` is checked out with its hook files in place: the hook hash of the branch's files is read there, then
 * `main` is checked out again for the worktree's and the trial merge's tree.
 */
function finishHookTreeRepository(params: { root: string }): HookTreeRepository {
	const { root } = params
	const tip = headOf(root)
	const mergedHookHash = hashHookCommand(root)
	git({ root, args: ['checkout', '-q', 'main'] })
	const mergedTree = git({ root, args: ['merge-tree', '--write-tree', 'HEAD', tip] })
		.split('\n')[0]
		.trim()
	return {
		root,
		tip,
		mergedTree,
		ownTree: git({ root, args: ['rev-parse', 'HEAD^{tree}'] }).trim(),
		worktreeHookHash: hashHookCommand(root),
		mergedHookHash,
	}
}

/**
 * A package on `main` whose commit hook is a plain hooks folder inside the repository (`.githooks`, committed,
 * `core.hooksPath` naming it), and `feat/x` with one commit that rewrites the hook file; HEAD back on `main`.
 */
export function createGithooksRepository(): HookTreeRepository {
	const root = createScratchRepository({
		'package.json': packageJsonOf(HOOK_TREE_STEPS),
		'.gitignore': 'node_modules\n',
		[GITHOOKS_PRE_COMMIT_FILE]: preCommitTextOf(OLD_PRE_COMMIT),
	})
	chmodSync(join(root, GITHOOKS_PRE_COMMIT_FILE), 0o755)
	git({ root, args: ['add', '-A'] })
	git({ root, args: ['commit', '-q', '--no-verify', '-m', 'chore: the hooks folder'] })
	git({ root, args: ['config', 'core.hooksPath', GITHOOKS_FOLDER] })
	git({ root, args: ['checkout', '-q', '-b', BRANCH_NAME] })
	writeFiles({ root, files: { [GITHOOKS_PRE_COMMIT_FILE]: preCommitTextOf(MAIN_PRE_COMMIT) } })
	git({ root, args: ['add', '-A'] })
	git({ root, args: ['commit', '-q', '--no-verify', '-m', 'chore: the hook is one line'] })
	return finishHookTreeRepository({ root })
}

/** The gate steps of the end-to-end package: `check` and `build` count their runs, `tests` counts and prints four passing. */
function hookTreeSteps(counters: LandingCounters): GateStep[] {
	return [
		{ name: 'check', run: `echo run >> ${shellQuote(counters.check)}` },
		{ name: 'build', run: `echo run >> ${shellQuote(counters.build)}` },
		{
			name: 'tests',
			run: `echo run >> ${shellQuote(counters.tests)} && printf '%s\\n' ${shellQuote(TEST_COUNT_LINE)}`,
			counts: 'tests',
		},
	]
}

/**
 * A worktree on `feat/x` cut when the commit hook was `oldHook` (three lines by default: `npm run check`, `npm run
 * test:hook`, `npm run build`), then `main` moved to a hook of the single `npm run test:hook` and gained the same
 * edit as the worktree's code lot. The hand-over is that lot, gated with a green `gate --full`, then a merge lot of
 * `main`, whose merged tree is main's own and holds main's hook. The hook is the real `gate --hook` of this
 * worktree's cli, through npm.
 */
export async function createHookTreeScenario(
	params: { oldHook?: string } = {},
): Promise<HookTreeScenario> {
	const counters: LandingCounters = {
		check: createCounter(),
		build: createCounter(),
		tests: createCounter(),
	}
	const steps = hookTreeSteps(counters)
	const root = createScopedHookedPackage({
		gate: { fast: steps, full: steps },
		hookScript: params.oldHook ?? OLD_PRE_COMMIT,
	})
	writeFiles({
		root,
		files: {
			'package.json': `${JSON.stringify({
				name: 'demo',
				version: '1.0.0',
				scripts: {
					...WIRED_DEFAULT_SCRIPTS,
					'test:hook': `node ${shellQuote(REPOSITORY_CLI_PATH)} gate --hook`,
				},
				dialecte: { gate: { fast: steps, full: steps } },
			})}\n`,
		},
	})
	git({ root, args: ['add', '--', 'package.json'] })
	git({ root, args: ['commit', '-q', '--no-verify', '-m', 'chore: the hook script'] })
	writeInstalledLock({ root })
	git({ root, args: ['branch', BRANCH_NAME] })
	writeFiles({ root, files: { [PRE_COMMIT_FILE]: preCommitTextOf(MAIN_PRE_COMMIT) } })
	editReadLot(root)
	git({ root, args: ['add', '-A'] })
	git({ root, args: ['commit', '-q', '--no-verify', '-m', 'chore: the hook is one line'] })
	const moved = headOf(root)
	git({ root, args: ['checkout', '-q', BRANCH_NAME] })
	editReadLot(root)
	const lotTree = treeOfWorkingFiles(root)
	const gated = await runGateIn({ cwd: root, argv: ['--full'] })
	expect(gated.exitCode).toBe(0)
	const mergeLot: MergeLotPlan = {
		kind: 'merge',
		branch: 'main',
		tip: moved,
		resolved: {},
		message: HOOK_TREE_MERGE_MESSAGE,
	}
	const { out } = writeHandoverFolder({
		root,
		lots: [READ_LOT, mergeLot],
		branch: BRANCH_NAME,
	})
	return { root, out, counters, lotTree }
}
