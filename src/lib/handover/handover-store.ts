/**
 * The registry of hand-overs: `<git-common-dir>/dialecte-handover/`, shared by every worktree of the
 * repository. Each hand-over written has one entry `<name>.json` (`{ folder, branch, worktree, index, written,
 * state }`, `index` only for a numbered worktree) pointing to its folder, which stays where it was written (the
 * lots file's folder, or `--out`). The name is `<yyyy-mm-dd>-<branch slug>[-<n>]`; a folder registered already
 * (same real path) keeps its name. An argument may name an entry by its name, or by its worktree's index.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { commonGitFolderOf } from '../git.ts'
import { worktreeIndexOf } from '../worktree/worktree-index.ts'
import {
	entryPathOf,
	isPathArgument,
	readStoreEntries,
	readStoreEntry,
	registeredEntryOf,
} from './handover-store-read.ts'
import {
	HANDOVER_STORE_FOLDER,
	STORE_INDEX_ARGUMENT_PATTERN,
	STORE_NAME_COUNTER_PATTERN,
	STORE_NAME_DATE_PATTERN,
	STORE_NAME_EDGE_DASHES,
	STORE_NAME_FIRST_COUNTER,
	STORE_NAME_REPLACED_CHARACTERS,
} from './handover.constants.ts'

import type {
	HandoverEntryState,
	HandoverStoreEntry,
	InterleavingSeam,
	StoreEntry,
	StoreNameRank,
} from './handover.types.ts'

export { readStoreEntries, registeredEntryOf } from './handover-store-read.ts'

/** The store of the repository `root` belongs to (a linked worktree answers its main repository's). */
export function handoverStoreOf(root: string): string {
	return join(commonGitFolderOf(root), HANDOVER_STORE_FOLDER)
}

/** The store of `root`, or undefined when `root` is in no repository (gone, or never one). */
export function findHandoverStore(root: string): string | undefined {
	if (!existsSync(root)) return undefined
	try {
		return handoverStoreOf(root)
	} catch {
		return undefined
	}
}

/** The name the next hand-over of `branch` takes in `store`, dated from `now` (local date). */
export function nextHandoverName(params: { store: string; branch: string; now: Date }): string {
	const base = `${localDate(params.now)}-${branchSlug(params.branch)}`
	// only an entry takes a name: a folder of the same name in the store registers nothing
	function isFree(name: string): boolean {
		return !existsSync(entryPathOf({ store: params.store, name }))
	}
	if (isFree(base)) return base
	for (let counter = STORE_NAME_FIRST_COUNTER; ; counter++)
		if (isFree(`${base}-${counter}`)) return `${base}-${counter}`
}

/**
 * The folder an argument of `show`, `run` or `abandon` names: a word without a path separator naming an
 * entry of the store is that entry's folder; anything else is a path, relative to `cwd`.
 */
export function resolveHandoverArgument(params: {
	argument: string
	store: string | undefined
	cwd: string
}): string {
	const entry = entryOfArgument(params)
	return entry ? entry.folder : resolve(params.cwd, params.argument)
}

/**
 * The entry an argument names (a word without a path separator): the entry of that name, else, for a number,
 * the newest entry of the worktree of that index (`0171` or `171`); undefined when it names none.
 */
export function entryOfArgument(params: {
	argument: string
	store: string | undefined
}): StoreEntry | undefined {
	const { argument, store } = params
	if (!store || isPathArgument(argument)) return undefined
	const named = readStoreEntry({ store, name: argument })
	if (named || !STORE_INDEX_ARGUMENT_PATTERN.test(argument)) return named
	return newestOfIndex({ entries: readStoreEntries(store), index: Number(argument) })
}

/** The newest entry of the worktree numbered `index`, ranked by name as `newestOfBranch` ranks. */
function newestOfIndex(params: {
	entries: readonly StoreEntry[]
	index: number
}): StoreEntry | undefined {
	return newestByName(
		params.entries.filter(function isOfIndex(entry) {
			return entry.index !== undefined && Number(entry.index) === params.index
		}),
	)
}

/** The name of `folder` in the store of the repository `root`; undefined when it has no entry there. */
export function registeredNameOf(params: { root: string; folder: string }): string | undefined {
	const store = findHandoverStore(params.root)
	return store && registeredEntryOf({ store, folder: params.folder })?.name
}

