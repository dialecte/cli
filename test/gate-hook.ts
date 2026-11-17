/** Scratch packages and helpers for the tests of `gate --hook`. */
import { spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { runGate } from '../src/commands/gate.ts'
import { readTreeRecords } from '../src/lib/gate-records/check-store.ts'
import { CHECK_STORE_FOLDER } from '../src/lib/gate-records/gate-records.constants.ts'
import { shellQuote } from '../src/lib/shell-quote.ts'
import { HOOK_STEP_NAMES, HOOK_TREE_LENGTH } from './gate-hook.constants.ts'
import { readRecordFile } from './gate-records.ts'
import { FULL_RECORD_FILE } from './scratch-checks.constants.ts'
import { createCounter, countingStep } from './scratch-checks.ts'
import {
	cloneRepository as cloneWithIdentity,
	initializeRepository,
	temporaryFolder,
	createScratchRepository,
	git,
	writeFiles,
} from './scratch-repository.ts'

import type { CommandResult } from '../src/lib/command-result.types.ts'
import type { GateRecord } from '../src/lib/gate-records/gate-records.types.ts'
import type { GateStep } from '../src/lib/gate/gate-config.types.ts'
import type { HookPackage } from './gate-hook.types.ts'

/** The package.json (and ignore file) of a package whose `--fast` and `--full` gates run `steps`. */
export function packageFilesOf(params: {
	steps: GateStep[]
	linked?: boolean
}): Record<string, string> {
	return {
		'package.json': `${JSON.stringify({
			name: 'demo',
			scripts: {},
			...(params.linked && { devDependencies: { dep: 'file:../dep' } }),
			dialecte: { gate: { fast: params.steps, full: params.steps } },
		})}\n`,
		'.gitignore': 'node_modules\n',
		'src/a.ts': 'export {}\n',
	}
}

/** The full gate's steps of a hook package: a `check` that is no test step, then a counting `tests` step. */
export function hookStepsOf(params: {
	checkCounter: string
	testCounter: string
	requires: string
	withoutTestStep?: boolean
}): GateStep[] {
	const check: GateStep = {
		name: 'check',
		run: `echo run >> ${shellQuote(params.checkCounter)}`,
	}
	if (params.withoutTestStep) return [check]
	return [
		check,
		countingStep({ counter: params.testCounter, name: 'tests', requires: params.requires }),
	]
}

/** A hook package: its `tests` step passes (its `requires` file exists) unless `requiresMissing`. */
export function createHookPackage(
	params: { requiresMissing?: boolean; linked?: boolean; withoutTestStep?: boolean } = {},
): HookPackage {
	const checkCounter = createCounter()
	const testCounter = createCounter()
	const requires = join(temporaryFolder('dialecte-requires-'), 'ok')
	if (!params.requiresMissing) writeFileSync(requires, '')
	const files = packageFilesOf({
		steps: hookStepsOf({
			checkCounter,
			testCounter,
			requires,
			withoutTestStep: params.withoutTestStep,
		}),
		linked: params.linked,
	})
	if (!params.linked)
		return { root: createScratchRepository(files), checkCounter, testCounter, requires }
	const container = temporaryFolder('dialecte-linked-')
	writeFiles({ root: join(container, 'dep'), files: { 'lib/a.js': 'one\n' } })
	return {
		root: initializeRepository({ root: join(container, 'app'), files }),
		checkCounter,
		testCounter,
		requires,
	}
}

/** The tree of the index at `indexFile` (relative: to `root`), else of the worktree's own index. */
export function indexTreeOf(params: { root: string; indexFile?: string }): string {
	const result = spawnSync('git', ['write-tree'], {
		cwd: params.root,
		encoding: 'utf8',
		env: {
			...process.env,
			...(params.indexFile && { GIT_INDEX_FILE: params.indexFile }),
		},
	})
	if (result.status !== 0) throw new Error(`git write-tree failed: ${result.stderr}`)
	return result.stdout.trim()
}

/** An index file at `path` (relative: to `root`) holding HEAD's tree, as git would hand a hook. */
export function createIndexFile(params: { root: string; path: string }): void {
	const result = spawnSync('git', ['read-tree', 'HEAD'], {
		cwd: params.root,
		encoding: 'utf8',
		env: { ...process.env, GIT_INDEX_FILE: params.path },
	})
	if (result.status !== 0) throw new Error(`git read-tree failed: ${result.stderr}`)
}

/** The record the last `gate --full` left in the worktree; throws when there is none. */
export function readFullRecord(root: string): GateRecord {
	const record = readRecordFile<GateRecord>({ root, name: FULL_RECORD_FILE })
	if (!record) throw new Error('no gate --full record in the worktree')
	return record
}

/** The one line a hook answered from a green `gate --full` of `tree` prints. */
export function reuseLineOf(params: { tree: string; record: GateRecord }): string {
	const { tree, record } = params
	return `gate --hook: tests reused from gate --full green on tree ${tree.slice(0, HOOK_TREE_LENGTH)} at ${record.at} (HEAD ${record.head.slice(0, HOOK_TREE_LENGTH)})`
}

/** The first line of a hook that found no record to answer from: it names the steps it runs (default: a hook package's). */
export function runningLineOf(params: { tree: string; steps?: readonly string[] }): string {
	const steps = (params.steps ?? HOOK_STEP_NAMES).join(', ')
	return `gate --hook: no green record of tree ${params.tree.slice(0, HOOK_TREE_LENGTH)} with this install answers a hook step: running ${steps}`
}

/** The one line a hook prints for the step `step` it answered from `record` (a run that really ran it). */
export function stepReusedLineOf(params: { step: string; record: GateRecord }): string {
	const { step, record } = params
	return `gate --hook: reused ${step} from ${record.mode} ${record.at} (HEAD ${record.head.slice(0, HOOK_TREE_LENGTH)})`
}

/** The lines of a hook that answered every step of `steps` from `record`, in list order. */
export function allReusedLinesOf(params: { steps?: string[]; record: GateRecord }): string[] {
	return (params.steps ?? HOOK_STEP_NAMES).map((step) =>
		stepReusedLineOf({ step, record: params.record }),
	)
}

/** `gate --hook` in `cwd`, with the given environment the way the cli passes it (`checkStore`, `reusable`). */
export function runHookIn(params: {
	cwd: string
	argv?: string[]
	indexFile?: string
	checkStore?: string
	reusable?: boolean
}): Promise<CommandResult> {
	return runGate({
		cwd: params.cwd,
		argv: ['--hook', ...(params.argv ?? [])],
		...(params.indexFile && { indexFile: params.indexFile }),
		...(params.checkStore && { checkStore: params.checkStore }),
		...(params.reusable === false && { reusable: false }),
	})
}

/** The `hook-gate` records of `tree` in the store of the repository `root` is in. */
export function hookRecordsOf(params: { root: string; tree: string }): GateRecord[] {
	return readTreeRecords(params).filter((record) => record.mode === 'hook-gate')
}

/** Every record of `tree` in the store of `root` rewritten by `change` (a hand edit of the store's file). */
function rewriteTreeRecords(params: {
	root: string
	tree: string
	change: (record: GateRecord) => GateRecord
}): void {
	const records = readTreeRecords(params).map(params.change)
	writeFileSync(
		join(commonGitDirOf(params.root), CHECK_STORE_FOLDER, `${params.tree}.json`),
		`${JSON.stringify(records, null, 2)}\n`,
	)
}

/** Every record of `tree` in the store of `root`, as a record of an older cli wrote it: no step carries a `stepHash`. */
export function stripStepHashes(params: { root: string; tree: string }): void {
	rewriteTreeRecords({
		...params,
		change: (record) => ({
			...record,
			steps: record.steps.map(({ stepHash: _stepHash, ...step }) => step),
		}),
	})
}

/** Every record of `tree` in the store of `root` with the step `step` marked skipped. */
export function markStepSkipped(params: { root: string; tree: string; step: string }): void {
	rewriteTreeRecords({
		...params,
		change: (record) => ({
			...record,
			steps: record.steps.map((step) =>
				step.name === params.step ? { ...step, status: 'skipped' as const } : step,
			),
		}),
	})
}

/** A change staged in the worktree's own index. */
export function stageChange(root: string): void {
	writeFiles({ root, files: { 'src/a.ts': 'export const staged = 1\n' } })
	git({ root, args: ['add', '--', 'src/a.ts'] })
}

/** A clone of the repository `root`, in a folder of its own, with the scratch identity a commit needs. */
export function cloneRepository(root: string): string {
	return cloneWithIdentity({
		origin: root,
		into: join(temporaryFolder('dialecte-clone-'), 'clone'),
	})
}

/** The absolute git common dir of the repository `root` is in. */
export function commonGitDirOf(root: string): string {
	return git({ root, args: ['rev-parse', '--path-format=absolute', '--git-common-dir'] }).trim()
}
