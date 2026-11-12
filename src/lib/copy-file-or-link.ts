/**
 * Copying one file or symbolic link, git-free (no git, no child process in this module or what it imports): the
 * review rounds' snapshots and `lot export` share it.
 */
import {
	chmodSync,
	copyFileSync,
	lstatSync,
	mkdirSync,
	readlinkSync,
	rmSync,
	symlinkSync,
} from 'node:fs'
import { dirname } from 'node:path'

/** Copies a file or a symlink: bytes and permission bits, or the link with the same target. */
export function copyFileOrLink(params: { from: string; to: string }): void {
	mkdirSync(dirname(params.to), { recursive: true })
	const stats = lstatSync(params.from)
	if (isFileOrLink(params.to)) rmSync(params.to)
	if (stats.isSymbolicLink()) symlinkSync(readlinkSync(params.from), params.to)
	else {
		copyFileSync(params.from, params.to)
		chmodSync(params.to, stats.mode & 0o7777)
	}
}

/** Whether `path` is on disk as a file or a symlink (a folder is no file; a dangling symlink is one). */
export function isFileOrLink(path: string): boolean {
	try {
		return !lstatSync(path).isDirectory()
	} catch {
		return false
	}
}
