import { existsSync, realpathSync } from 'node:fs'
import { dirname, join, posix, win32 } from 'node:path'

import { tryReadGit } from '../git.ts'
import { GIT_ENTRY } from '../store/store.constants.ts'
import { CASE_FOLDING_PLATFORMS, FILE_URL_DRIVE, FILE_URL_SCHEME } from './config.constants.ts'
import { hostAndPathOf, normalizeRemote } from './normalize-remote.ts'

import type { RepoKey, RepoRemote } from './config.types.ts'

/** A path as the platform compares it: lower-cased where the file system ignores case (win32, darwin). */
export function comparablePathOf(params: { path: string; platform: NodeJS.Platform }): string {
	return CASE_FOLDING_PLATFORMS.includes(params.platform) ? params.path.toLowerCase() : params.path
}

/**
 * A written path in the platform's normal form (`win32.normalize` on win32, `posix.normalize` elsewhere: separators,
 * doubled and `.` segments), its trailing separator dropped unless it is the root, then as the platform compares it.
 */
function comparableWrittenPathOf(params: { path: string; platform: NodeJS.Platform }): string {
	const flavour = params.platform === 'win32' ? win32 : posix
	const normalized = flavour.normalize(params.path)
	const isRoot = normalized === flavour.parse(normalized).root
	const trimmed =
		!isRoot && normalized.endsWith(flavour.sep)
			? normalized.slice(0, -flavour.sep.length)
			: normalized
	return comparablePathOf({ path: trimmed, platform: params.platform })
}

/** The top level of the repository holding `folder`: the nearest folder up holding `.git`, else `folder` itself. */
function repositoryTopOf(folder: string): string {
	let current = folder
	while (!existsSync(join(current, GIT_ENTRY))) {
		const parent = dirname(current)
		if (parent === current) return folder
		current = parent
	}
	return current
}

/** The path a `file://` URL names, in the platform's form (`file:///C:/x` -> `C:\x` on win32). */
function pathOfFileUrl(params: { url: string; platform: NodeJS.Platform }): string {
	const path = decodeURIComponent(new URL(params.url).pathname)
	if (params.platform !== 'win32') return path
	return win32.normalize(path.replace(FILE_URL_DRIVE, '$1'))
}

/**
 * A `repos:` key or an origin in the form of a repository key: a local path or a `file://` URL as the platform
 * compares paths, else a normalized remote.
 */
export function normalizeRepoKey(params: { key: string; platform: NodeJS.Platform }): string {
	const { key, platform } = params
	if (FILE_URL_SCHEME.test(key))
		return comparableWrittenPathOf({ path: pathOfFileUrl({ url: key, platform }), platform })
	return isPathKey(key) ? comparableWrittenPathOf({ path: key, platform }) : normalizeRemote(key)
}

/** True for a key written as a local path (absolute, posix or win32). */
function isPathKey(key: string): boolean {
	return posix.isAbsolute(key) || win32.isAbsolute(key)
}

/**
 * The host of an origin `normalizeRepoKey` reads as a remote (lower-cased) and its form; undefined for a path, a
 * `file://` URL, or a remote written in no known form.
 */
function remoteOf(origin: string): RepoRemote | undefined {
	if (FILE_URL_SCHEME.test(origin) || isPathKey(origin)) return undefined
	const { host, form } = hostAndPathOf(origin)
	return form === undefined || host === '' ? undefined : { host: host.toLowerCase(), form }
}

/**
 * The key of the repository at `root` (D7): its `origin` remote normalized as a `repos:` key is (a local-path origin
 * compared as a path on that platform), shared by every clone and worktree; without one, the real path of its top
 * level, the nearest folder up holding `.git` (lower-cased on win32 and darwin; no process spawned for it). A real
 * path is already in the normal form of the machine, so only its case is folded. `remote` is the origin's host and
 * form when the origin is a real remote (never for a path or `file://` origin).
 */
export function repoKeyOf(params: { root: string; platform: NodeJS.Platform }): RepoKey {
	const origin = tryReadGit({ root: params.root, args: ['remote', 'get-url', 'origin'] })?.trim()
	if (origin) {
		const key = normalizeRepoKey({ key: origin, platform: params.platform })
		const remote = remoteOf(origin)
		return { key, from: 'remote', ...(remote !== undefined && { remote }) }
	}
	const path = repositoryTopOf(realpathSync(params.root))
	return { key: comparablePathOf({ path, platform: params.platform }), from: 'path' }
}
