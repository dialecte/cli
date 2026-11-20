/**
 * A scratch git package for the tests of `dialecte bench`: a base commit on `main`, a head commit on a branch, and a
 * fake compiler in the head's `node_modules/.bin` that logs `$0`, `pwd` and `$*`, answers `--version` with tsgo
 * 7.0.2, and prints `Instantiations: <n>` with `n` read from the committed `bench-count.txt` of the tree it runs in.
 */
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { SCRATCH_VARIABLE } from '../src/lib/scratch/scratch.constants.ts'
import { STACK_FILE, STACK_SCHEMA } from '../src/lib/store/stack.constants.ts'
import {
	BENCH_COUNT_FILE,
	BENCH_LOT_NAME,
	COMPILER_VERSION_LINE,
	DISCOVERY_CACHE,
	HEAD_BRANCH,
	MISSING_PARENT_LOT_NAME,
	OTHER_COMPILER_MARK,
	PACKAGE_FILES,
	CONSTANTS_GENERATED_TEXT,
	DEFINITION_GENERATED_TEXT,
	VERSION,
} from './bench-repository.constants.ts'
import { createBriefWorkspace, writeStoreLot } from './brief-workspace.ts'
import { addWorktreeFolder, linkLot } from './lot-stores.ts'
import { commitFiles } from './rules-lot-worktree.ts'
import { git, initializeRepository, temporaryFolder, writeFiles } from './scratch-repository.ts'

import { onTestFinished, vi } from 'vitest'

import type { NpmRunner } from '../src/lib/worktree/worktree.types.ts'
import type {
	BenchRepository,
	BenchRepositoryParams,
	CompilerRun,
} from './bench-repository.types.ts'

/** The leaf generated files of `version`, as `dialecte coverage` loads them. */
export function definitionFilesOf(version: string): Record<string, string> {
	return {
		[`src/${version}/definition/constants.generated.ts`]: CONSTANTS_GENERATED_TEXT,
		[`src/${version}/definition/definition.generated.ts`]: DEFINITION_GENERATED_TEXT,
	}
}

/** The committed files of the package with the generated definition of its one version. */
export function packageFilesOf(): Record<string, string> {
	return { ...PACKAGE_FILES, ...definitionFilesOf(VERSION) }
}

/** A lock that installs left-pad at `version`. */
export function lockOf(version: string): string {
	return `${JSON.stringify({
		name: '@dialecte/demo',
		lockfileVersion: 3,
		packages: { '': { name: '@dialecte/demo' }, 'node_modules/left-pad': { version } },
	})}\n`
}

/** A fake compiler logging to `log` as `mark` (`head` or another compiler's mark). */
function fakeCompilerOf(params: { log: string; mark: string }): string {
	return [
		'#!/bin/sh',
		`printf '%s\\t%s\\t%s\\t%s\\n' '${params.mark}' "$0" "$(pwd)" "$*" >> '${params.log}'`,
		'case "$1" in',
		`\t--version) echo "${COMPILER_VERSION_LINE}" ;;`,
		`\t*) printf 'Instantiations: %s\\nTypes: 10\\nSymbols: 5\\n' "$(cat ${BENCH_COUNT_FILE})" ;;`,
		'esac',
		'',
	].join('\n')
}

/** Writes an executable fake compiler at `<folder>/node_modules/.bin/tsc`. */
export function installFakeCompiler(params: { folder: string; log: string; mark: string }): void {
	const path = join(params.folder, 'node_modules/.bin/tsc')
	writeFiles({ root: params.folder, files: { 'node_modules/.bin/tsc': fakeCompilerOf(params) } })
	chmodSync(path, 0o755)
}

function installedLeftPadOf(version: string): Record<string, string> {
	return {
		'node_modules/left-pad/package.json': `${JSON.stringify({ name: 'left-pad', version })}\n`,
	}
}

function countFilesOf(params: { count: number; lock?: string }): Record<string, string> {
	return {
		[BENCH_COUNT_FILE]: `${params.count}\n`,
		...(params.lock !== undefined && { 'package-lock.json': lockOf(params.lock) }),
	}
}

/** The head's install and fake compiler, the scratch root and the clean environment of a package at `root`. */
function equipHead(params: { root: string; installed?: string; discoveryFailsAtHead?: boolean }): {
	log: string
	scratch: string
	environment: Record<string, string>
} {
	const { root } = params
	const log = join(temporaryFolder('dialecte-bench-log-'), 'compiler.log')
	installFakeCompiler({ folder: root, log, mark: 'head' })
	if (params.installed !== undefined)
		writeFiles({ root, files: installedLeftPadOf(params.installed) })
	if (params.discoveryFailsAtHead) writeFiles({ root, files: { [DISCOVERY_CACHE]: 'a file\n' } })
	const scratch = temporaryFolder('dialecte-bench-scratch-')
	vi.stubEnv(SCRATCH_VARIABLE, scratch)
	onTestFinished(function restoreEnvironment() {
		vi.unstubAllEnvs()
	})
	return {
		log,
		scratch,
		environment: {
			PATH: process.env.PATH ?? '',
			HOME: process.env.HOME ?? '',
			[SCRATCH_VARIABLE]: scratch,
		},
	}
}

