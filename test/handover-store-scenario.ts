/** Scratch repositories holding hand-overs in the store, written the way the store cases need them. */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
	chmodSync,
	existsSync,
	lstatSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	statSync,
	writeFileSync,
	rmSync,
} from 'node:fs'
import { join, resolve } from 'node:path'

import {
	runHandover,
	runHandoverAbandon,
	runHandoverRun,
	runHandoverShow,
} from '../src/commands/handover.ts'
import { commonGitFolderOf, listChangedFiles } from '../src/lib/git.ts'
import { handoverLockPath } from '../src/lib/handover/handover-lock.ts'
import { HANDOVER_STORE_FOLDER } from '../src/lib/handover/handover.constants.ts'
import { createFakeClock } from './fake-clock.ts'
import {
	CLI_SOURCE,
	STORE_BRANCH,
	STORE_NOW,
	STORE_WRITER_CLI,
	WIDE_COLUMNS,
} from './handover-store-scenario.constants.ts'
import { removeHookLogs } from './hook-logs.ts'
import { noRepositoryCli } from './repository-cli-probe.ts'
import { createScratchRepository, git, temporaryFolder, writeFiles } from './scratch-repository.ts'

import type { CommandResult } from '../src/lib/command-result.types.ts'
import type { InterleavingSeam, LotsFile } from '../src/lib/handover/handover.types.ts'
import type { RunOutcome, StoreEntryFields } from './handover-store-scenario.types.ts'

/** A repository on `branch` with one commit holding `src/read.ts`. */
export function createBranchRepository(params: { branch?: string } = {}): string {
	const root = createScratchRepository({ 'src/read.ts': 'export function read() {}\n' })
	git({ root, args: ['checkout', '-q', '-b', params.branch ?? STORE_BRANCH] })
	return root
}

/** A linked worktree of `root` on a new branch `branch`, removed with its temporary folder. */
export function createLinkedWorktree(params: { root: string; branch: string }): string {
	const path = join(temporaryFolder('dialecte-linked-'), 'worktree')
	git({ root: params.root, args: ['worktree', 'add', '-q', '-b', params.branch, path] })
	return path
}

/** The store of the repository `root` belongs to, as the cli keeps it. */
export function storeOf(root: string): string {
	return join(commonGitFolderOf(root), HANDOVER_STORE_FOLDER)
}

export function headOf(root: string): string {
	return git({ root, args: ['rev-parse', 'HEAD'] }).trim()
}

export function currentBranch(root: string): string {
	return git({ root, args: ['rev-parse', '--abbrev-ref', 'HEAD'] }).trim()
}

/** The porcelain status of `root`, sorted lines. */
export function statusOf(root: string): string[] {
	return git({ root, args: ['status', '--porcelain'] })
		.split('\n')
		.filter(Boolean)
		.sort()
}

/** The subjects of the commits of `root`, newest first. */
export function subjectsOf(root: string): string[] {
	return git({ root, args: ['log', '--format=%s'] })
		.trim()
		.split('\n')
}

/** A lots file in a folder of its own: the changed files of `root` in one lot, unless `lots` is given. */
export function writeLotsFile(params: {
	root: string
	name: string
	branch?: string
	lots?: LotsFile['lots']
}): string {
	const { root } = params
	const lotsFile: LotsFile = {
		repository: root,
		branch: params.branch ?? currentBranch(root),
		head: headOf(root).slice(0, 7),
		gates: 'npm run check',
		lots: params.lots ?? [
			{ paths: listChangedFiles({ root }), message: `feat(read): change ${params.name}` },
		],
	}
	const lotsPath = join(temporaryFolder('dialecte-store-lots-'), 'lots.json')
	writeFileSync(lotsPath, JSON.stringify(lotsFile))
	return lotsPath
}

/**
 * Writes a hand-over into a folder of its own (`--out`, a new temporary folder unless `folder` is given): first
 * the `changes` into the working tree, the branch checked out (created at HEAD when it is another one), then the
 * hand-over, which registers itself in the store. `name` is the registered name the case expects (the hand-over
 * is named by the cli, never by the helper); it also tells the lot's message apart. The repository's lock is
 * released afterwards unless `keepLock`, so several hand-overs can stand in one store.
 */
