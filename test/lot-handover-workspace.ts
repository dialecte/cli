/** Lots in a scratch workspace that a hand-over is written into, and the helpers the hand-over-meets-lot cases share. */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { join } from 'node:path'

import { runHandover } from '../src/commands/handover.ts'
import { runLot } from '../src/commands/lot.ts'
import { handoverLockPath } from '../src/lib/handover/handover-lock.ts'
import { writeStoreLot } from './brief-workspace.ts'
import { CLI_SOURCE, STORE_WRITER_CLI } from './handover-store-scenario.constants.ts'
import { entryNamesOf, readIfPresent, writeLotsFile } from './handover-store-scenario.ts'
import {
	FOREIGN_BRANCH,
	LOT_CHANGES,
	LOT_HANDOVER_NOW,
	MAIN_CHANGES,
	SIMULATED_LOT_NAME,
} from './lot-handover-workspace.constants.ts'
import { createStartWorkspace, snapshotOf, withJson } from './lot-start-workspace.ts'
import { LOT_NAME, START_NOW } from './lot-start.constants.ts'
import { noRepositoryCli } from './repository-cli-probe.ts'
import { temporaryFolder, writeFiles } from './scratch-repository.ts'
import { writeRecordFile } from './store-records.ts'

import { vi } from 'vitest'

import type { CommandResult } from '../src/lib/command-result.types.ts'
import type { Transition } from '../src/lib/store/store.types.ts'
import type { CliRun, LotHandoverWorkspace, StoreBytes } from './lot-handover-workspace.types.ts'

/** `XDG_STATE_HOME` pointing into a folder of the test's own: the person's store list is never touched. The caller restores the environment. */
export function isolateStateFolder(): void {
	vi.stubEnv('XDG_STATE_HOME', join(temporaryFolder('dialecte-state-'), 'state'))
}

/** A real lot: `lot start` of the default brief, then the files of `LOT_CHANGES` changed in its worktree, and a lots file for them. */
export function startRealLot(): LotHandoverWorkspace {
	const start = createStartWorkspace()
	const started = runLot({
		cwd: start.cwd,
		argv: ['start', start.workspace.briefPath],
		now: START_NOW,
	})
	if (started.exitCode !== 0) throw new Error(`could not start the lot: ${started.output}`)
	const worktree = realpathSync(join(start.worktreesFolder, LOT_NAME))
	writeFiles({ root: worktree, files: { ...LOT_CHANGES } })
	return {
		start,
		lotName: LOT_NAME,
		lotFolder: realpathSync(join(start.store, LOT_NAME)),
		worktree,
		lotsPath: writeLotsFile({ root: worktree, name: 'lot' }),
	}
}

/** A simulated lot (no worktree), and a lots file naming the main checkout, where `MAIN_CHANGES` is changed. */
export function startSimulatedLot(): LotHandoverWorkspace {
	const start = createStartWorkspace()
	const lotFolder = writeStoreLot({
		workspace: start.workspace,
		name: SIMULATED_LOT_NAME,
		scope: ['src/'],
		simulated: true,
	})
	writeFiles({ root: start.repository, files: { ...MAIN_CHANGES } })
	return {
		start,
		lotName: SIMULATED_LOT_NAME,
		lotFolder: realpathSync(lotFolder),
		worktree: start.repository,
		lotsPath: writeLotsFile({ root: start.repository, name: 'simulated' }),
	}
}

/** A lots file naming the main checkout (changed with `MAIN_CHANGES`), for a lot whose worktree is another folder. */
export function writeMainLotsFile(lot: LotHandoverWorkspace): string {
	writeFiles({ root: lot.start.repository, files: { ...MAIN_CHANGES } })
	return writeLotsFile({ root: lot.start.repository, name: 'main' })
}

/** A lots file naming the lot's worktree and a branch the lot is not on. */
export function writeForeignBranchLotsFile(lot: LotHandoverWorkspace): string {
	return writeLotsFile({ root: lot.worktree, name: 'branch', branch: FOREIGN_BRANCH })
}

