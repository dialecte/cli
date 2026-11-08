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
 * The blob ids git would commit for paths: one `git hash-object --stdin-paths` (its clean filters applied) for
 * every file, and for a link its target text through `hash-object --stdin` (`hash-object` follows a link, and
 * fails on one to a folder).
 */
export function gitBlobIds(params: { root: string; files: readonly string[] }): string[] {
	const linked = params.files.filter((file) => lstatSync(join(params.root, file)).isSymbolicLink())
	const plain = params.files.filter((file) => !linked.includes(file))
	const plainIds = plain.length
		? runHashObject({ root: params.root, args: ['--stdin-paths'], input: `${plain.join('\n')}\n` })
		: []
	const ids = new Map(plain.map((file, index) => [file, plainIds[index]]))
	for (const file of linked)
		ids.set(
			file,
			runHashObject({
				root: params.root,
				args: ['--stdin'],
				input: readlinkSync(join(params.root, file)),
			})[0],
		)
	return params.files.map((file) => ids.get(file) ?? '')
}

/** The ids `git hash-object` prints, one per line. */
function runHashObject(params: { root: string; args: string[]; input: string }): string[] {
	const result = spawnSync('git', ['hash-object', ...params.args], {
		cwd: params.root,
		encoding: 'utf8',
		input: params.input,
		maxBuffer: Number.POSITIVE_INFINITY,
	})
	if (result.status !== 0)
		throw new Error(`git hash-object ${params.args.join(' ')}: ${result.stderr.trim()}`)
	return result.stdout.split('\n').filter(Boolean)
}
