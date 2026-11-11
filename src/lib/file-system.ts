/** What is on disk at a path: whether something is there, where its links lead. */
import { lstatSync, realpathSync, statSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, sep } from 'node:path'

/** `path` is `folder` or lies inside it, both compared as given (resolve them first when links may differ). */
export function isAtOrInside(params: { path: string; folder: string }): boolean {
	const fromFolder = relative(params.folder, params.path)
	return (
		fromFolder === '' ||
		(fromFolder !== '..' && !fromFolder.startsWith(`..${sep}`) && !isAbsolute(fromFolder))
	)
}

/** `isAtOrInside` by real paths: links resolved, spelled as on disk. */
export function isAtOrInsideReal(params: { path: string; folder: string }): boolean {
	return isAtOrInside({ path: realPathOf(params.path), folder: realPathOf(params.folder) })
}

/** Something at the path, a dangling link included. */
export function isPresent(path: string): boolean {
	try {
		lstatSync(path)
		return true
	} catch {
		return false
	}
}

/** A folder at the path (through its links); false when nothing is there or it is a file. */
export function isFolder(path: string): boolean {
	try {
		return statSync(path).isDirectory()
	} catch {
		return false
	}
}

/**
 * A path with its links resolved, spelled as on disk (on a case-insensitive volume, `repo/src` answers `Repo/Src`:
 * two spellings of one folder compare equal); as it is when it does not exist.
 */
export function realPathOf(path: string): string {
	try {
		return realpathSync.native(path)
	} catch {
		return path
	}
}

/**
 * A path with its links resolved and, on a file system that folds case, each name in the case the folder holds it
 * (`REPO` for a folder `repo`); as it is when it does not exist.
 */
export function onDiskPathOf(path: string): string {
	try {
		return realpathSync.native(path)
	} catch {
		return path
	}
}

/**
 * The real path of an absolute path that may not exist yet: its own when it exists, else the real path of its
 * nearest existing ancestor joined with the rest (a folder about to be made under a link).
 */
export function realPathThroughAncestors(path: string): string {
	const { existing, missing } = nearestPresentOf(path)
	return join(realPathOf(existing), ...missing)
}

/**
 * The symbolic link to nothing an absolute path leads through: the path itself or its nearest existing ancestor
 * when that is a link whose target does not exist; undefined otherwise. A folder made at the path would be made
 * where the link points.
 */
export function danglingLinkOf(path: string): string | undefined {
	const { existing } = nearestPresentOf(path)
	if (!lstatSync(existing, { throwIfNoEntry: false })?.isSymbolicLink()) return undefined
	return statSync(existing, { throwIfNoEntry: false }) ? undefined : existing
}

/** The nearest entry of `path` or its ancestors that is present (a dangling link included), and the names below it. */
function nearestPresentOf(path: string): { existing: string; missing: string[] } {
	const missing: string[] = []
	let existing = path
	while (!isPresent(existing) && dirname(existing) !== existing) {
		missing.unshift(basename(existing))
		existing = dirname(existing)
	}
	return { existing, missing }
}
