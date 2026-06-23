/**
 * Resolve an external tool binary the CLI shells out to (tsc, oxfmt).
 *
 * The CONSUMER's copy wins — `<root>/node_modules/.bin/<name>` (the settings at hand: its pinned
 * version and the config oxfmt/tsc auto-discovers). Only if the project doesn't have it do we fall
 * back to the CLI's OWN installed copy of `pkg`, resolved wherever npm put it (hoisted or nested).
 * Returns the path + which source it came from, or null when neither is available.
 */
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const requireHere = createRequire(import.meta.url)

/** The CLI's own copy of `pkg`'s `binName`, via Node resolution from this package. */
function ownBin(pkg: string, binName: string): string | undefined {
	try {
		const pjPath = requireHere.resolve(`${pkg}/package.json`)
		const bin = JSON.parse(readFileSync(pjPath, 'utf8')).bin
		const rel = typeof bin === 'string' ? bin : (bin?.[binName] ?? bin?.[pkg])
		const abs = rel ? join(dirname(pjPath), rel) : undefined
		return abs && existsSync(abs) ? abs : undefined
	} catch {
		return undefined
	}
}

export type ResolvedBin = { path: string; source: 'consumer' | 'own' }

/** Consumer's `node_modules/.bin/<name>` first; otherwise the CLI's own copy of `pkg`. */
export function resolveBin(name: string, pkg: string, root: string): ResolvedBin | null {
	const consumer = join(root, 'node_modules/.bin', name)
	if (existsSync(consumer)) return { path: consumer, source: 'consumer' }
	const own = ownBin(pkg, name)
	return own ? { path: own, source: 'own' } : null
}
