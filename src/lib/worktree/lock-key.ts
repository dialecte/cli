/**
 * The lock key: what a tree's `package-lock.json` installs, blind to the package's own name, version and ranges.
 * Every check key reads it from the tree being checked, never from `node_modules`: whether `node_modules` installs
 * that lock is a precondition (`checkInstallMatchesTree`), not part of the key.
 */
import { createHash } from 'node:crypto'

import { NO_LOCK_KEY } from '../gate-records/gate-records.constants.ts'
import { readFilesAtRevision } from '../git.ts'
import { PACKAGE_LOCK_FILE, PACKAGE_LOCK_ROOT_ENTRY } from './worktree.constants.ts'

/**
 * The text of the `package-lock.json` of the package at `root` as `tree` holds it; undefined when it holds none.
 *
 * @intent read the lock a check runs against from the tree it checks
 * @internal
 */
export function readTreeLockText(params: { root: string; tree: string }): string | undefined {
	return readFilesAtRevision({
		root: params.root,
		revision: params.tree,
		files: [PACKAGE_LOCK_FILE],
	}).get(PACKAGE_LOCK_FILE)
}

/**
 * The lock key of the package at `root` in `tree` (`computeLockKey` of `readTreeLockText`).
 *
 * @intent key a check on the dependencies the checked tree locks
 * @internal
 */
export function computeTreeLockKey(params: { root: string; tree: string }): string {
	return computeLockKey({ text: readTreeLockText(params) })
}

/**
 * sha256 (hex) of a lock's `packages` object without the package's own entry (`""`), its entries and each entry's
 * fields in stable (sorted) key order, the top fields (name, version, lockfileVersion, requires) dropped; a text that
 * is no JSON or holds no `packages` object keys on its bytes; `none` without a lock.
 *
 * @intent compare two locks by what they install
 * @internal
 */
export function computeLockKey(params: { text: string | undefined }): string {
	const { text } = params
	if (text === undefined) return NO_LOCK_KEY
	const packages = readPackages(text)
	if (packages === undefined) return sha256(text)
	const installed = Object.entries(packages).filter(([key]) => key !== PACKAGE_LOCK_ROOT_ENTRY)
	return sha256(JSON.stringify(sortedKeys(Object.fromEntries(installed))))
}

/** The `packages` object of a lock's text; undefined when it is no JSON or holds no such object. */
function readPackages(text: string): object | undefined {
	try {
		const parsed: unknown = JSON.parse(text)
		if (typeof parsed !== 'object' || parsed === null || !('packages' in parsed)) return undefined
		const { packages } = parsed
		return typeof packages === 'object' && packages !== null && !Array.isArray(packages)
			? packages
			: undefined
	} catch {
		return undefined
	}
}

/** `value` with the keys of every object, at every depth, in sorted order. */
function sortedKeys(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(sortedKeys)
	if (typeof value !== 'object' || value === null) return value
	return Object.fromEntries(
		Object.entries(value)
			.sort(([first], [second]) => (first < second ? -1 : first > second ? 1 : 0))
			.map(([key, inner]) => [key, sortedKeys(inner)]),
	)
}

function sha256(data: string): string {
	return createHash('sha256').update(data).digest('hex')
}
