/** Scratch packages, repositories and lots for the cases of the cli floor, and a spawned `dialecte lot`. */
import { spawnSync } from 'node:child_process'
import { chmodSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { CLI_PACKAGE } from '../src/lib/skills/cli-invocations.constants.ts'
import { writeStoreLot } from './brief-workspace.ts'
import {
	CLI_SOURCE,
	LOT_FULL_NAME,
	PACKAGE_NAME,
	STATE_FOLDER,
	WORK_BRANCH,
} from './cli-floor-workspace.constants.ts'
import { createStartWorkspace } from './lot-start-workspace.ts'
import { writeStoreListFile } from './lot-stores.ts'
import { createScratchRepository, git, temporaryFolder, writeFiles } from './scratch-repository.ts'

import { vi } from 'vitest'

import type { FloorLotWorkspace, LotRun } from './cli-floor-workspace.types.ts'
import type { StartWorkspace } from './lot-start-workspace.types.ts'

/** The text of a package.json that asks for the cli at `spec` in `field`. */
export function manifestPinning(params: {
	spec: string
	field?: string
	version?: string
}): string {
	const field = params.field ?? 'devDependencies'
	return `${JSON.stringify({ name: PACKAGE_NAME, version: params.version ?? '1.0.0', [field]: { [CLI_PACKAGE]: params.spec } }, null, 2)}\n`
}

/** The text of the cli repository's own package.json at `version`. */
export function cliManifestAt(params: { version: string }): string {
	return `${JSON.stringify({ name: CLI_PACKAGE, version: params.version }, null, 2)}\n`
}

/** The text parsed as JSON; undefined when it is not. */
export function jsonOrUndefined(text: string): unknown {
	try {
		return JSON.parse(text)
	} catch {
		return undefined
	}
}

/** `XDG_STATE_HOME` points into a folder of the case's own, so no id resolves against the person's lots. The caller restores the environment. */
export function isolateState(): string {
	const state = join(temporaryFolder('dialecte-floor-state-'), STATE_FOLDER)
	vi.stubEnv('XDG_STATE_HOME', state)
	return state
}

/** A repository on `main` whose package.json (committed) is `manifest`; its path. */
export function createPackageRepository(params: { manifest: string }): string {
	return createScratchRepository({ 'package.json': params.manifest })
}

/** A new branch `work` checked out, whose package.json (committed) is `manifest`. */
export function commitOnBranch(params: { root: string; path: string; manifest: string }): void {
	git({ root: params.root, args: ['checkout', '-q', '-b', WORK_BRANCH] })
	writeFiles({ root: params.root, files: { [params.path]: params.manifest } })
	git({ root: params.root, args: ['add', '-A'] })
	git({ root: params.root, args: ['commit', '-q', '-m', 'chore: change the pin'] })
}

/** A folder with no package.json above it and no repository. */
export function bareFolder(): string {
	return temporaryFolder('dialecte-floor-bare-')
}

/** A spawned `dialecte lot <args>` of the sources (or of `entry`) run in `cwd`, with this process's environment. */
export function runLotCli(params: {
	cwd: string
	args: string[]
	entry?: string
	/** Kills the process after this many milliseconds. */
	timeoutMs?: number
}): LotRun {
	const run = spawnSync(process.execPath, [params.entry ?? CLI_SOURCE, 'lot', ...params.args], {
		cwd: params.cwd,
		encoding: 'utf8',
		timeout: params.timeoutMs,
	})
	return {
		status: run.status,
		stdout: run.stdout,
		stderr: run.stderr,
		timedOut: (run.error as NodeJS.ErrnoException | undefined)?.code === 'ETIMEDOUT',
	}
}

/** The parts of `text` it does not hold, in order: an empty list means the text names every one. */
export function missingFrom(params: { text: string; parts: string[] }): string[] {
	return params.parts.filter((part) => !params.text.includes(part))
}

/** A start workspace whose repository's package.json is `manifest`, committed on `main`. */
export function createFloorStart(params: { manifest: string }): StartWorkspace {
	const start = createStartWorkspace()
	writeFiles({ root: start.repository, files: { 'package.json': params.manifest } })
	git({ root: start.repository, args: ['add', '-A'] })
	git({ root: start.repository, args: ['commit', '-q', '-m', 'chore: add the package'] })
	return start
}

/**
 * A lot of the workspace's store whose identity names `repository`, its store listed in the state folder. The
 * lot's worktree does not exist. The lot folder (real path).
 */
export function addFloorLot(params: { start: StartWorkspace; repository: string }): string {
	const lotFolder = writeStoreLot({
		workspace: params.start.workspace,
		name: LOT_FULL_NAME,
		scope: ['src/'],
		repository: params.repository,
		branch: 'feat/floor',
	})
	writeStoreListFile({ stores: [params.start.store] })
	return realpathSync(lotFolder)
}

/**
 * A started lot (its identity names the workspace's repository, its store listed) whose repository's package.json is
 * `manifest`, committed; a folder with no package.json above it to run from.
 */
export function createFloorLotWorkspace(params: { manifest: string }): FloorLotWorkspace {
	const start = createFloorStart(params)
	const lotFolder = addFloorLot({ start, repository: start.repository })
	return { start, elsewhere: bareFolder(), lotFolder }
}

/** Rewrites the lot's identity so it records `version` as the cli that started the lot. */
export function recordStartingCli(params: { lotFolder: string; version: string }): void {
	const path = join(params.lotFolder, 'identity.json')
	const identity = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
	// a published record is read-only
	chmodSync(path, 0o644)
	writeFileSync(path, `${JSON.stringify({ ...identity, cli: params.version }, null, 2)}\n`)
}