export function writeStoreHandover(params: {
	root: string
	name: string
	changes?: Record<string, string>
	branch?: string
	lots?: LotsFile['lots']
	keepLock?: boolean
	folder?: string
	/** The time the hand-over is written at (names are dated from it). Default: the fixed store time. */
	now?: Date
}): { folder: string; lotsPath: string } {
	const { root } = params
	if (params.branch && params.branch !== currentBranch(root))
		git({ root, args: ['checkout', '-q', '-B', params.branch] })
	writeFiles({ root, files: params.changes ?? {} })
	const lotsPath = writeLotsFile({ root, name: params.name, lots: params.lots })
	const folder = params.folder ?? join(temporaryFolder('dialecte-handover-out-'), 'handover')
	const written = runHandover({
		argv: [lotsPath, '--out', folder],
		cliPath: STORE_WRITER_CLI,
		probe: noRepositoryCli,
		now: params.now ?? STORE_NOW,
	})
	if (written.exitCode !== 0) throw new Error(`could not write ${folder}: ${written.output}`)
	if (!params.keepLock) rmSync(handoverLockPath(root), { force: true })
	return { folder, lotsPath }
}

/** The names of the entries of the store of `root`, sorted (`<name>.json` without the extension). */
export function entryNamesOf(root: string): string[] {
	const store = storeOf(root)
	if (!existsSync(store)) return []
	return readdirSync(store)
		.filter((file) => file.endsWith('.json'))
		.map((file) => file.slice(0, -'.json'.length))
		.sort()
}

/** The entry `name` of the store of `root`, parsed; undefined when there is none. */
export function readEntry(params: { root: string; name: string }): StoreEntryFields | undefined {
	const path = join(storeOf(params.root), `${params.name}.json`)
	return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as StoreEntryFields) : undefined
}

/** Sets the state recorded in the entry `name` (the entry is made when there is none yet). */
export function setEntryState(params: { root: string; name: string; state: string }): void {
	const store = storeOf(params.root)
	mkdirSync(store, { recursive: true })
	writeFileSync(
		join(store, `${params.name}.json`),
		JSON.stringify({ ...readEntry({ root: params.root, name: params.name }), state: params.state }),
	)
}

/** The text of a file, or undefined when it is not there. */
export function readIfPresent(path: string): string | undefined {
	return existsSync(path) ? readFileSync(path, 'utf8') : undefined
}

/** Writes a hand-over folder again (`handover <folder>/lots.json --rehash`) at `now`; */
export function rehashHandover(params: { folder: string; now: Date }): void {
	const written = runHandover({
		argv: [join(params.folder, 'lots.json'), '--rehash'],
		cliPath: STORE_WRITER_CLI,
		probe: noRepositoryCli,
		now: params.now,
	})
	if (written.exitCode !== 0)
		throw new Error(`could not rehash ${params.folder}: ${written.output}`)
}

/** Makes every commit after the first fail in a hook that lives outside the repository (the lots after the first stop). */
export function failHookAfterFirstCommit(root: string): void {
	const hooks = temporaryFolder('dialecte-hooks-')
	const hook = join(hooks, 'pre-commit')
	writeFileSync(hook, '#!/bin/sh\ntest "$(git rev-list --count HEAD)" -lt 2\n')
	chmodSync(hook, 0o755)
	git({ root, args: ['config', 'core.hooksPath', hooks] })
}

/** Removes the hand-over folder (the entry stays: the folder is gone). */
export function removeFolder(folder: string): void {
	rmSync(folder, { recursive: true, force: true })
}

/** Removes the entry `name` (a hand-over written by an earlier cli has none). */
export function removeEntry(params: { root: string; name: string }): void {
	rmSync(join(storeOf(params.root), `${params.name}.json`), { force: true })
}

/** Checks a branch out (the working tree's uncommitted changes go along). */
export function checkout(params: { root: string; branch: string }): void {
	git({ root: params.root, args: ['checkout', '-q', params.branch] })
}

/** `handover run` with the arguments, in the folder `cwd`; every line it printed kept. */
export async function runIn(params: {
	cwd: string
	argv: string[]
	columns?: number
	afterCheck?: InterleavingSeam
}): Promise<RunOutcome> {
	const lines: string[] = []
	removeHookLogs({ lines })
	const exitCode = await runHandoverRun({
		argv: params.argv,
		write: (line) => lines.push(line),
		clock: createFakeClock(),
		colour: false,
		probe: noRepositoryCli,
		scratchRoot: temporaryFolder('dialecte-scratch-root-'),
		cliPath: STORE_WRITER_CLI,
		columns: params.columns,
		cwd: params.cwd,
		afterCheck: params.afterCheck,
	})
	return { exitCode, lines, text: lines.join('\n') }
}

