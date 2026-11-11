/**
 * Ids of lots (33S section 4, Ids): an index, a full name, a path to the lot folder, the `.dialecte/lot` link. The
 * stores are found without git: the store of `cwd` by its `.git` entry, the others from the user's store list.
 */
import { basename, join, resolve } from 'node:path'

import { isFolder, realPathOf } from '../file-system.ts'
import { isPathArgument } from '../handover/handover-store-read.ts'
import { textOf } from '../print/print.ts'
import { worktreeIndexOf } from '../worktree/worktree-index.ts'
import { WORKTREE_INDEX_DIGITS } from '../worktree/worktree.constants.ts'
import { readIdentity } from './identity.ts'
import { lotFolderOf } from './lot-folder.ts'
import { listLotFolderNames, listLotNames, locateStore, workTreeHolding } from './store-folder.ts'
import { readStoreList } from './store-list.ts'
import {
	ID_PATTERNS,
	INDEX_ID_PATTERN,
	LOT_LINK_SEGMENTS,
	THROWAWAY_NAME_PATTERN,
} from './store.constants.ts'

import type { PrintedText } from '../print/print.types.ts'
import type {
	LotNamesLister,
	LotRefusalLines,
	LotRequirement,
	LotResolution,
	ResolvedLot,
	ResolveMode,
} from './store.types.ts'

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
	return printedOf(resolvedLotOf(params))
}

/** `resolveLot` with a refusal as its lines, as written (the JSON form quotes them). */
function resolvedLotOf(params: { argument: string; cwd: string; mode: ResolveMode }): ResolvedLot {
	const { argument, cwd } = params
	const folder = resolve(cwd, argument)
	if (isPathArgument(argument) || !isIdShaped(argument)) return lotOrFolder(folder)
	const matches = matchingLots({ ...params, lotNamesOf: listLotNames })
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
	return ambiguousRefusal({ argument, matches })
}

/** A resolution with its refusal's lines printed through the boundary. */
function printedOf<Resolved extends object>(
	resolved: Resolved | LotRefusalLines,
): Resolved | { exitCode: 2; output: PrintedText } {
	return 'lines' in resolved ? { exitCode: 2, output: textOf(resolved.lines) } : resolved
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
	return printedOf(requiredLotOf(params))
}

/** `requireLot` with a refusal as its lines, as written: a lot verb prints them, or quotes them in its JSON. */
export function requiredLotOf(params: {
	argument: string
	cwd: string
	mode: ResolveMode
}): { lot: string } | LotRefusalLines {
	const resolved = resolvedLotOf(params)
	if ('lot' in resolved || 'lines' in resolved) return resolved
	const damaged = damagedLotOf({ ...params, folder: resolved.folder })
	if (damaged !== undefined) return damaged
	const { argument } = params
	const named =
		isPathArgument(argument) || isFolder(resolved.folder)
			? `${argument} is no lot folder (${resolved.folder})`
			: noLotRefusal(argument)
	return { exitCode: 2, lines: resolved.note === undefined ? [named] : [resolved.note, named] }
}

/**
 * The folder of the damaged lot an id names when it names no lot whose records hold (P2.1): a lot folder of the
 * stores (by index or full name, as `matchingLots` looks) whose identity does not read or name it, kept as the store
 * holds it (a link is not followed). The listing refusal when several match; undefined for a path, a word of no id's
 * shape, a folder of `cwd` of that name, or no match.
 */
function damagedLotOf(params: {
	argument: string
	cwd: string
	mode: ResolveMode
	folder: string
}): { lot: string } | LotRefusalLines | undefined {
	const { argument } = params
	if (isPathArgument(argument) || !isIdShaped(argument) || isFolder(params.folder)) return undefined
	const matches = matchingLots({ ...params, lotNamesOf: listLotFolderNames })
	if (matches.length === 0) return undefined
	if (matches.length === 1) return { lot: matches[0] }
	return ambiguousRefusal({ argument, matches })
}

/** The refusal of an index several lots hold: each listed with its folder. */
function ambiguousRefusal(params: { argument: string; matches: string[] }): LotRefusalLines {
	return {
		exitCode: 2,
		lines: [
			`${params.argument} names several lots: give the full name or the folder`,
			...params.matches.map((match) => `  ${basename(match)}  ${match}`),
		],
	}
}

/**
 * The refusal line of an id that names no lot (any more): `no lot <id>`, the id as the caller typed it; the print
 * boundary escapes it, so a word holding a line feed or an escape sequence prints as `\u{<hex>}`. Every lot verb
 * refuses an unknown id by it.
 */
export function noLotRefusal(argument: string): string {
	return `no lot ${argument}`
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

function lotOrFolder(folder: string): { lot: string } | { folder: string } {
	const lot = lotFolderOf({ folder })
	return lot ? { lot } : { folder }
}

/**
 * The lot folders (real paths) the word names. `read`: those of the store of `cwd` when it holds any, else those of
 * the other stores of the list; `write`: those of every store, each store counted once. `lotNamesOf` lists the lots
 * of a store looked at.
 */
function matchingLots(params: {
	argument: string
	cwd: string
	mode: ResolveMode
	lotNamesOf: LotNamesLister
}): string[] {
	const own = locateStore({ from: params.cwd })?.store
	const others = readStoreList({})
		.map(realPathOf)
		.filter((store) => store !== own)
	const word = params.argument
	const { lotNamesOf } = params
	const ownMatches = own === undefined ? [] : matchesIn({ store: own, word, lotNamesOf })
	const otherMatches = [...new Set(others)].flatMap((store) =>
		matchesIn({ store, word, lotNamesOf }),
	)
	if (params.mode === 'write') return [...ownMatches, ...otherMatches]
	return ownMatches.length > 0 ? ownMatches : otherMatches
}

/** The lots of `store` the word names: by full name, or by index (padded: `171` is `0171`). */
function matchesIn(params: { store: string; word: string; lotNamesOf: LotNamesLister }): string[] {
	const { store, word } = params
	const prefix = INDEX_ID_PATTERN.test(word)
		? `${word.padStart(WORKTREE_INDEX_DIGITS, '0')}-`
		: undefined
	return params
		.lotNamesOf({ store })
		.filter((name) => (prefix === undefined ? name === word : name.startsWith(prefix)))
		.map((name) => join(store, name))
}
