/**
 * Committed hand-overs of real worktrees, for the cases where `lot close` keeps the lot's final record before it moves
 * the worktree: the hand-over is written and committed by the store's own writers (no code of `lot close` under test
 * here), the hook record and the log are plain files.
 */
import {
	appendFileSync,
	chmodSync,
	mkdirSync,
	readFileSync,
	realpathSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs'
import { join } from 'node:path'

import { runLotClose } from '../src/commands/lot-close.ts'
import {
	handoverStoreOf,
	recordHandoverState,
	registeredEntryOf,
} from '../src/lib/handover/handover-store.ts'
import { createBriefWorkspace, writeStoreLot } from './brief-workspace.ts'
import { gitPathOf } from './gate-records.ts'
import { commitLotByHand, storeOf, writeStoreHandover } from './handover-store-scenario.ts'
import {
	ASK_FILE_NAME,
	CANCELED_AT,
	FINAL_RECORD_LOG_NAME,
	FINAL_RECORD_NOW,
	HOOK_RECORD_AT,
	HOOK_RECORD_NAME,
	LOT_SOURCE_FILE,
	PROBE_MARKER_NAME,
} from './lot-close-final-record.constants.ts'
import { git, temporaryFolder } from './scratch-repository.ts'
import { transitionOf, writeRecordFile } from './store-records.ts'
import { createRecordingSpawner } from './worktree-pool.ts'

import { vi } from 'vitest'

import type { BriefWorkspace } from './brief-workspace.types.ts'
import type {
	ClosableHandover,
	ClosingResult,
	HandoverPlace,
	LogLine,
	LotCommit,
} from './lot-close-final-record.types.ts'

/**
 * A worktree `.worktrees/<index>-repo-<tail>` on `feat/<tail>` whose hand-over is written, its lot committed (or, with
 * `commit: 'foreign'`, another commit made in its place) and recorded committed. In the store (`place: 'store'`) the
 * hand-over folder is the lot folder of a lot naming the worktree; outside, a folder of its own. A second hand-over of
 * the same repository passes the first one's `workspace`.
 */
export function createClosableHandover(params: {
	index: string
	tail: string
	place: HandoverPlace
	commit?: LotCommit
	workspace?: BriefWorkspace
	/** The state the hand-over is recorded in; `abandoned` also cancels the lot of the store. Default: committed. */
	state?: 'committed' | 'abandoned'
	/**
	 * Another hand-over of the same worktree: this one is written in it after the first, in a file of its own, and is
	 * registered under its own name (two hand-overs reaching one worktree). Only for a hand-over outside the store.
	 */
	sharing?: ClosableHandover
	/**
	 * With `sharing`: the worktree is switched to this new branch, cut at the commit the first hand-over started from
	 * (the first one's lots stay on its own branch, not on this worktree's HEAD). Default: the shared branch.
	 */
	branch?: string
}): ClosableHandover {
	const workspace = params.sharing?.workspace ?? params.workspace ?? createBriefWorkspace()
	const lotName = `${params.index}-repo-${params.tail}`
	const branch = params.branch ?? params.sharing?.branch ?? `feat/${params.tail}`
	const sourceFile = params.sharing === undefined ? LOT_SOURCE_FILE : `src/close-${params.tail}.ts`
	const worktree = params.sharing?.worktree ?? addClosableWorktree({ workspace, lotName, branch })
	if (params.sharing !== undefined && params.branch !== undefined)
		git({ root: worktree, args: ['switch', '-q', '-c', params.branch, params.sharing.base] })
	const base = git({ root: worktree, args: ['rev-parse', 'HEAD'] }).trim()
	const lotFolder =
		params.place === 'store'
			? realpathSync(
					writeStoreLot({
						workspace,
						name: lotName,
						scope: ['src/'],
						branch,
						worktree,
					}),
				)
			: undefined
	const written = writeStoreHandover({
		root: worktree,
		name: params.tail,
		changes: { [sourceFile]: 'export {}\n' },
		folder: lotFolder,
	})
	const folder = realpathSync(written.folder)
	// a canceled lot takes no hand-over: it is canceled once the hand-over is written
	if (lotFolder !== undefined && params.state === 'abandoned')
		writeRecordFile({
			folder: lotFolder,
			name: 'transitions/000002.json',
			text: `${JSON.stringify({
				...transitionOf({ seq: 2, state: 'canceled', kind: 'stop', at: CANCELED_AT }),
				simulated: false,
			})}\n`,
		})
	commitLotByHand({
		root: worktree,
		paths: [sourceFile],
		message:
			params.commit === 'foreign' ? 'feat: another change' : `feat(read): change ${params.tail}`,
	})
	recordHandoverState({
		store: handoverStoreOf(workspace.repository),
		folder,
		state: params.state ?? 'committed',
	})
	const handover = registeredEntryOf({ store: workspace.registry, folder })?.name
	if (handover === undefined) throw new Error(`no registry entry for ${folder}`)
	return {
		workspace,
		lotName,
		handover,
		worktree,
		branch,
		base,
		tip: git({ root: worktree, args: ['rev-parse', 'HEAD'] }).trim(),
		folder,
		lotFolder,
	}
}

/**
 * A committed hand-over of a worktree, written with a located lot: its lot is written (the store's writer),
 * committed on the worktree and the hand-over recorded committed, then the hook record moved to the new HEAD. Its
 * registered name, and the commit its lot is found at (the worktree's HEAD then).
 */
export function registerCommittedHandover(params: { worktree: string; tail: string }): {
	name: string
	head: string
} {
	const { worktree, tail } = params
	const written = writeStoreHandover({
		root: worktree,
		name: tail,
		changes: { [`src/close-${tail}.ts`]: 'export {}\n' },
	})
	const folder = realpathSync(written.folder)
	commitLotByHand({
		root: worktree,
		paths: [`src/close-${tail}.ts`],
		message: `feat(read): change ${tail}`,
	})
	const store = handoverStoreOf(worktree)
	recordHandoverState({ store, folder, state: 'committed' })
	writeHookRecordAtHead(worktree)
	const name = registeredEntryOf({ store, folder })?.name
	if (name === undefined) throw new Error(`no registry entry for ${folder}`)
	return { name, head: git({ root: worktree, args: ['rev-parse', 'HEAD'] }).trim() }
}

/** A worktree `.worktrees/<lotName>` of the workspace's repository on a new branch; its real path. */
function addClosableWorktree(params: {
	workspace: BriefWorkspace
	lotName: string
	branch: string
}): string {
	const path = join(params.workspace.workspace, '.worktrees', params.lotName)
	git({
		root: params.workspace.repository,
		args: ['worktree', 'add', '-q', '-b', params.branch, path],
	})
	return realpathSync(path)
}

/** The record the last commit hook of the worktree left (in its own git folder), saying it let `head` through. */
export function writeHookRecord(params: { worktree: string; head: string }): void {
	writeFileSync(
		gitPathOf({ root: params.worktree, name: HOOK_RECORD_NAME }),
		JSON.stringify({
			mode: 'hook',
			at: HOOK_RECORD_AT,
			head: params.head,
			stateHash: '',
			steps: [],
		}),
	)
}

/** The hook record of a worktree whose lot is committed: its HEAD is the commit the lot ended at. */
export function writeHookRecordAtHead(worktree: string): void {
	writeHookRecord({ worktree, head: git({ root: worktree, args: ['rev-parse', 'HEAD'] }).trim() })
}

/** The path of the log of the final records of the workspace's repository. */
export function logPathOf(workspace: BriefWorkspace): string {
	return join(workspace.registry, FINAL_RECORD_LOG_NAME)
}

/** The log's text; empty when there is no log (nor folder at its path). */
export function logTextOf(workspace: BriefWorkspace): string {
	const path = logPathOf(workspace)
	try {
		return readFileSync(path, 'utf8')
	} catch {
		return ''
	}
}

/** The lines of the log, parsed. */
export function logLinesOf(workspace: BriefWorkspace): LogLine[] {
	return logTextOf(workspace)
		.split('\n')
		.filter(Boolean)
		.map((text) => JSON.parse(text) as LogLine)
}

/** The `card` lines of the log of the repository `repository` (its main checkout), parsed; none without a log. */
export function cardLinesOf(params: { repository: string }): LogLine[] {
	try {
		return readFileSync(join(storeOf(params.repository), FINAL_RECORD_LOG_NAME), 'utf8')
			.split('\n')
			.filter(Boolean)
			.map((text) => JSON.parse(text) as LogLine)
			.filter((line) => line.kind === 'card')
	} catch {
		return []
	}
}

/** Appends a `card` line of the lot, as the hand-over's own run writes it (its key: name, lot, state, head). */
export function appendRunCardLine(params: {
	lot: ClosableHandover
	head: string
	/** The state the line says: committed unless given. */
	state?: 'committed' | 'canceled'
}): LogLine {
	const line: LogLine = {
		schema: 1,
		kind: 'card',
		at: HOOK_RECORD_AT,
		lot: params.lot.lotFolder === undefined ? null : params.lot.lotName,
		name: params.lot.handover,
		state: params.state ?? 'committed',
		feature: null,
		repository: realpathSync(params.lot.workspace.repository),
		branch: params.lot.branch,
		head: params.head,
		base: null,
		card: null,
		usage: null,
		records: null,
		by: 'handover-run',
	}
	mkdirSync(params.lot.workspace.registry, { recursive: true })
	appendFileSync(logPathOf(params.lot.workspace), `${JSON.stringify(line)}\n`)
	return line
}

/** The log can no longer be appended to: a read-only file (a hand-over's own card line may be there already). */
export function makeLogReadOnly(workspace: BriefWorkspace): void {
	chmodSync(logPathOf(workspace), 0o444)
}

/** A folder where the log should be: nothing can be appended there nor read. */
export function putFolderAtLog(workspace: BriefWorkspace): void {
	mkdirSync(logPathOf(workspace), { recursive: true })
}

/** The log is a link to /dev/null: every write succeeds and nothing can be read back. */
export function linkLogToNull(workspace: BriefWorkspace): void {
	mkdirSync(workspace.registry, { recursive: true })
	symlinkSync('/dev/null', logPathOf(workspace))
}

/** A file where the trash folder should be: the move cannot be made. */
export function putFileAtTrash(workspace: BriefWorkspace): void {
	mkdirSync(join(workspace.workspace, '.worktrees'), { recursive: true })
	writeFileSync(join(workspace.workspace, '.worktrees', '_trash'), 'not a folder\n')
}

/** An ask of the lot, holding the text, in its `asks/` folder. */
export function writeAskText(params: { lotFolder: string; text: string }): void {
	const folder = join(params.lotFolder, 'asks')
	mkdirSync(folder, { recursive: true })
	writeFileSync(join(folder, ASK_FILE_NAME), JSON.stringify({ text: params.text }))
}

/**
 * Puts an `npx` in front of the real one that leaves a marker file when started (the probe a hand-over card makes
 * spawns it); the marker's path. The caller restores the environment (`vi.unstubAllEnvs`).
 */
export function trapProbe(): string {
	const bin = temporaryFolder('dialecte-fake-bin-')
	const marker = join(bin, PROBE_MARKER_NAME)
	const script = join(bin, 'npx')
	writeFileSync(script, `#!/bin/sh\ntouch '${marker}'\nexit 1\n`)
	chmodSync(script, 0o755)
	vi.stubEnv('PATH', `${bin}:${process.env.PATH ?? ''}`)
	return marker
}

/** `lot close <names> --json` from the main checkout at the cases' time, the background removals recorded. */
export function closing(params: { workspace: BriefWorkspace; names: string[] }): ClosingResult {
	const { spawner, calls } = createRecordingSpawner()
	const result = runLotClose({
		cwd: params.workspace.repository,
		argv: [...params.names, '--json'],
		now: FINAL_RECORD_NOW,
		spawner,
		listProcesses: function none() {
			return []
		},
		// no scratch root: the machine's own temporary folders are never scanned
		scratchRoots: [],
	})
	return { exitCode: result.exitCode, outcomes: JSON.parse(result.output) as unknown, calls }
}
