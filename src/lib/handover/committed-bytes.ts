import { spawnSync } from 'node:child_process'
import { lstatSync, readFileSync, readlinkSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The bytes git commits for a path: a file's content, or a symbolic link's target text (a link to a folder is
 * committed as a link, never followed).
 */
export function readCommittedBytes(path: string): Buffer {
	return lstatSync(path).isSymbolicLink() ? Buffer.from(readlinkSync(path)) : readFileSync(path)
}

/**
 * The blob ids git would commit for paths: `git hash-object` (its clean filters applied) for files, and for a link
 * its target text through `hash-object --stdin` (`hash-object` follows a link, and fails on one to a folder).
 */
export function gitBlobIds(params: { root: string; files: readonly string[] }): string[] {
	return params.files.map(function blobIdOf(file: string): string {
		const path = join(params.root, file)
		const linked = lstatSync(path).isSymbolicLink()
		const result = spawnSync(
			'git',
			linked ? ['hash-object', '--stdin'] : ['hash-object', '--', file],
			{
				cwd: params.root,
				encoding: 'utf8',
				input: linked ? readlinkSync(path) : undefined,
			},
		)
		if (result.status !== 0) throw new Error(`git hash-object ${file}: ${result.stderr.trim()}`)
		return result.stdout.trim()
	})
}