/** Commits a hand-over through its folder (the code that exists today), failing loudly when it does not. */
export async function commitStoreHandover(params: { root: string; folder: string }): Promise<void> {
	const outcome = await runIn({ cwd: params.root, argv: [params.folder] })
	if (outcome.exitCode !== 0) throw new Error(`could not commit ${params.folder}: ${outcome.text}`)
}

/** Commits the files of a lot by hand with its message: the lot is found committed, as a run leaves it. */
export function commitLotByHand(params: { root: string; paths: string[]; message: string }): void {
	git({ root: params.root, args: ['add', '--', ...params.paths] })
	git({ root: params.root, args: ['commit', '-q', '-m', params.message] })
}

/** Marks a hand-over folder as abandoned the way `handover abandon` does, for the cases that start from one. */
export function markAbandoned(params: { folder: string; file: string }): void {
	writeFileSync(
		join(params.folder, params.file),
		`${JSON.stringify({ at: '2026-11-04T10:00:00.000Z' })}\n`,
	)
}

/** The lines of a card's box: title, rows, section rules, footer rule. */
export function boxLines(output: string): string[] {
	return output.split('\n').filter((line) => /^[┌│├└]/.test(line))
}

/** The lines after the box's closing rule. */
export function linesAfterBox(output: string): string[] {
	const lines = output.split('\n')
	const closing = lines.findIndex((line) => line.startsWith('└'))
	return closing < 0 ? [] : lines.slice(closing + 1).filter(Boolean)
}

/** The git path of the index of the worktree `root` (absolute). */
export function indexPathOf(root: string): string {
	const result = spawnSync('git', ['rev-parse', '--git-path', 'index'], {
		cwd: root,
		encoding: 'utf8',
	})
	return resolve(root, result.stdout.trim())
}

/**
 * Every file under `paths` (a folder is walked, `skip` names left out) as "mtime:sha256 of its bytes"; a path
 * that does not exist as "absent".
 */
export function snapshotOf(params: {
	paths: readonly string[]
	skip?: readonly string[]
}): Record<string, string> {
	const snapshot: Record<string, string> = {}
	function visit(path: string): void {
		if (!existsSync(path)) {
			snapshot[path] = 'absent'
			return
		}
		const stat = lstatSync(path)
		if (stat.isDirectory()) {
			for (const entry of readdirSync(path).sort())
				if (!params.skip?.includes(entry)) visit(join(path, entry))
			return
		}
		snapshot[path] = stat.isSymbolicLink()
			? 'link'
			: `${statSync(path).mtimeMs}:${createHash('sha256').update(readFileSync(path)).digest('hex')}`
	}
	for (const path of params.paths) visit(path)
	return snapshot
}

/** `handover show` in `cwd`, wide enough for no wrapping; the repository has no cli of its own. */
export function show(params: {
	cwd: string
	argv?: string[]
	colour?: boolean
	columns?: number
}): CommandResult {
	return runHandoverShow({
		argv: params.argv ?? [],
		cwd: params.cwd,
		colour: params.colour ?? false,
		columns: params.columns ?? WIDE_COLUMNS,
		probe: noRepositoryCli,
		cliPath: STORE_WRITER_CLI,
	})
}

/** `handover abandon` in `cwd` at the fixed time. */
export function abandon(params: {
	cwd: string
	argv?: string[]
	afterCheck?: InterleavingSeam
}): CommandResult {
	return runHandoverAbandon({
		argv: params.argv ?? [],
		cwd: params.cwd,
		now: STORE_NOW,
		afterCheck: params.afterCheck,
	})
}

/** The footer of a card closing a hand-over named (or folded) `id`. */
export function footerOf(id: string): string {
	return `dialecte handover show ${id} · run ${id} · --legend`
}

/** The cli as a process whose output is a pipe, `$COLUMNS` set only when given. */
export function runCli(params: { cwd: string; argv: string[]; columns?: number }): {
	exitCode: number | null
	output: string
} {
	const { COLUMNS: _callerColumns, ...environment } = process.env
	const result = spawnSync(process.execPath, [CLI_SOURCE, ...params.argv], {
		cwd: params.cwd,
		encoding: 'utf8',
		env: {
			...environment,
			...(params.columns !== undefined && { COLUMNS: String(params.columns) }),
		},
	})
	return { exitCode: result.status, output: `${result.stdout}${result.stderr}` }
}
