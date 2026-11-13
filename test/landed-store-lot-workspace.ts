/**
 * Lots whose hand-over was committed outside their own folder, on a scratch workspace: the lot's records are written
 * by hand (no lot is started), the worktrees, the branches, the merges and the registry entries are real, written by the
 * store's own writers.
 */
import { readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import {
	handoverStoreOf,
	recordHandoverClosed,
	recordHandoverState,
	registerHandover,
} from '../src/lib/handover/handover-store.ts'
import { HANDOVER_RUN_MARKER_FILE } from '../src/lib/handover/handover.constants.ts'
import { writeStoreLot } from './brief-workspace.ts'
import { headOf } from './handover-store-scenario.ts'
import {
	LANDED_CLOSED_AT,
	LANDED_LOT,
	LANDED_MAIN_COMMIT,
	LANDED_MERGE_MESSAGE,
	LANDED_WRITTEN,
	mainSideFileOf,
	OTHER_BRANCH,
	RESUMED_AT,
} from './landed-store-lot-workspace.constants.ts'
import { writeHookRecordAtHead } from './lot-close-final-record.ts'
import { KEEP_SCOPE } from './lot-keep-workspace.constants.ts'
import { addBareWorktree } from './lot-keep-workspace.ts'
import { git, temporaryFolder, writeFiles } from './scratch-repository.ts'
import { transitionOf, writeRecordFile } from './store-records.ts'

import type { BriefWorkspace } from './brief-workspace.types.ts'
import type {
	LandedHandover,
	LandedLot,
	LandedMerge,
	RegisteredHandover,
} from './landed-store-lot-workspace.types.ts'

/**
 * The lot `name` (a store lot with no later transition: `working`) and the real worktree its identity names, on
 * `feat/<tail>` with one commit of its own. Its identity's base is the commit `main` held when the branch was made.
 * `merge` puts the branch on `main`. `handovers` (one committed by default) are registered in folders of their own,
 * outside the lot folder, by the store's writer; a committed one leaves its hook record at the worktree's HEAD.
 */
export function addLandedLot(params: {
	workspace: BriefWorkspace
	name?: string
	merge: LandedMerge
	handovers?: LandedHandover[]
	scope?: string[]
	dirty?: boolean
	/** A registry entry for the lot's own folder, in this state (none by default). */
	registry?: 'pending' | 'committed'
	/** The first hand-over is closed (as `lot close` records it). */
	closed?: boolean
	/** The lot resumed after its hand-over: a `working` transition written after the hand-over's time. */
	resumed?: boolean
	/** A run of this process is live on the lot folder (its run marker). */
	liveRun?: boolean
}): LandedLot {
	const { workspace, merge } = params
	const name = params.name ?? LANDED_LOT
	const base = headOf(workspace.repository)
	const bare = addBareWorktree({ workspace, name, merged: false, dirty: params.dirty })
	landOnMain({ workspace, branch: bare.branch, merge, tail: tailOf(name) })
	const lotFolder = realpathSync(
		writeStoreLot({
			workspace,
			name,
			scope: params.scope ?? KEEP_SCOPE,
			branch: bare.branch,
			worktree: bare.worktree,
			repository: workspace.repository,
			registry: params.registry,
		}),
	)
	replaceIdentityBase({ lotFolder, commit: base })
	const lot = { ...bare, lotFolder }
	const handovers = (params.handovers ?? [{ state: 'committed' }]).map((handover) =>
		registerFor({ workspace, lot, handover }),
	)
	if (params.closed === true)
		recordHandoverClosed({
			store: handoverStoreOf(workspace.repository),
			name: handovers[0].name,
			at: LANDED_CLOSED_AT,
		})
	if (params.resumed === true)
		writeRecordFile({
			folder: lotFolder,
			name: 'transitions/000002.json',
			text: `${JSON.stringify(transitionOf({ seq: 2, at: RESUMED_AT }))}\n`,
		})
	if (params.liveRun === true)
		writeRecordFile({
			folder: lotFolder,
			name: HANDOVER_RUN_MARKER_FILE,
			text: `${JSON.stringify({ pid: process.pid, startedAt: RESUMED_AT })}\n`,
		})
	return { ...lot, base, handovers }
}

/** The line a landed lot gives, with the folder its hand-over was committed in. */
export function landedLineText(params: { lot: string; folder: string; target: string }): string {
	return `lot ${params.lot} committed: hand-over committed in ${params.folder}, branch on ${params.target}`
}

/** `<index>-repo-<tail>`: the tail names the branch and the worktree's files. */
function tailOf(name: string): string {
	return name.split('-').slice(2).join('-')
}

/** Puts `branch` on `main` as `merge` says: a fast-forward, or a merge commit after `main` moved on. */
function landOnMain(params: {
	workspace: BriefWorkspace
	branch: string
	merge: LandedMerge
	tail: string
}): void {
	const root = params.workspace.repository
	if (params.merge === 'fast-forward')
		git({ root, args: ['merge', '-q', '--ff-only', params.branch] })
	if (params.merge !== 'merge-commit') return
	writeFiles({
		root,
		files: { [mainSideFileOf(params.tail)]: 'export {}\n' },
	})
	git({ root, args: ['add', '-A'] })
	git({ root, args: ['commit', '-q', '-m', LANDED_MAIN_COMMIT] })
	git({ root, args: ['merge', '-q', '--no-ff', '-m', LANDED_MERGE_MESSAGE, params.branch] })
}

/** The hand-over `handover` registered for the lot, in a folder of its own; committed ones leave the hook record. */
function registerFor(params: {
	workspace: BriefWorkspace
	lot: Omit<LandedLot, 'base' | 'handovers'>
	handover: LandedHandover
}): RegisteredHandover {
	const { workspace, lot, handover } = params
	const names = handover.names ?? 'lot'
	const root =
		names === 'other-worktree'
			? addBareWorktree({
					workspace,
					name: `0090-repo-${lot.branch.replace('feat/', '')}-elsewhere`,
					merged: false,
				}).worktree
			: lot.worktree
	const folder = realpathSync(temporaryFolder('dialecte-handover-'))
	const name = registerHandover({
		root,
		folder,
		branch: names === 'other-branch' ? OTHER_BRANCH : lot.branch,
		now: LANDED_WRITTEN,
	})
	if (handover.state !== 'pending')
		recordHandoverState({
			store: handoverStoreOf(workspace.repository),
			folder,
			state: handover.state,
		})
	if (handover.state === 'committed') writeHookRecordAtHead(root)
	return { name, folder }
}

/** Rewrites the lot's `identity.json` so that its base is `commit` (a published file is read-only, a hand replaces it). */
function replaceIdentityBase(params: { lotFolder: string; commit: string }): void {
	const path = join(params.lotFolder, 'identity.json')
	const identity = JSON.parse(readFileSync(path, 'utf8')) as {
		base: { ref: string; commit: string }
	}
	rmSync(path, { force: true })
	writeFileSync(
		path,
		`${JSON.stringify({ ...identity, base: { ...identity.base, commit: params.commit } })}\n`,
	)
}

/**
 * Deletes the branch `branch` of the workspace's repository (`git branch -D`), after detaching the worktree that holds
 * it checked out, wherever that worktree is now (a closed one waits in the trash).
 */
export function deleteLotBranch(params: { workspace: BriefWorkspace; branch: string }): void {
	const root = params.workspace.repository
	const listed = git({ root, args: ['worktree', 'list', '--porcelain'] }).split('\n\n')
	const holder = listed.find((block) => block.includes(`branch refs/heads/${params.branch}`))
	const path = holder?.split('\n')[0].replace('worktree ', '')
	if (path !== undefined) git({ root: path, args: ['switch', '-q', '--detach'] })
	git({ root, args: ['branch', '-D', params.branch] })
}

/** Rewrites the lot's `identity.json` with `worktree` null (a published file is read-only, a hand replaces it). */
export function clearIdentityWorktree(lotFolder: string): void {
	const path = join(lotFolder, 'identity.json')
	const identity = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
	rmSync(path, { force: true })
	writeFileSync(path, `${JSON.stringify({ ...identity, worktree: null })}\n`)
}

/** Rewrites the registry entry `name` of the workspace with a `written` that is no time. */
export function damageEntryWritten(params: { workspace: BriefWorkspace; name: string }): void {
	const path = join(params.workspace.registry, `${params.name}.json`)
	const entry = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
	rmSync(path, { force: true })
	writeFileSync(path, JSON.stringify({ ...entry, written: 'not a time' }))
}

/** A second store lot that names the worktree of `lot` but another branch: it stays `working` whatever the lot does. */
export function addLotSharingWorktree(params: {
	workspace: BriefWorkspace
	lot: LandedLot
	name: string
}): string {
	return realpathSync(
		writeStoreLot({
			workspace: params.workspace,
			name: params.name,
			scope: KEEP_SCOPE,
			branch: OTHER_BRANCH,
			worktree: params.lot.worktree,
			repository: params.workspace.repository,
		}),
	)
}
