/**
 * The one reader of what a store lot holds (its worktree, its branch), files only: every remover asks it, each with
 * its own policy. A lot whose identity does not read is found through its root link and its registry entry.
 */
import { readlinkSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'

import { isPresent, realPathThroughAncestors } from '../file-system.ts'
import { entryOfFolder, readStoreEntries } from '../handover/handover-store-read.ts'
import { fillMessage } from '../knowledge/standard/fill-message.ts'
import { isStoreFolder } from './lot-folder.ts'
import { CLOSED_LOT_ITEM_REASON, LOT_RECORDS_UNREAD } from './lot-items.constants.ts'
import { keptByDecision, keptOfChecked } from './lot-keep.ts'
import { readCheckedLotState } from './lot-records.ts'
import { lotState } from './lot-state.ts'
import { listLotFolderNames, locateStore } from './store-folder.ts'
import {
	DAMAGED_STATE,
	LOT_FOLDER_NAME_PATTERN,
	LOT_KEEP_REASON,
	LOT_LINK_SEGMENTS,
	LOTS_KEEPING_NOTHING,
	TEMPORARY_FOLDER_PATTERN,
} from './store.constants.ts'

import type { StoreEntry } from '../handover/handover.types.ts'
import type { LotItem, LotItems, LotRecord } from './lot-items.types.ts'
import type { CheckedLotState } from './store.types.ts'

// dialecte-allow duplicate-read: the one reader of every lot's holds; lotItemsLeftOf only checks one lot's items on disk
/**
 * Every store lot of `repository`, files only, the registry read once: per-lot records and the keyed items. A lot
 * whose identity does not read takes its worktree and branch from the registry entry naming its folder; it is held
 * (damaged). A held lot (open, damaged or kept on purpose) wins a worktree or a branch a closed lot names too; the
 * first held lot wins among held ones.
 *
 * @intent read what every store lot holds once, for every remover
 * @internal
 */
export function readLotItems(params: { repository: string }): LotItems {
	const location = locateStore({ from: params.repository })
	if (location === undefined)
		return {
			store: undefined,
			entries: [],
			lots: [],
			byWorktree: new Map(),
			byBranch: new Map(),
			byLotFolder: new Map(),
		}
	const store = realPathThroughAncestors(location.store)
	const entries = readStoreEntries(location.registry)
	const read = listLotFolderNames({ store: location.store }).flatMap(function recordOf(name) {
		const lotFolder = join(store, name)
		const checked = readCheckedLotState({ lotFolder, registry: location.registry, entries })
		// a folder gone between the listing and its read holds nothing: it left the store
		if (checked === undefined) return []
		return [lotRecordOf({ name, lotFolder, checked, entries, main: params.repository })]
	})
	const ranked = read.map((one) => ({ ...one, rank: rankOf(one) }))
	return {
		store,
		entries,
		lots: read.map((one) => one.record),
		byWorktree: winnersBy({
			ranked,
			keyOf: (record) => (record.worktree === undefined ? undefined : keyOf(record.worktree)),
		}),
		byBranch: winnersBy({ ranked, keyOf: (record) => record.branch }),
		byLotFolder: new Map(read.map(({ record, item }) => [record.lotFolder, item])),
	}
}

/**
 * The item of the lot a worktree or branch is its own, on the keys asked: the worktree, the branch, and with `link`
 * the lot the worktree's root `.dialecte/lot` link names; the held one first; undefined for none. A link to a store
 * child not read with `items` holds when that child is present now (made since, or a dangling link); a child gone or
 * moved aside holds nothing.
 *
 * @intent tell a remover which lot holds a worktree or branch
 * @internal
 */
export function lotItemOf(params: {
	items: LotItems
	worktree?: string
	branch?: string
	link?: boolean
}): LotItem | undefined {
	const { items, worktree, branch } = params
	const candidates = [
		worktree === undefined ? undefined : items.byWorktree.get(keyOf(worktree)),
		branch === undefined ? undefined : items.byBranch.get(branch),
		params.link === true && worktree !== undefined
			? linkedItemOf({ items, worktree: keyOf(worktree) })
			: undefined,
	].filter((candidate) => candidate !== undefined)
	return candidates.find((candidate) => candidate.held) ?? candidates[0]
}

// dialecte-allow duplicate-read: realStoreChildOf resolves the child itself and needs it present; this one names it by path
/**
 * The real path of the store child `path` names, present or not, with its store; undefined when it names none. The
 * child is never resolved itself: a store child that is a link stays the store's child.
 *
 * @intent name a store lot folder by its path, even once it is gone
 * @internal
 */
export function storeChildOf(params: {
	path: string
}): { store: string; child: string } | undefined {
	const path = resolve(params.path)
	const name = basename(path)
	if (!LOT_FOLDER_NAME_PATTERN.test(name) || TEMPORARY_FOLDER_PATTERN.test(name)) return undefined
	const store = realPathThroughAncestors(dirname(path))
	// `lotNameOfPath` resolves the child itself (a link out of the store would leave it): the store's rule, on the parent
	if (!isStoreFolder(store)) return undefined
	return { store, child: join(store, name) }
}

/**
 * One lot's record (its worktree and branch from its identity, else from the registry entry naming its folder) and its
 * item: held when open, damaged or kept on purpose; its reason a damaged lot's kept text else `lot <name> damaged`, an
 * open lot's `lot <name> <state>`, a closed lot's kept text else its own item naming `lot prune`.
 */
function lotRecordOf(params: {
	name: string
	lotFolder: string
	checked: CheckedLotState
	entries: readonly StoreEntry[]
	main: string
}): { record: LotRecord; item: LotItem } {
	const { name, lotFolder, checked } = params
	const identity = 'damage' in checked ? checked.identity : checked.input.identity
	const entry =
		identity === undefined
			? entryOfFolder({ entries: params.entries, folder: lotFolder })
			: undefined
	const worktree = identity === undefined ? entry?.worktree : identity.worktree
	const branch = identity === undefined ? entry?.branch : identity.branch
	const kept = keptOfChecked({ name, checked })
	const state = 'damage' in checked ? DAMAGED_STATE : lotState(checked.input).state
	const keptOnPurpose = keptByDecision({ keep: checked.keep })
	const open = !LOTS_KEEPING_NOTHING.some((closed) => closed === state)
	const openReason = fillMessage({ template: LOT_KEEP_REASON, values: { name, state } })
	const reason =
		state === DAMAGED_STATE
			? (keptOnPurpose ?? openReason)
			: open
				? openReason
				: (keptOnPurpose ??
					fillMessage({ template: CLOSED_LOT_ITEM_REASON, values: { lot: name, state } }))
	return {
		record: {
			name,
			lotFolder,
			...(typeof worktree === 'string' && { worktree }),
			...(branch !== undefined && { branch }),
			state,
			...(kept !== undefined && { kept }),
			main: params.main,
		},
		item: {
			lot: name,
			lotFolder,
			...(branch !== undefined && { branch }),
			held: open || keptOnPurpose !== undefined,
			reason,
		},
	}
}

/** Which item wins a shared key: an open (or damaged) lot's, then a closed lot kept on purpose, then a closed lot's. */
function rankOf(params: { record: LotRecord; item: LotItem }): number {
	if (!LOTS_KEEPING_NOTHING.some((closed) => closed === params.record.state)) return 2
	return params.item.held ? 1 : 0
}

/** Each key's item: the highest ranked lot naming it, the first of a rank winning. */
function winnersBy(params: {
	ranked: readonly { record: LotRecord; item: LotItem; rank: number }[]
	keyOf: (record: LotRecord) => string | undefined
}): Map<string, LotItem> {
	const winners = new Map<string, { item: LotItem; rank: number }>()
	for (const one of params.ranked) {
		const key = params.keyOf(one.record)
		if (key === undefined) continue
		const there = winners.get(key)
		if (there === undefined || one.rank > there.rank) winners.set(key, one)
	}
	return new Map([...winners].map(([key, winner]) => [key, winner.item]))
}

/** The item of the lot the worktree's root link names, in the store `items` was read from. */
function linkedItemOf(params: { items: LotItems; worktree: string }): LotItem | undefined {
	const { items } = params
	if (items.store === undefined) return undefined
	const link = join(params.worktree, ...LOT_LINK_SEGMENTS)
	let target: string
	try {
		target = readlinkSync(link)
	} catch {
		// no link there, or no link at all: it names no lot
		return undefined
	}
	// a relative target resolves from the link's real folder: a `.dialecte` that is itself a link resolves right
	const named = storeChildOf({ path: resolve(realPathThroughAncestors(dirname(link)), target) })
	if (named === undefined || named.store !== items.store) return undefined
	const item = items.byLotFolder.get(named.child)
	if (item !== undefined) return item
	// a lot folder made since the read, or a dangling link, holds: its records were not read; a folder gone holds nothing
	if (!isPresent(named.child)) return undefined
	const name = basename(named.child)
	return {
		lot: name,
		lotFolder: named.child,
		held: true,
		reason: fillMessage({ template: LOT_RECORDS_UNREAD, values: { name } }),
	}
}

/** The one key of every worktree and argument: its real path through its existing ancestors. */
function keyOf(path: string): string {
	return realPathThroughAncestors(resolve(path))
}
