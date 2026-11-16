/**
 * What `git worktree remove` would delete of a worktree's ignored entries that nothing else holds. Git's listing
 * alone cannot decide: an ignored folder holding no tracked file is printed once (`!! .dialecte/`), one holding a
 * tracked file has its ignored entries printed one by one, so every entry is classified on disk, walked with
 * `lstat` (a link is never followed) and never read inside a rebuilt folder (a `node_modules` holds thousands of
 * files).
 */
import { lstatSync, readdirSync, readFileSync, readlinkSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'

import { resolveTargets } from '../config.ts'
import { isAtOrInside, realPathOf } from '../file-system.ts'
import { readHooksFolder } from '../git-hooks.ts'
import { readGit } from '../git.ts'
import { readStoreEntries } from '../handover/handover-store-read.ts'
import { findHandoverStore } from '../handover/handover-store.ts'
import { ARCHIVED_LOT_FILE } from '../handover/handover.constants.ts'
import { isEmptyDeclaration } from '../handover/is-empty-declaration.ts'
import { readLanding } from '../handover/land-record.ts'
import { readPackageJson } from '../package-json.ts'
import { packageRootOf } from '../package-root.ts'
import { LOT_LINK_SEGMENTS } from '../store/store.constants.ts'
import {
	LOT_FILE,
	REBUILT_IGNORED_FOLDERS,
	REBUILT_IGNORED_NAMES,
} from '../worktree/worktree.constants.ts'
import {
	CURRENT_FOLDER_PREFIX,
	IGNORED_ENTRY_PREFIX,
	IGNORED_STATUS_ARGUMENTS,
	NESTED_INSTALL_FOLDER,
	PACKAGE_MANIFEST,
	PYTHON_REBUILT_FOLDERS,
	STATUS_WITH_ORIGINAL_PATH,
} from './removable-ignored.constants.ts'

import type { StoreEntry } from '../handover/handover.types.ts'
import type {
	DeclaredRebuilt,
	IgnoredWalk,
	RemovableIgnoredParameters,
	RemovableIgnoredResult,
} from './removable-ignored.types.ts'
import type { Stats } from 'node:fs'

/**
 * For one worktree, the ignored entries `git worktree remove` would delete that are not kept elsewhere: rebuilt
 * folders and names, folders the package declares rebuilt, `.dialecte/` views and empty or archived declarations,
 * and files byte-equal (mode included) to the main checkout's. What is left is what keeps the worktree.
 */
export function removableIgnored(params: RemovableIgnoredParameters): RemovableIgnoredResult {
	const { worktree, main } = params
	const hooksFolder =
		params.hooksFolder === undefined
			? (readHooksFolder(worktree).configured ?? null)
			: params.hooksFolder
	// bytes compared as they are: a text handed in is its UTF-8 bytes
	const archivedDeclarations = (
		params.archivedDeclarations ?? readArchivedDeclarations(worktree)
	).map((declaration) => (typeof declaration === 'string' ? Buffer.from(declaration) : declaration))
	const walk: IgnoredWalk = {
		worktree,
		realWorktree: realPathOf(worktree),
		main: resolve(main),
		archivedDeclarations,
		rebuiltFolders: rebuiltFoldersOf({ worktree, hooksFolder }),
		declaredByFolder: new Map(),
	}
	const lines = params.ignoredLines ?? readIgnoredLines(worktree)
	const kept = ignoredPathsOf(lines).flatMap(function keptOfEntry(path) {
		return keptUnder({ walk, path })
	})
	return { kept: [...new Set(kept)].sort() }
}

/** Git's status entries of the worktree, NUL-separated. */
function readIgnoredLines(worktree: string): string[] {
	return readGit({ root: worktree, args: [...IGNORED_STATUS_ARGUMENTS] })
		.split('\0')
		.filter(Boolean)
}

/** The ignored entries' paths, without a folder's trailing `/`; a rename's original path is never read as one. */
function ignoredPathsOf(lines: readonly string[]): string[] {
	const paths: string[] = []
	for (let index = 0; index < lines.length; index++) {
		const line = lines[index]
		if (line.startsWith(IGNORED_ENTRY_PREFIX)) {
			const path = line.slice(IGNORED_ENTRY_PREFIX.length).replace(/\/$/, '')
			if (path) paths.push(path)
		} else if (STATUS_WITH_ORIGINAL_PATH.some((letter) => line.slice(0, 2).includes(letter)))
			index++
	}
	return paths
}

/** The rebuilt folders at the worktree root, and the hooks folder when it lies in the worktree, each ending with `/`. */
function rebuiltFoldersOf(params: { worktree: string; hooksFolder: string | null }): string[] {
	const { worktree, hooksFolder } = params
	const hooks =
		hooksFolder && isAbsolute(hooksFolder) ? relative(worktree, hooksFolder) : hooksFolder
	const inWorktree = hooks && !hooks.startsWith('..') && !isAbsolute(hooks)
	return [...REBUILT_IGNORED_FOLDERS, ...(inWorktree ? [`${hooks.replace(/\/$/, '')}/`] : [])]
}

/** The archived declarations of the worktree, read from its repository's registry; none outside a repository. */
function readArchivedDeclarations(worktree: string): Buffer[] {
	const store = findHandoverStore(worktree)
	return store ? archivedDeclarationsOf({ worktree, entries: readStoreEntries(store) }) : []
}

/**
 * The bytes of the `lot.json` archived in each committed hand-over folder among `entries` (a registry read once)
 * registered for this worktree, compared by real path. A lot landed through its pull request (`landing.json` in its
 * folder) archives nothing before `lot close`, which archives the worktree's own declaration before the move
 * (`archiveLandedDeclaration`): its bytes count as archived.
 */
export function archivedDeclarationsOf(params: {
	worktree: string
	entries: readonly StoreEntry[]
}): Buffer[] {
	const worktreeReal = realPathOf(params.worktree)
	return params.entries
		.filter(function isCommittedHere(entry) {
			return entry.state === 'committed' && realPathOf(entry.worktree) === worktreeReal
		})
		.flatMap(function archivedOf(entry): Buffer[] {
			const archived = readOrUndefined(join(entry.folder, ARCHIVED_LOT_FILE))
			if (archived) return [archived]
			if (!isOwnLandedDeclaration({ worktree: params.worktree, folder: entry.folder })) return []
			// a landed lot: its own declaration, archived by the close before the move
			const own = readOrUndefined(join(params.worktree, LOT_FILE))
			return own ? [own] : []
		})
}

/**
 * Whether the worktree's `.dialecte/lot.json` is the declaration of the landed lot whose folder is `folder`: the lot
 * landed through its pull request (`landing.json` there) and the worktree's `.dialecte/lot` link resolves to that
 * folder. A link to another lot (new work started in the worktree after the landing), or none, says no.
 *
 * @intent tell a landed lot's own declaration from new work's
 * @internal
 */
export function isOwnLandedDeclaration(params: { worktree: string; folder: string }): boolean {
	if (readLanding({ lotFolder: params.folder }) === undefined) return false
	const link = join(params.worktree, ...LOT_LINK_SEGMENTS)
	const target = realPathOf(link)
	return target !== link && target === realPathOf(params.folder)
}

/** The paths under `path` (relative to the worktree) that keep the worktree: files and links, a folder never entered. */
function keptUnder(params: { walk: IgnoredWalk; path: string }): string[] {
	const { walk, path } = params
	// an entry inside a rebuilt folder goes without a look on disk
	if (walk.rebuiltFolders.some((folder) => path.startsWith(folder))) return []
	const status = lstatOrUndefined(join(walk.worktree, path))
	// gone since git listed it: nothing left to lose
	if (!status) return []
	const isFolder = status.isDirectory()
	const spelled = isFolder ? `${path}/` : path
	if (walk.rebuiltFolders.some((folder) => spelled.startsWith(folder))) return []
	if (REBUILT_IGNORED_NAMES.some((name) => basename(path) === name)) return []
	const segments = path.split('/')
	const dialecteIndex = segments.indexOf(LOT_LINK_SEGMENTS[0])
	if (dialecteIndex >= 0)
		return keptInDialecteFolder({
			walk,
			path,
			status,
			inside: segments.slice(dialecteIndex + 1).join('/'),
		})
	if (isDeclaredRebuilt({ walk, path, spelled })) return []
	if (isInToolRebuiltFolder({ walk, path, isFolder })) return []
	// a rebuilt folder below the root: kept as a whole, never read
	if (isFolder && REBUILT_IGNORED_FOLDERS.some((folder) => `/${spelled}`.endsWith(`/${folder}`)))
		return [spelled]
	if (isFolder) return keptInFolder({ walk, path })
	return isCopyOfMain({ walk, path, status }) ? [] : [path]
}

/**
 * An entry of a `.dialecte` folder (`inside` its path below that folder): the `lot` link is a view, an empty
 * declaration or one archived by a committed hand-over of this worktree is removable; anything else keeps, the
 * main checkout's copy included. `.dialecte` itself as a link keeps, never entered.
 */
function keptInDialecteFolder(params: {
	walk: IgnoredWalk
	path: string
	status: Stats
	inside: string
}): string[] {
	const { walk, path, status, inside } = params
	if (status.isDirectory()) return keptInFolder({ walk, path })
	if (inside === LOT_LINK_SEGMENTS[1] && status.isSymbolicLink()) return []
	if (
		inside === basename(LOT_FILE) &&
		status.isFile() &&
		isRemovableDeclaration({ walk, file: join(walk.worktree, path) })
	)
		return []
	return [path]
}

/** A `lot.json` that declares nothing, or byte-equal to an archived declaration. */
function isRemovableDeclaration(params: { walk: IgnoredWalk; file: string }): boolean {
	const bytes = readOrUndefined(params.file)
	if (!bytes) return false
	return (
		isEmptyDeclaration(bytes.toString('utf8')) ||
		params.walk.archivedDeclarations.some((archived) => archived.equals(bytes))
	)
}

/** Every entry of the folder classified; a folder that cannot be read keeps, named. */
function keptInFolder(params: { walk: IgnoredWalk; path: string }): string[] {
	const { walk, path } = params
	let names: string[]
	try {
		names = readdirSync(join(walk.worktree, path))
	} catch {
		return [`${path}/`]
	}
	return names.flatMap(function keptOfChild(name) {
		return keptUnder({ walk, path: `${path}/${name}` })
	})
}

/**
 * The entry lies in a folder the package nearest it in the main checkout declares rebuilt (`dialecte.rebuiltIgnored`
 * of its package.json, matched from that package root).
 */
function isDeclaredRebuilt(params: { walk: IgnoredWalk; path: string; spelled: string }): boolean {
	const { walk, spelled } = params
	const parent = dirname(params.path) === '.' ? '' : dirname(params.path)
	const declared = declaredRebuiltOf({ walk, folder: parent })
	const fromPackage = declared.packageRoot
		? spelled.slice(declared.packageRoot.length + 1)
		: spelled
	return declared.folders.some((folder) => fromPackage.startsWith(folder))
}

/** What the package nearest `folder` declares, read once per folder. */
function declaredRebuiltOf(params: { walk: IgnoredWalk; folder: string }): DeclaredRebuilt {
	const { walk, folder } = params
	const known = walk.declaredByFolder.get(folder)
	if (known) return known
	const declared = readDeclaredRebuilt({ main: walk.main, folder })
	walk.declaredByFolder.set(folder, declared)
	return declared
}

/** The package of the main checkout nearest `folder`, up to the main checkout, and its valid declared folders. */
function readDeclaredRebuilt(params: { main: string; folder: string }): DeclaredRebuilt {
	const { main } = params
	const root = packageRootOf(join(main, params.folder))
	if (!root || !isAtOrInside({ path: root, folder: main })) return { packageRoot: '', folders: [] }
	const packageRoot = relative(main, root)
	let declared: unknown
	try {
		declared = readPackageJson(root).dialecte?.rebuiltIgnored
	} catch {
		// a package.json that does not parse declares nothing
		return { packageRoot, folders: [] }
	}
	return {
		packageRoot,
		folders: [
			...(Array.isArray(declared) ? declared.filter(isValidDeclaredFolder) : []),
			...readCoverageOutFolders(root),
		],
	}
}

/**
 * The coverage outDir of each version the cli discovers in the main checkout's package at `root` (core's in core
 * only), relative to it and ending with `/`; an outDir that is not a valid folder below the package root is none,
 * and a package.json the discovery cannot read gives none.
 */
function readCoverageOutFolders(root: string): string[] {
	let outDirs: string[]
	try {
		outDirs = resolveTargets([], root).map((target) => target.outDir)
	} catch {
		// a package.json that does not parse: no outDir is proven
		return []
	}
	return outDirs.map(packageFolderOf).filter(isValidDeclaredFolder)
}

/** An outDir as the cli spells it (`./benchmarks/types/v1/generated`), as a folder of the package (`benchmarks/types/v1/generated/`). */
function packageFolderOf(outDir: string): string {
	const folder = outDir.startsWith(CURRENT_FOLDER_PREFIX)
		? outDir.slice(CURRENT_FOLDER_PREFIX.length)
		: outDir
	return folder.endsWith('/') ? folder : `${folder}/`
}

/** A folder relative to its package root, ending with `/`, with no empty, `.` or `..` part: never wider. */
function isValidDeclaredFolder(entry: unknown): entry is string {
	if (typeof entry !== 'string' || !entry.endsWith('/') || isAbsolute(entry)) return false
	return entry
		.slice(0, -1)
		.split('/')
		.every((part) => part !== '' && part !== '.' && part !== '..')
}

/**
 * The entry is, or lies in, a folder a tool rebuilds wherever it sits: a python `.venv/` or `.pytest_cache/`, or a
 * `node_modules/` whose parent folder in the worktree holds a package.json file that parses. Only real folders count
 * (a link of that name is never one); the entry itself is checked only when it is a folder.
 */
function isInToolRebuiltFolder(params: {
	walk: IgnoredWalk
	path: string
	isFolder: boolean
}): boolean {
	const { walk, path, isFolder } = params
	const segments = path.split('/')
	const depth = isFolder ? segments.length : segments.length - 1
	for (let length = 1; length <= depth; length++) {
		if (
			isToolRebuiltFolder({ worktree: walk.worktree, folder: segments.slice(0, length).join('/') })
		)
			return true
	}
	return false
}

/**
 * The folder (relative to the worktree) is a python one, or a nested install folder beside a package.json file that
 * parses; a real folder either way. Read for each entry: git lists a rebuilt folder's entries one by one only when it
 * holds a tracked file, and a walk never enters one.
 */
function isToolRebuiltFolder(params: { worktree: string; folder: string }): boolean {
	const { worktree, folder } = params
	const name = basename(folder)
	const isPython = PYTHON_REBUILT_FOLDERS.some((python) => python === name)
	if (!isPython && name !== NESTED_INSTALL_FOLDER) return false
	if (!lstatOrUndefined(join(worktree, folder))?.isDirectory()) return false
	if (isPython) return true
	return holdsParsedManifest(join(worktree, dirname(folder)))
}

/** The folder holds a package.json that is a file (never a link nor a folder) and parses. */
function holdsParsedManifest(folder: string): boolean {
	const manifest = join(folder, PACKAGE_MANIFEST)
	if (!lstatOrUndefined(manifest)?.isFile()) return false
	const bytes = readOrUndefined(manifest)
	if (!bytes) return false
	try {
		JSON.parse(bytes.toString('utf8'))
		return true
	} catch {
		// a package.json that does not parse rebuilds nothing
		return false
	}
}

/** A file or link byte-equal to the same path in the main checkout: a file's mode included, a link by its text. */
function isCopyOfMain(params: { walk: IgnoredWalk; path: string; status: Stats }): boolean {
	const { walk, path, status } = params
	const own = join(walk.worktree, path)
	const copy = join(walk.main, path)
	const copyStatus = lstatOrUndefined(copy)
	if (!copyStatus) return false
	// reached through a link of the main checkout into the worktree: the worktree's own entry, no copy
	if (copyStatus.dev === status.dev && copyStatus.ino === status.ino) return false
	if (
		isAtOrInside({
			path: join(realPathOf(dirname(copy)), basename(copy)),
			folder: walk.realWorktree,
		})
	)
		return false
	try {
		if (status.isSymbolicLink())
			return (
				copyStatus.isSymbolicLink() &&
				readlinkSync(own, { encoding: 'buffer' }).equals(readlinkSync(copy, { encoding: 'buffer' }))
			)
		return (
			status.isFile() &&
			copyStatus.isFile() &&
			status.mode === copyStatus.mode &&
			status.size === copyStatus.size &&
			readFileSync(own).equals(readFileSync(copy))
		)
	} catch {
		// unreadable: nothing proves it is a copy
		return false
	}
}

/** What is at the path itself (a link not followed), or undefined when nothing is there or it cannot be read. */
function lstatOrUndefined(path: string): Stats | undefined {
	try {
		return lstatSync(path)
	} catch {
		return undefined
	}
}

/** The file's bytes, or undefined when it cannot be read (gone, a folder, no permission). */
function readOrUndefined(path: string): Buffer | undefined {
	try {
		return readFileSync(path)
	} catch {
		return undefined
	}
}
