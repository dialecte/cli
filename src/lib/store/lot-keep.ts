/**
 * The keep rule the lot store adds to `worktree prune` and `lot close` (33S section 11): a worktree an open lot names
 * stays. Reads the repository's store once, files only: no git process. A lot that landed holds its landed fact
 * (written by the verbs that act on its merge), so it reads committed and keeps nothing.
 */
import { basename, join } from 'node:path'

import { realPathOf } from '../file-system.ts'
import { readStoreEntries } from '../handover/handover-store-read.ts'
import { fillMessage } from '../knowledge/standard/fill-message.ts'
import { KEEP_DAY_LENGTH, KEEP_TEXTS } from './keep-decisions.constants.ts'
import { readCheckedLotState, registryOfLotFolder } from './lot-records.ts'
import { lotState } from './lot-state.ts'
import { listLotFolderNames, locateStore } from './store-folder.ts'
import {
	DAMAGED_STATE,
	LOT_KEEP_REASON,
	LOTS_KEEPING_NOTHING,
	NEXT_COMMANDS,
	STORE_FILES,
} from './store.constants.ts'

import type { KeepDecision } from './keep-decisions.types.ts'
import type { CheckedLotState } from './store.types.ts'

/**
 * The worktrees the open lots of the store of `repository` name (not `committed` nor `canceled`), by real path, each
 * with its reason `lot <full name> <state>`; a damaged lot whose identity reads is open until a person moves it aside.
 * A closed lot kept on purpose (`keep.jsonl`) keeps its worktree too, with its kept text (KEEP 3.5.1). A lot without a
 * worktree is left out; an open lot's reason wins a worktree a kept lot names too; a repository without a store keeps
 * nothing.
 */
export function lotsKeepingWorktrees(params: { repository: string }): ReadonlyMap<string, string> {
	const kept = new Map<string, string>()
	const openPaths = new Set<string>()
	const location = locateStore({ from: params.repository })
	if (location === undefined) return kept
	const { store, registry } = location
	// the registry read once for every lot of the store
	const entries = readStoreEntries(registry)
	for (const name of listLotFolderNames({ store })) {
		const checked = readCheckedLotState({ lotFolder: join(store, name), registry, entries })
		if (checked === undefined) continue
		const identity = 'damage' in checked ? checked.identity : checked.input.identity
		const worktree = identity?.worktree
		if (typeof worktree !== 'string') continue
		const real = realPathOf(worktree)
		const state = 'damage' in checked ? DAMAGED_STATE : lotState(checked.input).state
		const closed = LOTS_KEEPING_NOTHING.some((nothing) => nothing === state)
		if (!closed) {
			// an open lot wins a worktree a kept closed lot names too; never another open lot's
			if (!openPaths.has(real))
				kept.set(real, LOT_KEEP_REASON.replace('{name}', name).replace('{state}', state))
			openPaths.add(real)
			continue
		}
		const keptText = keptByDecision({ keep: checked.keep })
		if (keptText !== undefined && !kept.has(real)) kept.set(real, keptText)
	}
	return kept
}

/**
 * The one text of a lot's keep (KEEP 3.2): `kept by decision: <why> (by <who>, <date>)`, or the text of a keep file
 * that cannot be trusted; undefined when the lot is not kept.
 */
export function keptByDecision(params: { keep: KeepDecision | undefined }): string | undefined {
	const { keep } = params
	if (keep === undefined) return undefined
	if ('unreadable' in keep)
		return fillMessage({
			template: KEEP_TEXTS.unreadableLines,
			values: { file: STORE_FILES.keep, count: String(keep.unreadable) },
		})
	if ('unreadableFile' in keep)
		return fillMessage({
			template: KEEP_TEXTS.unreadableFile,
			values: { file: STORE_FILES.keep, code: keep.unreadableFile },
		})
	return fillMessage({
		template: KEEP_TEXTS.kept,
		values: {
			reason: keep.kept.reason,
			by: keep.kept.by,
			day: keep.kept.at.slice(0, KEEP_DAY_LENGTH),
		},
	})
}

/**
 * The keep of one lot read again at the move (KEEP 3.2): its kept text; for a damaged lot not kept, its damaged text;
 * for a folder gone, that it is no longer in the store; undefined when the lot is not kept and its records hold.
 */
export function keptByDecisionOf(params: { lotFolder: string }): string | undefined {
	const { lotFolder } = params
	const name = basename(lotFolder)
	const checked = readCheckedLotState({ lotFolder, registry: registryOfLotFolder(lotFolder) })
	// fail closed where it cannot tell: a folder gone, or a damaged lot, holds every item
	if (checked === undefined) return fillMessage({ template: KEEP_TEXTS.gone, values: { name } })
	return keptOfChecked({ name, checked })
}

/**
 * The keep text of a lot already read (`keptByDecisionOf`'s rule on a checked result): its kept text; for a damaged lot
 * not kept, its damaged text; undefined when the lot is not kept and its records hold.
 */
export function keptOfChecked(params: {
	name: string
	checked: CheckedLotState
}): string | undefined {
	const { name, checked } = params
	const kept = keptByDecision({ keep: checked.keep })
	if (kept !== undefined || !('damage' in checked)) return kept
	return fillMessage({ template: KEEP_TEXTS.damaged, values: { name, damage: checked.damage } })
}

/**
 * The one next of a kept lot (KEEP 3.2): its `lot unkeep` command; for a keep file that cannot be trusted, its repair
 * by hand first.
 */
export function keepNextOf(params: { name: string; keep: KeepDecision }): string {
	const { name, keep } = params
	const next = fillMessage({ template: NEXT_COMMANDS.unkeep, values: { name } })
	if ('unreadable' in keep)
		return fillMessage({
			template: KEEP_TEXTS.repairLinesNext,
			values: { file: STORE_FILES.keep, count: String(keep.unreadable), next },
		})
	if ('unreadableFile' in keep)
		return fillMessage({
			template: KEEP_TEXTS.repairFileNext,
			values: { file: STORE_FILES.keep, code: keep.unreadableFile, next },
		})
	return next
}
