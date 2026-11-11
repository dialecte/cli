/**
 * The store of a repository (`<git common folder>/dialecte-lots/`) and its lot folders: the store found without git,
 * a lot folder built aside as `.<name>.tmp-<pid>/` then renamed whole, the leftovers of dead builders removed.
 */
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	renameSync,
	rmSync,
	statSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'

import { realPathOf } from '../file-system.ts'
import { registryOfCommonFolder } from '../handover/handover-store-read.ts'
import { readIdentity } from './identity.ts'
import { publishOnce, recordText, removeDeadLeftovers } from './publish.ts'
import {
	COMMONDIR_FILE,
	GIT_ENTRY,
	GITDIR_LINE_PATTERN,
	STORE_FILES,
	STORE_FOLDER,
	TEMPORARY_FOLDER_PATTERN,
	TEMPORARY_INFIX,
} from './store.constants.ts'
import { transitionPathOf } from './transitions.ts'

import type {
	LotFolderSeam,
	LotIdentity,
	LotIdentityEntry,
	RecordContent,
	StoreLocation,
	Transition,
} from './store.types.ts'

/**
 * The store of the repository `from` is in, found by walking up to the first `.git` entry and reading its
 * `gitdir` / `commondir` files: no git process. Undefined outside a repository.
 */
export function locateStore(params: { from: string }): StoreLocation | undefined {
	const gitFolder = gitFolderAbove(resolve(params.from))
	if (gitFolder === undefined) return undefined
	const commondir = join(gitFolder, COMMONDIR_FILE)
	const common = realPathOf(
		existsSync(commondir) ? resolve(gitFolder, readFileSync(commondir, 'utf8').trim()) : gitFolder,
	)
	return {
		common,
		store: join(common, STORE_FOLDER),
		registry: registryOfCommonFolder(common),
	}
}

/**
 * Builds the lot folder `<store>/<name>`: `.<name>.tmp-<pid>/` holding `brief.json`, `plan.md`, a simulated lot's
 * `scenario.json` and the first transition, then `identity.json` last, then renamed to `<name>`. False, nothing replaced, when `<name>`
 * exists. Leftover `.tmp-` folders of dead pids in `store` are removed first; a live pid's is kept.
 */
export function publishLotFolder(params: {
	store: string
	name: string
	/** The brief and the plan as read (bytes are published as they are). */
	brief: RecordContent
	plan: RecordContent
	/** A simulated lot's `scenario.json` text; none for a real lot. */
	scenario?: string
	firstTransition: Transition
	identity: LotIdentity
	/** Called with the temporary folder once everything but `identity.json` is in it. */
	beforeIdentity?: LotFolderSeam
	/** Called with the temporary folder once `identity.json` is in it, before the rename. */
	beforeRename?: LotFolderSeam
}): boolean {
	removeStoreLeftovers({ store: params.store })
	const lotFolder = join(params.store, params.name)
	if (existsSync(lotFolder)) return false
	const temporary = join(params.store, `.${params.name}${TEMPORARY_INFIX}${process.pid}`)
	// a folder of this pid is one this process left on an earlier failure: nobody else builds under its name
	rmSync(temporary, { recursive: true, force: true })
	mkdirSync(join(temporary, STORE_FILES.transitions), { recursive: true })
	publishRecord({ path: join(temporary, STORE_FILES.brief), text: params.brief })
	publishRecord({ path: join(temporary, STORE_FILES.plan), text: params.plan })
	if (params.scenario !== undefined)
		publishRecord({ path: join(temporary, STORE_FILES.scenario), text: params.scenario })
	publishRecord({
		path: transitionPathOf({ lotFolder: temporary, seq: params.firstTransition.seq }),
		text: recordText(params.firstTransition),
	})
	params.beforeIdentity?.(temporary)
	publishRecord({ path: join(temporary, STORE_FILES.identity), text: recordText(params.identity) })
	params.beforeRename?.(temporary)
	return renameIntoPlace({ temporary, lotFolder })
}

/** Removes the `.tmp-` folders of `store` whose builder's pid no process holds; a live builder's is kept. */
export function removeStoreLeftovers(params: { store: string }): void {
	removeDeadLeftovers({
		folder: params.store,
		pidOf: (name) => TEMPORARY_FOLDER_PATTERN.exec(name)?.[1],
		kind: 'folders',
	})
}

