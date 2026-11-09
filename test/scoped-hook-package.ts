/**
 * Scratch packages with a scoped gate and a husky commit hook, a scoped step that selects nothing, and a live
 * hand-over run to stand under `gate --hook`.
 */
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import {
	COMMIT_SCRIPT_FILE,
	HANDOVER_LOCK_FILE,
	HANDOVER_RUN_MARKER_FILE,
} from '../src/lib/handover/handover.constants.ts'
import { shellQuote } from '../src/lib/shell-quote.ts'
import { FEATURE_BRANCH } from './scoped-gate-package.constants.ts'
import {
	EMPTY_SELECTION_STEP_SCRIPT,
	FAILS_ON_EMPTY_TREE_STEP_SCRIPT,
	HANDOVER_ENVIRONMENT_PROBE,
	HANDOVER_ENVIRONMENT_STEP,
	HUSKY_HOOK_RUNNER,
	HUSKY_PRE_COMMIT_WRAPPER,
	HUSKY_WRAPPER_FOLDER,
	LIVE_RUN_STARTED_AT,
	TWO_IDS_STEP_SCRIPT,
} from './scoped-hook-package.constants.ts'
import { createScratchRepository, git, temporaryFolder, writeFiles } from './scratch-repository.ts'

import type { GateStep } from '../src/lib/gate/gate-config.types.ts'
import type { ScopedStep } from './scoped-gate-package.types.ts'
import type { GateLayout, ScopedHookGate } from './scoped-hook-package.types.ts'

/**
 * A repository on `main` holding a package with the given gate lists and a husky commit hook running `hookScript`
 * (its wrapper in `.husky/_`, the script committed in `.husky/pre-commit`), with `src/read.ts` and `CHANGELOG.md`
 * to edit for a lot. With `onFeatureBranch`, `feat/x` is cut from `main` with one commit (`src/a.ts`,
 * `docs/notes.md`) and checked out: HEAD's merge-base with `main` is `main`'s first commit.
 */
export function createScopedHookedPackage(params: {
	gate: ScopedHookGate
	hookScript: string
	onFeatureBranch?: boolean
}): string {
	const root = createScratchRepository({
		'package.json': `${JSON.stringify({ name: 'demo', scripts: {}, dialecte: { gate: params.gate } })}\n`,
		'.gitignore': `${HUSKY_WRAPPER_FOLDER}\nnode_modules\n`,
		'.husky/pre-commit': `${params.hookScript}\n`,
		'src/read.ts': 'export function read() {}\n',
		'CHANGELOG.md': '# Changelog\n',
	})
	mkdirSync(join(root, HUSKY_WRAPPER_FOLDER), { recursive: true })
	writeFileSync(join(root, HUSKY_WRAPPER_FOLDER, 'h'), HUSKY_HOOK_RUNNER)
	writeFileSync(join(root, HUSKY_WRAPPER_FOLDER, 'pre-commit'), HUSKY_PRE_COMMIT_WRAPPER)
	chmodSync(join(root, HUSKY_WRAPPER_FOLDER, 'h'), 0o755)
	chmodSync(join(root, HUSKY_WRAPPER_FOLDER, 'pre-commit'), 0o755)
	git({ root, args: ['config', 'core.hooksPath', HUSKY_WRAPPER_FOLDER] })
	if (params.onFeatureBranch) {
		git({ root, args: ['checkout', '-q', '-b', FEATURE_BRANCH] })
		writeFiles({ root, files: { 'src/a.ts': 'export {}\n', 'docs/notes.md': 'notes\n' } })
		git({ root, args: ['add', '-A'] })
		git({ root, args: ['commit', '-q', '--no-verify', '-m', 'feat: the work'] })
	}
	return root
}

/** The hook line recording what the hook saw of the two hand-over variables, one `base|folder` line per run, in `log`. */
export function handoverEnvironmentProbe(log: string): string {
	return HANDOVER_ENVIRONMENT_PROBE.replace('{log}', shellQuote(log))
}

/** A scoped step running `script` as `sh <script> <log>` (its script and log in a folder of the test's own). */
function createScriptedScopedStep(script: string): ScopedStep {
	const folder = temporaryFolder('dialecte-scoped-step-')
	writeFiles({ root: folder, files: { 'step.sh': script } })
	const log = join(folder, 'runs.log')
	return {
		step: {
			name: 'scoped',
			run: `sh ${shellQuote(join(folder, 'step.sh'))} ${shellQuote(log)}`,
			counts: 'tests',
			scoped: true,
		},
		log,
		moveFile: join(folder, 'move-main-to'),
	}
}

/** A scoped step that selects nothing. */
export function createEmptySelectionStep(): ScopedStep {
	return createScriptedScopedStep(EMPTY_SELECTION_STEP_SCRIPT)
}

/** A scoped step that selects nothing and counts no test (a scoped lint-like step, not a test step). */
export function createScopedNonTestStep(): ScopedStep {
	const { step, ...rest } = createEmptySelectionStep()
	const { counts: _counts, ...nonTest } = step
	return { ...rest, step: nonTest }
}

/** A scoped step that selects two ids, `T0` and `T4`. */
export function createTwoIdsStep(): ScopedStep {
	return createScriptedScopedStep(TWO_IDS_STEP_SCRIPT)
}

/** A scoped step that fails when its base is the empty tree (a failing `gate --release`), passes otherwise. */
export function createFailsOnReleaseStep(): ScopedStep {
	return createScriptedScopedStep(FAILS_ON_EMPTY_TREE_STEP_SCRIPT)
}

/** An unscoped test step logging the hand-over variables it saw, one `base|folder` line per run, in `log`. */
export function createEnvironmentStep(log: string): GateStep {
	return {
		name: 'probe',
		run: HANDOVER_ENVIRONMENT_STEP.replace('{log}', shellQuote(log)),
		counts: 'tests',
	}
}

/** The gate lists of a package whose scoped step is where `layout` says; `plain` is its unscoped step. */
export function gateOfLayout(params: {
	layout: GateLayout
	scoped: GateStep
	plain: GateStep
}): ScopedHookGate {
	const { scoped, plain } = params
	if (params.layout === 'full') return { fast: [scoped], full: [scoped] }
	if (params.layout === 'none') return { fast: [plain], full: [plain] }
	if (params.layout === 'fast-only') return { fast: [scoped], full: [plain] }
	return { fast: [plain], full: [plain], release: [scoped] }
}

/**
 * A hand-over run in progress in `root`: a hand-over folder holding its script, the repository's lock naming that
 * script, and a run marker naming this process. The folder.
 */
export function startLiveHandoverRun(params: { root: string }): string {
	const folder = temporaryFolder('dialecte-handover-')
	writeFiles({ root: folder, files: { [COMMIT_SCRIPT_FILE]: '#!/bin/sh\nexit 0\n' } })
	writeFiles({
		root: params.root,
		files: { [`.git/${HANDOVER_LOCK_FILE}`]: `${join(folder, COMMIT_SCRIPT_FILE)}\n` },
	})
	writeFiles({
		root: folder,
		files: {
			[HANDOVER_RUN_MARKER_FILE]: `${JSON.stringify({ pid: process.pid, startedAt: LIVE_RUN_STARTED_AT })}\n`,
		},
	})
	return folder
}
