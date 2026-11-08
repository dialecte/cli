/**
 * Ids of lots (33S section 4, Ids): an index, a full name, a path to the lot folder, the `.dialecte/lot` link. The
 * stores are found without git: the store of `cwd` by its `.git` entry, the others from the user's store list.
 */
import { basename, join, resolve } from 'node:path'

import { isFolder, realPathOf } from '../file-system.ts'
import { isPathArgument } from '../handover/handover-store-read.ts'
import { worktreeIndexOf } from '../worktree/worktree-index.ts'
import { WORKTREE_INDEX_DIGITS } from '../worktree/worktree.constants.ts'
import { readIdentity } from './identity.ts'
import { lotFolderOf } from './lot-folder.ts'
import { listLotNames, locateStore, workTreeHolding } from './store-folder.ts'
import { readStoreList } from './store-list.ts'
import {
	ID_PATTERNS,
	INDEX_ID_PATTERN,
	LOT_LINK_SEGMENTS,
	THROWAWAY_NAME_PATTERN,
} from './store.constants.ts'

import type { LotRequirement, LotResolution, ResolveMode } from './store.types.ts'

/**
 * What `argument` names from `cwd`: the lot (real path of its folder), the folder (a word that is no id, or names
 * no lot; the review-round verbs take it as today), or an exit 2 refusal listing the lots an ambiguous index names.
 * `read`: exactly one match in the store of `cwd` decides; `write`: an index must be unique across every store.
 */
export function resolveLot(params: {
	argument: string
	cwd: string
	mode: ResolveMode
}): LotResolution {
	const { argument, cwd } = params
	const folder = resolve(cwd, argument)
	if (isPathArgument(argument) || !isIdShaped(argument)) return lotOrFolder(folder)
	const matches = matchingLots(params)
	if (isFolder(folder)) {
		const lot = lotFolderOf({ folder })
		if (lot) return { lot }
		if (matches.length === 0) return { folder }
		return {
			folder,
			note: `${argument} is the folder ./${argument}, not lot ${matches.map((match) => basename(match)).join(', ')}`,
		}
	}
	if (matches.length === 1) return { lot: matches[0] }
	if (matches.length === 0) return { folder }
	return {
		exitCode: 2,
		output: [
			`${argument} names several lots: give the full name or the folder`,
			...matches.map((match) => `  ${basename(match)}  ${match}`),
		].join('\n'),
	}
}

/**
 * `resolveLot` for a verb that needs a lot (`status`): the lot's folder, or exit 2 - `no lot <argument>` for
 * an unknown id, a refusal for a folder that is no lot, the listing for an ambiguous index.
 */
export function requireLot(params: {
	argument: string
	cwd: string
	mode: ResolveMode
}): LotRequirement {
	const resolved = resolveLot(params)
	if ('lot' in resolved || 'exitCode' in resolved) return resolved
	const { argument } = params
	const named =
		isPathArgument(argument) || isFolder(resolved.folder)
			? `${argument} is no lot folder (${resolved.folder})`
			: `no lot ${argument}`
	return {
		exitCode: 2,
		output: resolved.note === undefined ? named : `${resolved.note}\n${named}`,
	}
}

/**
 * The real path of the folder of the lot whose worktree holds `cwd` (through `.dialecte/lot`, or the identities of
 * the store of `cwd`), or whose review throwaway of the same index in the same store holds it; undefined for none.
 */
export function lotOfWorktree(params: { cwd: string }): string | undefined {
	const workTree = workTreeHolding({ from: params.cwd })
	if (workTree === undefined) return undefined
	const linked = lotFolderOf({ folder: join(workTree, ...LOT_LINK_SEGMENTS) })
	if (linked) return linked
	const store = locateStore({ from: workTree })?.store
	if (store === undefined) return undefined
	const lots = listLotNames({ store }).map((name) => join(store, name))
	const own = realPathOf(workTree)
	const holder = lots.find(function isOwnWorktree(lotFolder) {
		const worktree = readIdentity({ lotFolder })?.worktree
		return worktree !== null && worktree !== undefined && realPathOf(worktree) === own
	})
	if (holder) return holder
	const index = worktreeIndexOf(workTree)
	if (index === undefined || !THROWAWAY_NAME_PATTERN.test(basename(workTree))) return undefined
	return lots.find((lotFolder) => readIdentity({ lotFolder })?.index === index)
}

/** A word of an id's shape: digits, or four digits or more, a dash and the rest. */
function isIdShaped(word: string): boolean {
	return ID_PATTERNS.some((pattern) => pattern.test(word))
}

function lotOrFolder(folder: string): LotResolution {
	const lot = lotFolderOf({ folder })
	return lot ? { lot } : { folder }
}

/**
 * The lot folders (real paths) the word names. `read`: those of the store of `cwd` when it holds any, else those of
 * the other stores of the list; `write`: those of every store, each store counted once.
 */
function matchingLots(params: { argument: string; cwd: string; mode: ResolveMode }): string[] {
	const own = locateStore({ from: params.cwd })?.store
	const others = readStoreList({})
		.map(realPathOf)
		.filter((store) => store !== own)
	const word = params.argument
	const ownMatches = own === undefined ? [] : matchesIn({ store: own, word })
	const otherMatches = [...new Set(others)].flatMap((store) => matchesIn({ store, word }))
	if (params.mode === 'write') return [...ownMatches, ...otherMatches]
	return ownMatches.length > 0 ? ownMatches : otherMatches
}

/** The lots of `store` the word names: by full name, or by index (padded: `171` is `0171`). */
function matchesIn(params: { store: string; word: string }): string[] {
	const { store, word } = params
	const prefix = INDEX_ID_PATTERN.test(word)
		? `${word.padStart(WORKTREE_INDEX_DIGITS, '0')}-`
		: undefined
	return listLotNames({ store })
		.filter((name) => (prefix === undefined ? name === word : name.startsWith(prefix)))
		.map((name) => join(store, name))
}
