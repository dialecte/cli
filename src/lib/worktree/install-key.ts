/** The install key: what npm installed in a package, blind to the package's own name and version. */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { INSTALLED_LOCK_FILE, NO_INSTALLED_LOCK } from '../gate-records/gate-records.constants.ts'

/**
 * sha256 (hex) of the `packages` object of `<root>/node_modules/.package-lock.json`, its entries and each entry's
 * fields in stable (sorted) key order, the root fields (name, version, lockfileVersion, requires) dropped; a file
 * that is no JSON or holds no `packages` object keys on its bytes; `none` when the file is absent.
 */
export function computeInstallKey(root: string): string {
	const lockPath = join(root, INSTALLED_LOCK_FILE)
	if (!existsSync(lockPath)) return NO_INSTALLED_LOCK
	const bytes = readFileSync(lockPath)
	const packages = readPackages(bytes)
	return sha256(packages === undefined ? bytes : JSON.stringify(sortedKeys(packages)))
}

/** The `packages` object of a lock's bytes; undefined when they are no JSON or hold no such object. */
function readPackages(bytes: Buffer): object | undefined {
	try {
		const parsed: unknown = JSON.parse(bytes.toString('utf8'))
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

function sha256(data: string | Buffer): string {
	return createHash('sha256').update(data).digest('hex')
}
