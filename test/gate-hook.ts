/** Scratch packages and helpers for the tests of `gate --hook`. */
import { spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { shellQuote } from '../src/lib/shell-quote.ts'
import { HOOK_TREE_LENGTH } from './gate-hook.constants.ts'
import { readRecordFile } from './gate-records.ts'
import { FULL_RECORD_FILE } from './scratch-checks.constants.ts'
import { createCounter, countingStep } from './scratch-checks.ts'
import {
	initializeRepository,
	temporaryFolder,
	createScratchRepository,
	writeFiles,
} from './scratch-repository.ts'

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

/** The first line of a hook that found no record to answer from. */
export function runningLineOf(tree: string): string {
	return `gate --hook: no green gate --full or --release of tree ${tree.slice(0, HOOK_TREE_LENGTH)} with this install: running the tests`
}