/**
 * Registers the hand-over just written in `folder` (state `pending`, written at `now`): its entry updated when
 * the folder has one already, else a new entry under the next free name. The name it is registered under.
 */
export function registerHandover(params: {
	root: string
	folder: string
	branch: string
	now: Date
	/** Called between the pick of the name and the write of the entry. */
	afterNamePicked?: InterleavingSeam
}): string {
	const store = handoverStoreOf(params.root)
	const index = worktreeIndexOf(params.root)
	const entry: HandoverStoreEntry = {
		folder: params.folder,
		branch: params.branch,
		worktree: params.root,
		...(index && { index }),
		written: params.now.toISOString(),
		state: 'pending',
	}
	const registered = registeredEntryOf({ store, folder: params.folder })
	if (registered) {
		writeStoreEntry({ store, name: registered.name, entry })
		return registered.name
	}
	mkdirSync(store, { recursive: true })
	let seam = params.afterNamePicked
	// another worktree may take the same name meanwhile: the entry is created only where none exists
	for (;;) {
		const name = nextHandoverName({ store, branch: params.branch, now: params.now })
		seam?.()
		seam = undefined
		if (createStoreEntry({ store, name, entry })) return name
	}
}

/** Records `state` in the entry of `folder` in `store`; a folder without an entry is left unregistered. */
export function recordHandoverState(params: {
	store: string | undefined
	folder: string
	state: HandoverEntryState
}): void {
	if (!params.store) return
	const registered = registeredEntryOf({ store: params.store, folder: params.folder })
	if (!registered) return
	const { name, ...entry } = registered
	writeStoreEntry({ store: params.store, name, entry: { ...entry, state: params.state } })
}

/** The newest entry of `branch` among `entries`: the latest date, then the highest counter, from the name. */
export function newestOfBranch(params: {
	entries: readonly StoreEntry[]
	branch: string
}): StoreEntry | undefined {
	return newestByName(params.entries.filter((entry) => entry.branch === params.branch))
}

/** The newest of `entries` by name: the latest date, then the highest counter after its branch's slug. */
function newestByName(entries: readonly StoreEntry[]): StoreEntry | undefined {
	return entries.reduce<StoreEntry | undefined>(function newer(newest, entry) {
		if (!newest) return entry
		const [candidate, current] = [
			storeNameRank({ name: entry.name, branch: entry.branch }),
			storeNameRank({ name: newest.name, branch: newest.branch }),
		]
		if (candidate.date !== current.date) return candidate.date > current.date ? entry : newest
		return candidate.counter > current.counter ? entry : newest
	}, undefined)
}

/** Creates the entry `name`, never over one: false when it exists already (taken by another writer). */
function createStoreEntry(params: {
	store: string
	name: string
	entry: HandoverStoreEntry
}): boolean {
	try {
		writeFileSync(entryPathOf(params), entryText(params.entry), { flag: 'wx' })
		return true
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false
		throw error
	}
}

function entryText(entry: HandoverStoreEntry): string {
	return `${JSON.stringify(entry, null, 2)}\n`
}

function writeStoreEntry(params: { store: string; name: string; entry: HandoverStoreEntry }): void {
	mkdirSync(params.store, { recursive: true })
	writeFileSync(entryPathOf(params), entryText(params.entry))
}

/**
 * Where a name sorts among the names of its branch: its date, and its counter after the branch's slug (1
 * when it has none). A name of another shape sorts before every dated one.
 */
function storeNameRank(params: { name: string; branch: string }): StoreNameRank {
	const date = params.name.slice(0, 10)
	if (!STORE_NAME_DATE_PATTERN.test(date)) return { date: '', counter: 0 }
	const rest = params.name.slice(`${date}-${branchSlug(params.branch)}`.length)
	const counter = STORE_NAME_COUNTER_PATTERN.exec(rest)
	return { date, counter: rest === '' ? 1 : counter ? Number(counter[1]) : 0 }
}

/** The branch as a name part: every run of characters outside `[A-Za-z0-9._-]` one `-`, none at either end. */
function branchSlug(branch: string): string {
	return branch.replace(STORE_NAME_REPLACED_CHARACTERS, '-').replace(STORE_NAME_EDGE_DASHES, '')
}

/** `yyyy-mm-dd` of the local date. */
function localDate(now: Date): string {
	const month = String(now.getMonth() + 1).padStart(2, '0')
	const day = String(now.getDate()).padStart(2, '0')
	return `${now.getFullYear()}-${month}-${day}`
}