/**
 * The package at its base commit on `main`; with `headCount`, a head commit on `feat/change`; then the working
 * files, the head's install and its fake compiler.
 */
export function createBenchRepository(params: BenchRepositoryParams): BenchRepository {
	const packageFiles = params.withoutTargets ? PACKAGE_FILES : packageFilesOf()
	const root = initializeRepository({
		root: temporaryFolder('dialecte-bench-package-'),
		files: {
			...packageFiles,
			...countFilesOf({ count: params.baseCount, lock: params.baseLock }),
			...params.baseFiles,
		},
	})
	const base = git({ root, args: ['rev-parse', 'HEAD'] }).trim()
	if (params.headCount !== undefined) {
		git({ root, args: ['checkout', '-q', '-b', HEAD_BRANCH] })
		commitFiles({
			root,
			files: {
				...countFilesOf({ count: params.headCount, lock: params.headLock }),
				...params.headFiles,
			},
			message: 'feat: the change',
		})
	}
	if (params.workingFiles) writeFiles({ root, files: params.workingFiles })
	const head = git({ root, args: ['rev-parse', 'HEAD'] }).trim()
	const equipped = equipHead({
		root,
		installed: params.installed ?? params.headLock ?? params.baseLock,
		discoveryFailsAtHead: params.discoveryFailsAtHead,
	})
	return { root, base, head, ...equipped }
}

/** The package in a folder git holds no commit of: no HEAD, no base branch, no tag. */
export function createUncommittedBenchPackage(params: { count: number }): BenchRepository {
	const root = temporaryFolder('dialecte-bench-uncommitted-')
	// dialecte-allow raw-git-repository: a repository that never commits, so it needs no identity
	git({ root, args: ['init', '-q', '-b', 'main'] })
	writeFiles({ root, files: { ...packageFilesOf(), ...countFilesOf({ count: params.count }) } })
	return { root, base: '', head: '', ...equipHead({ root }) }
}

/**
 * The package in the worktree of a store lot cut from `main`, one commit on its branch. `case: 'unreadable-parent'`:
 * the lot is stacked on a lot the store does not hold; `case: 'no-base'`: its identity names a base git cannot read
 * and no base branch is left (`main` renamed), so the order finds nothing.
 */
export function createBenchLotWorktree(params: {
	baseCount: number
	headCount: number
	case: 'unreadable-parent' | 'no-base'
}): BenchRepository {
	const workspace = createBriefWorkspace()
	commitFiles({
		root: workspace.repository,
		files: { ...packageFilesOf(), ...countFilesOf({ count: params.baseCount }) },
		message: 'chore: package',
	})
	const base = git({ root: workspace.repository, args: ['rev-parse', 'HEAD'] }).trim()
	const root = addWorktreeFolder({ workspace, folderName: BENCH_LOT_NAME })
	commitFiles({
		root,
		files: countFilesOf({ count: params.headCount }),
		message: 'feat: the change',
	})
	const lotFolder = writeStoreLot({
		workspace,
		name: BENCH_LOT_NAME,
		scope: ['src/'],
		repository: workspace.repository,
		base:
			params.case === 'no-base'
				? { ref: 'no-such-ref', commit: 'a'.repeat(40) }
				: { ref: 'main', commit: base },
	})
	if (params.case === 'unreadable-parent')
		writeFileSync(
			join(lotFolder, STACK_FILE),
			`${JSON.stringify({ schema: STACK_SCHEMA, parent: MISSING_PARENT_LOT_NAME })}\n`,
		)
	else git({ root: workspace.repository, args: ['branch', '-m', 'main', 'trunk'] })
	linkLot({ worktree: root, lotFolder })
	const head = git({ root, args: ['rev-parse', 'HEAD'] }).trim()
	return { root, base, head, ...equipHead({ root }) }
}

/**
 * An installer standing in for `npm ci` in a base tree: it records where it ran and with what, installs left-pad at
 * `installs` and another fake compiler (logging as `other-compiler`), and, when `discoveryFails`, a file where method
 * discovery writes its entry.
 */
export function createBaseInstaller(params: {
	log: string
	installs: string
	discoveryFails?: boolean
}): { install: NpmRunner; calls: { checkout: string; args: string[] }[] } {
	const calls: { checkout: string; args: string[] }[] = []
	return {
		calls,
		install: function installBaseTree({ checkout, args }) {
			calls.push({ checkout, args })
			writeFiles({ root: checkout, files: installedLeftPadOf(params.installs) })
			installFakeCompiler({ folder: checkout, log: params.log, mark: OTHER_COMPILER_MARK })
			if (params.discoveryFails)
				writeFiles({ root: checkout, files: { [DISCOVERY_CACHE]: 'a file\n' } })
			return { status: 0, output: '' }
		},
	}
}

/** Every measuring run the fake compilers logged (`--version` left out); none when nothing ran. */
export function compilerRunsOf(log: string): CompilerRun[] {
	if (!existsSync(log)) return []
	return readFileSync(log, 'utf8')
		.split('\n')
		.filter(Boolean)
		.map(function runOf(line): CompilerRun {
			const [mark = '', program = '', folder = '', args = ''] = line.split('\t')
			return { compiler: mark === 'head' ? 'head' : 'other', program, folder, args }
		})
		.filter((run) => run.args !== '--version')
}
