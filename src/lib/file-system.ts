/** What is on disk at a path: whether something is there, where its links lead. */
import { lstatSync, realpathSync, statSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

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

/** A path with its links resolved; as it is when it does not exist. */
export function realPathOf(path: string): string {
	try {
		return realpathSync(path)
	} catch {
		return path
	}
}

/**
 * The real path of an absolute path that may not exist yet: its own when it exists, else the real path of its
 * nearest existing ancestor joined with the rest (a folder about to be made under a link).
 */
export function realPathThroughAncestors(path: string): string {
	const missing: string[] = []
	let existing = path
	while (!isPresent(existing) && dirname(existing) !== existing) {
		missing.unshift(basename(existing))
		existing = dirname(existing)
	}
	return join(realPathOf(existing), ...missing)
}
