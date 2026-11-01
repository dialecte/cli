/** What is on disk at a path: whether something is there, where its links lead. */
import { lstatSync, realpathSync } from 'node:fs'

/** Something at the path, a dangling link included. */
export function isPresent(path: string): boolean {
	try {
		lstatSync(path)
		return true
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