/**
 * The names of the lots of `store`: folders holding a readable `identity.json` that names them; a `.tmp-` folder
 * is none.
 */
export function listLotNames(params: {
	store: string
	/** Only the folders whose name starts with it; filtered before any identity is read. */
	prefix?: string
}): string[] {
	return listLotIdentities(params).map(function nameOf(entry) {
		return entry.name
	})
}

/**
 * The lots of `store` with their identities, each `identity.json` read once, sorted by name: folders holding a
 * readable identity that names them, a `.tmp-` folder none; with `prefix`, only the folders whose name starts with
 * it, filtered before any identity is read.
 */
export function listLotIdentities(params: { store: string; prefix?: string }): LotIdentityEntry[] {
	if (!existsSync(params.store)) return []
	const entries: LotIdentityEntry[] = []
	const names = readdirSync(params.store, { withFileTypes: true })
		.filter(function isCandidate(entry) {
			return (
				entry.isDirectory() &&
				entry.name.startsWith(params.prefix ?? '') &&
				!TEMPORARY_FOLDER_PATTERN.test(entry.name)
			)
		})
		.map(function nameOf(entry) {
			return entry.name
		})
		.sort()
	for (const name of names) {
		const identity = readIdentity({ lotFolder: join(params.store, name) })
		if (identity?.name === name) entries.push({ name, identity })
	}
	return entries
}

/** The folder `<store>/<name>` holds a readable identity naming it, and is no folder being built (`.tmp-`). */
export function namesItself(params: { store: string; name: string }): boolean {
	if (TEMPORARY_FOLDER_PATTERN.test(params.name)) return false
	return readIdentity({ lotFolder: join(params.store, params.name) })?.name === params.name
}

/**
 * The folder holding the first `.git` entry (a folder or a file) at or above `from`, or at or above its nearest
 * existing ancestor: the work tree it is in, found without git. Undefined outside every work tree.
 */
export function workTreeHolding(params: { from: string }): string | undefined {
	let current = resolve(params.from)
	while (!existsSync(current) && dirname(current) !== current) current = dirname(current)
	for (; ; current = dirname(current)) {
		if (entryKindOf(join(current, GIT_ENTRY)) !== undefined) return current
		if (dirname(current) === current) return undefined
	}
}

/** The git folder of the first `.git` entry at or above `folder`: the folder itself, or where a `.git` file points. */
export function gitFolderAbove(folder: string): string | undefined {
	const workTree = workTreeHolding({ from: folder })
	if (workTree === undefined) return undefined
	const entry = join(workTree, GIT_ENTRY)
	if (entryKindOf(entry) === 'folder') return entry
	const target = GITDIR_LINE_PATTERN.exec(readFileSync(entry, 'utf8'))?.[1]
	return target === undefined ? undefined : resolve(workTree, target)
}

function entryKindOf(path: string): 'folder' | 'file' | undefined {
	try {
		return statSync(path).isDirectory() ? 'folder' : 'file'
	} catch {
		return undefined
	}
}

/** Publishes a record of the lot folder being built: read-only, never over an existing file. */
function publishRecord(params: { path: string; text: RecordContent }): void {
	if (!publishOnce({ path: params.path, text: params.text, readOnly: true }))
		throw new Error(`${params.path} exists already in the lot folder being built`)
}

/** Renames the built folder to its name; false, the built folder removed, when the name exists meanwhile. */
function renameIntoPlace(params: { temporary: string; lotFolder: string }): boolean {
	if (!existsSync(params.temporary))
		throw new Error(`the temporary folder ${params.temporary} vanished before it was published`)
	if (existsSync(params.lotFolder)) {
		rmSync(params.temporary, { recursive: true, force: true })
		return false
	}
	try {
		renameSync(params.temporary, params.lotFolder)
		return true
	} catch (error) {
		const code = (error as NodeJS.ErrnoException).code
		if (code !== 'ENOTEMPTY' && code !== 'EEXIST') throw error
		rmSync(params.temporary, { recursive: true, force: true })
		return false
	}
}