/** The cli run as a process in `cwd`, the environment of the test (so its `XDG_STATE_HOME`) passed on. */
export function runCliSplit(params: { argv: string[]; cwd: string }): CliRun {
	const { COLUMNS: _callerColumns, ...environment } = process.env
	const result = spawnSync(process.execPath, [CLI_SOURCE, ...params.argv], {
		cwd: params.cwd,
		encoding: 'utf8',
		env: environment,
	})
	return {
		exitCode: result.status,
		stdout: result.stdout,
		stderr: result.stderr,
		output: `${result.stdout}${result.stderr}`,
	}
}

/** A run's exit code and its standard output read as JSON (undefined when it is not). */
export function withStdoutJson(run: CliRun): { exitCode: number | null; json: unknown } {
	try {
		return { exitCode: run.exitCode, json: JSON.parse(run.stdout) }
	} catch {
		return { exitCode: run.exitCode, json: undefined }
	}
}

/** The exit code of a run and which of `needles` its output holds, in the order given. */
export function withMentioned(params: { run: CliRun; needles: readonly string[] }): {
	exitCode: number | null
	mentioned: string[]
} {
	return {
		exitCode: params.run.exitCode,
		mentioned: params.needles.filter((needle) => params.run.output.includes(needle)),
	}
}

/** The exit code of a command's result and which of `needles` its output holds, in the order given. */
export function resultMentioning(params: { result: CommandResult; needles: readonly string[] }): {
	exitCode: number
	mentioned: string[]
} {
	return {
		exitCode: params.result.exitCode,
		mentioned: params.needles.filter((needle) => params.result.output.includes(needle)),
	}
}

/** `handover write <lots file> --out <out>` run as a process from `cwd`. */
export function writeInto(params: {
	lotsPath: string
	out: string
	cwd: string
	extra?: string[]
}): CliRun {
	return runCliSplit({
		argv: ['handover', 'write', params.lotsPath, '--out', params.out, ...(params.extra ?? [])],
		cwd: params.cwd,
	})
}

/** Writes the lot's hand-over into its folder (the code that exists today: the folder's real path), failing loudly; the entry's name. */
export function writeLotHandover(lot: LotHandoverWorkspace): string {
	const written = runHandover({
		argv: [lot.lotsPath, '--out', lot.lotFolder],
		cliPath: STORE_WRITER_CLI,
		probe: noRepositoryCli,
		now: LOT_HANDOVER_NOW,
	})
	if (written.exitCode !== 0) throw new Error(`could not write ${lot.lotFolder}: ${written.output}`)
	const [name] = entryNamesOf(lot.start.repository)
	return name
}

/** The folders every registry entry of the lot's repository holds, sorted by entry name. */
export function registeredFolders(lot: LotHandoverWorkspace): string[] {
	return entryNamesOf(lot.start.repository).map(function folderOf(name) {
		return (JSON.parse(readFileSync(entryPathOf({ lot, name }), 'utf8')) as { folder: string })
			.folder
	})
}

/** The path of the registry entry `name` of the lot's repository. */
export function entryPathOf(params: { lot: LotHandoverWorkspace; name: string }): string {
	return join(params.lot.start.workspace.registry, `${params.name}.json`)
}

/** A transition written by hand into the lot folder, as a later station or `lot stop` would. */
export function writeTransition(params: { lotFolder: string; transition: Transition }): void {
	writeRecordFile({
		folder: params.lotFolder,
		name: `transitions/${String(params.transition.seq).padStart(6, '0')}.json`,
		text: `${JSON.stringify(params.transition)}\n`,
	})
}

/** `lot status <argument> --json` read from the lot's main checkout. */
export function statusOf(params: { lot: LotHandoverWorkspace; argument: string }): {
	exitCode: number
	json: unknown
} {
	return withJson(
		runLot({ cwd: params.lot.start.repository, argv: ['status', params.argument, '--json'] }),
	)
}

/** The bytes of the lot folder, the registry and the locks of the lot's worktree and main checkout. */
export function bytesOf(lot: LotHandoverWorkspace): StoreBytes {
	return {
		lot: snapshotOf(lot.lotFolder),
		registry: snapshotOf(lot.start.workspace.registry),
		locks: [lot.worktree, lot.start.repository].map(function lockOf(root) {
			return readIfPresent(handoverLockPath(root))
		}),
	}
}

/** Whether the lot folder holds a file called `name`. */
export function lotFolderHolds(params: { lot: LotHandoverWorkspace; name: string }): boolean {
	return existsSync(join(params.lot.lotFolder, params.name))
}
